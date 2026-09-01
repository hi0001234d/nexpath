/**
 * Stop-driven submit decider (hook milestone H9 — owner ruling 2026-08-13).
 *
 * ── THE RULING ───────────────────────────────────────────────────────────────
 * "ALL the popups — including the Multi-prompt sequence — come AFTER the user
 * submits: old prompt cancelled, popup shown, user modifies/selects, THAT is
 * injected and submitted, and ONLY that runs."
 *
 * The previous submit decider hand-rolled a bare advisory popup (message +
 * options) and left PE at old timing. But Layer C's `nexpath stop` IS the
 * complete popup surface the user knows from the old flow and from Windsurf:
 * PE-first (MPS intake gate → MPS sequence popup → full PE popup), then the
 * Decision-Session advisory popup — with row consumption, delivery lineage,
 * feedback recording and the injected-prompt echo guard all handled inside.
 *
 * So the submit-time decision now RUNS `stop` inside the hook's hold and
 * translates its outcome:
 *
 *   stdout `{"decision":"block","reason":<text>}`  → persist the submit
 *     decision (the extension injects <text> and auto-submits) → 'block'
 *   anything else (skipped / shown / clipboard / crash / timeout) → 'allow'
 *
 * That stdout line is Layer C's own Claude-Code block contract — the SAME line
 * the extension's frozen `ipc.spawnStop` parses — so this module invents no
 * new protocol. `stop` sets `lastInjectedPrompt` itself on every block path,
 * which is exactly what the hooks' echo-skip and `auto`'s echo guard read.
 *
 * ── A1 DEVIATION, OWNER-RULED ────────────────────────────────────────────────
 * Amendment A1 kept LLM work off the submit path; `stop`'s advisory branch may
 * reach the engine. The owner's ruling explicitly relocates the FULL old
 * surface to submit time, accepting `stop`'s runtime inside the hold — the H4
 * budget still bounds the total, and a timeout fails open (A3).
 *
 * ── FAIL-OPEN (A3) ───────────────────────────────────────────────────────────
 * Every failure — spawn error, non-zero exit, malformed stdout, timeout,
 * persist failure — resolves 'allow': the original prompt is released.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, posix as posixPath, win32 as win32Path } from 'node:path';
import { isWindowsBatchShim } from '../../utils/batch-shim.js';
import { writeSubmitDecision, appendReplacementEcho, latestReplacementEchoAt } from './submit-decision-store.js';
import { log } from '../../logger.js';
// CONSUME-ONLY store calls (another member's exports), used exactly as stop.ts
// uses them — no Layer C file is modified.
import { openStore, closeStore } from '../../store/db.js';
import { getPendingAdvisory, markAdvisoryShown } from '../../store/pending-advisories.js';
// RC31: READ-ONLY diagnostic (see the no-block path below). Layer C read, same
// consume-only convention the sweep already uses; nothing here is mutated.
import {
  getActivePendingPromptSequence,
  deletePendingPromptSequencesForProject,
} from '../../store/pending-sequences.js';
import { getConfig } from '../../store/config.js';
import { PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY } from '../../config/prompt-enhancement-keys.js';
import {
  getPendingPromptEnhancement,
  markPromptEnhancementShown,
} from '../../store/pending-prompt-enhancements.js';

/** Vars the popup host needs that GUI-service hook spawns often strip. */
const SESSION_ENV_KEYS = [
  'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
  'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE', 'XDG_DATA_DIRS', 'XDG_CURRENT_DESKTOP',
  'LANG', 'TERM',
] as const;

/** `~/.nexpath/session-env.json` — written by the extension at activation.
 *  Duplicated in the extension (G-ROOTDIR wall); pinned by a contract test. */
export const SESSION_ENV_SNAPSHOT_FILENAME = 'session-env.json';

/**
 * RC35 (Ubuntu/Windsurf, 2026-08-21): fill ONLY the missing GUI-session vars
 * into the env the decider hands `stop`.
 *
 * ── THE MEASURED FAILURE ─────────────────────────────────────────────────────
 * On one machine, minutes apart: Cursor's hook popped and blocked
 * (its hook env carries the session — its own gate logs has_display/has_dbus
 * true), while every Windsurf submit ended `submit_stop_decider_done
 * stdout_len:0` — `stop` found rows to show and could not render ANY popup.
 * Reproduced exactly: run the hook with a sparse env → silent allow, on BOTH
 * the pre-sync 0.1.3 CLI and current — so not a regression, a host-env
 * difference. Same command with the full desktop env (ctty detached) → the
 * popup window spawns. Windsurf simply strips the GUI session from its hook
 * spawns; the popup host then resolves unavailable and stop has nothing it can
 * render.
 *
 * The extension runs INSIDE the editor GUI process, so it knows the real
 * session env; it snapshots the whitelisted vars to `~/.nexpath/` at
 * activation. This fills gaps from that snapshot — NEVER overriding anything
 * the hook env already has, linux-only, fail-open on every error (missing or
 * corrupt snapshot ⇒ exactly today's env). Cursor's env is already complete,
 * so this is a no-op there; with the switch off this decider never runs, so
 * the old flow is untouched by construction.
 */
export function enrichSpawnEnvFromSessionSnapshot(
  base: NodeJS.ProcessEnv,
  deps: {
    platform?: NodeJS.Platform;
    readSnapshot?: () => string;
  } = {},
): NodeJS.ProcessEnv {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'linux') return base;
  try {
    const read = deps.readSnapshot
      ?? (() => readFileSync(join(homedir(), '.nexpath', SESSION_ENV_SNAPSHOT_FILENAME), 'utf8'));
    const snap = JSON.parse(read()) as Record<string, unknown>;
    const out: NodeJS.ProcessEnv = { ...base };
    let filled = false;
    for (const k of SESSION_ENV_KEYS) {
      const have = out[k];
      const v = snap[k];
      if ((have === undefined || have === '') && typeof v === 'string' && v.length > 0) {
        out[k] = v;
        filled = true;
      }
    }
    return filled ? out : base;
  } catch {
    return base; // no snapshot / unreadable / corrupt — today's behaviour exactly
  }
}

/**
 * RC45 (Windows-Cursor investigation handover, 2026-08-22): make sure the env
 * handed to the `stop` child can resolve a bare `node`.
 *
 * Layer C's popup hosts spawn their windows with a BARE `node` on every OS
 * (`TtySelectFn.ts` — win32 `cmd start … node <script>`, linux
 * `gnome-terminal -- node <script>`, …). That resolves via the CHILD's PATH —
 * and Cursor spawns hooks with a sanitized PATH that may not contain node at
 * all (the exact ENOENT class RC25 fixed for the hook command itself, one
 * layer shallower). On such a machine the popup console flashes and dies, the
 * decider fails open, and the user reports "no popup" with a perfectly
 * registered hook.
 *
 * Set-if-missing: when node's own directory is already on PATH this returns
 * the env UNCHANGED (byte-identical spawn for every machine that works
 * today). NEW-FLOW spawns only — the old flow's `handle` spawn env is pinned
 * byte-identical and is deliberately not touched.
 */
export function ensureNodeDirOnPath(
  env: NodeJS.ProcessEnv,
  deps: { execPath?: string; platform?: NodeJS.Platform } = {},
): NodeJS.ProcessEnv {
  try {
    const platform = deps.platform ?? process.platform;
    // Path flavour must follow the TARGET platform, not the build host — posix
    // dirname cannot parse a backslashed win32 exec path (and vice versa).
    const dir = (platform === 'win32' ? win32Path : posixPath).dirname(deps.execPath ?? process.execPath);
    if (!dir || dir === '.') return env;
    // Windows env keys are case-insensitive; mutate the key that actually
    // exists ("Path" usually) rather than introducing a duplicate "PATH".
    const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
    const sep = platform === 'win32' ? ';' : ':';
    const cur = env[key] ?? '';
    if (cur.split(sep).some((p) => p === dir)) return env;
    return { ...env, [key]: cur.length > 0 ? `${cur}${sep}${dir}` : dir };
  } catch {
    return env; // fail-open: today's env exactly
  }
}

/** What `stop` prints on a selection — Layer C's Claude-Code block contract. */
export interface StopBlockLine {
  decision: 'block';
  reason: string;
}

/**
 * Parse `stop`'s stdout for the block line. Scans line-by-line (stderr noise
 * never reaches here; stdout may still carry stray writes from popup children)
 * and takes the LAST valid block line, mirroring how a stream consumer would
 * settle. Returns null when no valid block line exists.
 */
export function parseStopBlockOutput(stdout: string): StopBlockLine | null {
  let found: StopBlockLine | null = null;
  for (const line of stdout.split('\n')) {
    const t = line.trim();
    if (t === '' || !t.startsWith('{')) continue;
    try {
      const v = JSON.parse(t) as { decision?: unknown; reason?: unknown };
      if (v.decision === 'block' && typeof v.reason === 'string' && v.reason.trim() !== '') {
        found = { decision: 'block', reason: v.reason };
      }
    } catch { /* not JSON — popup child noise, skip */ }
  }
  return found;
}

/**
 * How to invoke the nexpath CLI — mirrors `windsurf-hook/spawn.ts` exactly:
 * NEXPATH_BIN override, else re-invoke THIS node + cli script (robust under a
 * sanitized hook PATH).
 */
function nexpathCmd(binaryPath?: string): { cmd: string; prefix: string[] } {
  if (binaryPath) return { cmd: binaryPath, prefix: [] };
  // RC57: a .cmd/.bat NEXPATH_BIN cannot be spawned raw (Node EINVAL — see
  // utils/batch-shim.ts); the self-reinvocation below IS the CLI it wraps.
  if (process.env.NEXPATH_BIN && !isWindowsBatchShim(process.env.NEXPATH_BIN)) {
    return { cmd: process.env.NEXPATH_BIN, prefix: [] };
  }
  return { cmd: process.execPath, prefix: [resolve(process.argv[1])] };
}

export interface StopDrivenDeciderPorts {
  /** Which host tag the persisted decision carries. */
  host: 'windsurf' | 'cursor';
  /** Injected for tests; defaults to node:child_process spawn. */
  spawnFn?: typeof spawn;
  /** Override the resolved nexpath binary (test/dev). */
  binaryPath?: string;
  /** Injected for tests; defaults to the real decision-file writer. */
  writeDecision?: typeof writeSubmitDecision;
  now?: () => number;
  logEvent?: typeof log;
  /**
   * Exposes the spawned child so the CALLER (holding the H4 budget) can kill
   * it on hold exhaustion — `stop`'s popups wait on the user with no bound of
   * their own, and Cursor never reaps timed-out hooks (R2).
   */
  onChild?: (child: ChildProcess | null) => void;
  /** RC10 sweep seams — injected for tests; default to the real store. */
  openStoreFn?: (db?: string) => Promise<unknown>;
  closeStoreFn?: (store: unknown) => Promise<void> | void;
  /** RC51 seam: the writability probe (defaults to real mkdirSync). */
  mkdirFn?: typeof mkdirSync;
}

/**
 * Build a decider with the SAME call shape as `buildDefaultPromptSubmitDecider`
 * so both hooks swap their default without touching their decision plumbing.
 */
export function buildStopDrivenPromptSubmitDecider(
  opts: { project?: string },
  ports: StopDrivenDeciderPorts,
): (event: string, o: { project?: string }, promptText?: string) => Promise<'allow' | 'block'> {
  const spawnFn = ports.spawnFn ?? spawn;
  const writeDecision = ports.writeDecision ?? writeSubmitDecision;
  const now = ports.now ?? (() => Date.now());
  const logEvent: typeof log = (level, name, data) => {
    try { (ports.logEvent ?? log)(level, name, data); } catch { /* never break the hook */ }
  };

  return async (_event, o, promptText) => {
    const projectRoot = o.project ?? opts.project ?? process.cwd();
    // A blank prompt is nothing to refine — release it without any popup.
    if ((promptText ?? '').trim() === '') return 'allow';

    // RC51 (Mac/Devin 2026-08-24): with NO folder open the hook's root
    // resolves to "/" — the decision file would be /.nexpath/… (EACCES on
    // Linux, guaranteed-impossible on macOS's sealed root volume). The old
    // behaviour showed the FULL popup, took the user's selection, then
    // silently failed to persist and released the original prompt — a popup
    // whose choice can never be delivered ("popup showed, nothing happened").
    // Probe the exact directory the persist would create; unwritable ⇒ allow
    // immediately, loudly, with no undeliverable popup. Any writable project
    // root passes untouched (the mkdir it performs is the persist's own).
    try {
      (ports.mkdirFn ?? mkdirSync)(join(projectRoot, '.nexpath'), { recursive: true });
    } catch {
      logEvent('warn', 'submit_flow_root_unwritable', { root: projectRoot });
      return 'allow';
    }

    let child: ChildProcess | null = null;
    let stdout = '';
    try {
      const { cmd, prefix } = nexpathCmd(ports.binaryPath);
      const spawnOpts: SpawnOptions = {
        cwd: projectRoot,
        // stdout is PIPED — the block line is the decision channel. stderr is
        // ignored: popup hosts write cues there ("Please select an action…").
        stdio: ['pipe', 'pipe', 'ignore'],
        // RC35: hand `stop` the hook env PLUS any GUI-session vars the host
        // stripped (see enrichSpawnEnvFromSessionSnapshot) — the popup cannot
        // render without them, and Windsurf's hook spawns arrive without a
        // session. Set-if-absent only; Cursor and the CLI path are no-ops.
        env: ensureNodeDirOnPath(enrichSpawnEnvFromSessionSnapshot(process.env)),
      };
      child = spawnFn(cmd, [...prefix, 'stop'], spawnOpts);
      ports.onChild?.(child);
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
      // Same stdin payload the old flow feeds `stop` — the Claude Code Stop
      // hook shape (`spawn.ts` precedent). `stop` scopes PE + advisory rows to
      // the session itself.
      child.stdin?.write(JSON.stringify({ cwd: projectRoot, hook_event_name: 'Stop', stop_hook_active: false }));
      child.stdin?.end();

      const exitCode = await new Promise<number | null>((res) => {
        let settled = false;
        const finish = (code: number | null): void => { if (!settled) { settled = true; res(code); } };
        child!.on('exit', (code) => finish(code));
        child!.on('close', (code) => finish(code));
        child!.on('error', () => finish(null));
      });

      logEvent('info', 'submit_stop_decider_done', {
        exit_code: exitCode,
        stdout_len: stdout.length,
        blocked: parseStopBlockOutput(stdout) !== null,
      });
      if (exitCode !== 0) return 'allow'; // crash ⇒ fail-open (A3)

      const block = parseStopBlockOutput(stdout);
      if (!block) {
        // ── RC31 (2026-08-21): never let an MPS sequence kill the flow SILENTLY ──
        // Upstream's MPS routing: an active sequence makes `stop` return
        // `mps_continuation_gated` and render NOTHING — its own test pins that it
        // "suppresses the PE popup and the advisory". The v1 continuation gate is
        // fail-closed in production, so such a sequence can never advance on its
        // own: every later submit in the project silently loses its popup.
        //
        // MEASURED LIVE (owner's Ubuntu, 2026-08-21 10:58–11:01): a sequence
        // accepted in WINDSURF (`awaiting_response`, item 0/3) suppressed every
        // CURSOR submit in the same project — including a turn whose advisory was
        // `pending` — via the shared per-project store. The RC31 warning below is
        // what surfaced it.
        //
        // ── RC37: SCRUB the stale row when sequences are configured OFF ─────
        // `prompt_enhancement.sequence.enabled !== 'on'` is the planner's own
        // disabled semantics (`sequence_disabled_by_config`) and the launch
        // configuration. In that state an active row is unreachable garbage —
        // nothing can advance it and it disables the submit surface forever —
        // so it is removed with Layer C's own exported terminal scrub
        // (`deletePendingPromptSequencesForProject`, "terminal scrub / clean
        // session state"). With sequences ON the row is a live MPS flow and is
        // NOT touched — only warned about — so the PE owner's behaviour is
        // unchanged by construction. Awaited (not fire-and-forget): the RC31
        // draft raced the hook's exit and only logged by luck. Fail-open: any
        // error here still returns 'allow'.
        try {
          const s2 = await (ports.openStoreFn ?? openStore)(undefined as never);
          try {
            const seq = getActivePendingPromptSequence(s2 as never, projectRoot);
            if (seq) {
              logEvent('warn', 'submit_stop_decider_suppressed_by_sequence', {
                status: seq.status,
                current_item_index: seq.currentItemIndex,
                item_count: seq.itemCount,
              });
              const enabled =
                getConfig((s2 as { db: never }).db, `${PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY}:${projectRoot}`)
                ?? getConfig((s2 as { db: never }).db, PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY);
              if (enabled !== 'on') {
                const deleted = deletePendingPromptSequencesForProject(s2 as never, projectRoot);
                logEvent('warn', 'submit_stop_decider_scrubbed_stale_sequence', {
                  deleted,
                  reason: 'sequences_disabled_by_config_and_row_unadvanceable',
                });
              }
            }
          } finally {
            try { await (ports.closeStoreFn ?? closeStore)(s2 as never); } catch { /* fail-open */ }
          }
        } catch { /* diagnostics/scrub must never affect the decision */ }
        return 'allow'; // skipped / shown / clipboard — ordinary turn
      }

      // `stop` already consumed the row, recorded lineage and set the
      // lastInjectedPrompt echo guard. Persisting the decision file is the ONLY
      // remaining step; a persist failure must not block with nothing to
      // replace the prompt (A3).
      const blockIssuedAt = now();
      await writeDecision({
        projectRoot,
        blockIssuedAt,
        hookPid: process.pid,
        // RC30: win32 only — Cascade waits on the powershell wrapper,
        // not on this node process. Undefined elsewhere, and
        // JSON.stringify drops it, so POSIX records are unchanged.
        ...(process.platform === 'win32' && process.ppid > 0
          ? { hookShellPid: process.ppid }
          : {}),
        decisionId: `sd-${now()}-${Math.floor(now() % 100000)}`,
        replacementText: block.reason,
        createdAt: now(),
        host: ports.host,
      });
      // RC38: register the replacement in the multi-entry echo registry. The
      // single Layer-C slot is overwritten by the NEXT block while a queued
      // replacement still waits (Windows/Devin queues injections made while
      // Cascade is busy) — the registry keeps the last few, windowed, so the
      // dequeued replacement is recognised and skipped instead of re-popped.
      appendReplacementEcho(projectRoot, block.reason);
      // ── H3's acceptance rule, extended to the stop-driven path (RC10 flash #2)
      // `stop` consumes only the row its popup HANDLED (PE-first: a PE turn
      // leaves the DS advisory row pending — old-flow semantics where it would
      // simply show next turn). Under submit-time that leftover re-fires a
      // popup on the NEXT leg for a turn the user already handled — measured
      // live as the second flash. A fully-handled (blocked) turn must leave NO
      // pending rows. Consume-only store calls; every failure is non-fatal
      // (the block already succeeded; worst case is today's extra popup).
      try {
        const sweepStore = await (ports.openStoreFn ?? openStore)(undefined as never);
        try {
          for (let i = 0; i < 8; i++) { // bounded — one turn parks at most a couple
            const row = getPendingAdvisory(sweepStore as never, projectRoot);
            if (!row) break;
            markAdvisoryShown(sweepStore as never, row.id);
          }
          const pe = getPendingPromptEnhancement(sweepStore as never, projectRoot);
          if (pe) markPromptEnhancementShown(sweepStore as never, pe.id);
        } finally {
          try { await (ports.closeStoreFn ?? closeStore)(sweepStore as never); } catch { /* fail-open */ }
        }
      } catch (err) {
        logEvent('warn', 'submit_stop_decider_sweep_failed', {
          message: (err as Error)?.message ?? 'unknown',
        });
      }
      return 'block';
    } catch (err) {
      logEvent('warn', 'submit_stop_decider_failed', {
        message: (err as Error)?.message ?? 'unknown',
      });
      return 'allow';
    } finally {
      // Never leave a live child if we are returning without its exit (error
      // paths); a completed child ignores the signal.
      if (child && child.exitCode === null && child.signalCode === null) {
        try { child.kill(); } catch { /* already gone */ }
      }
    }
  };
}

// ── RC41 (2026-08-21): the MPS CONTINUATION trigger for hook-driven hosts ────
//
// THE CLI CHAIN THIS MIRRORS (read end-to-end from stop.ts): the MPS-1 popup's
// send blocks with item 1 → Claude runs it → the NEXT Stop fires with
// `stop_hook_active:true` → runStop's top branch routes the active sequence to
// the continuation launcher (UN-GATED for all users since 2026-08-17) → the
// continuation popup renders → `inject` advances the row and returns
// `{outcome:'blocked', reason:<item body>}` → the next item runs → … N popups.
//
// Cursor/Windsurf never fire a Stop with `stop_hook_active:true`, so the chain
// stopped after popup 1 on our hosts. This runner IS that missing Stop: invoked
// by Windsurf's `post_cascade_response` leg and Cursor's `afterAgentResponse`
// hook (the hosts' own "response finished" events — the honest analog of
// Claude's Stop), it runs the SAME `nexpath stop` with `stop_hook_active:true`
// and hands a block to the SAME delivery pipeline every proven turn uses
// (decision file → poller → settle → inject → auto-submit → echo registry).
//
// Fail-open everywhere: no active sequence ⇒ {ran:false} and the caller's flow
// is byte-identical to before; any error ⇒ same. The popup waits on a human, so
// the child is awaited under a long cap and killed at the cap (Cursor never
// reaps orphans — R2).
export const SEQUENCE_CONTINUATION_CAP_MS = 10 * 60_000;

export interface SequenceContinuationResult {
  ran: boolean;
  blocked?: boolean;
  /** RC43: true when the event arrived inside the post-block quiet window and
   *  the continuation was deliberately NOT run (see the guard below). The host
   *  leg must END the event on deferred — never fall through to the old-flow
   *  stop, whose no-block path can reach the same continuation launcher. */
  deferred?: boolean;
}

/**
 * RC43 — the post-block QUIET WINDOW (measured live 2026-08-22, owner screencast).
 *
 * Windsurf fires `post_cascade_response` once ~1–4 s after our OWN block — before
 * the blocked item's delivery has even finished (settle 1.5 s + inject + submit
 * ≈ 4 s; measured submit attempt at +3.9 s). Running the continuation on that
 * echo-event spawned the next popup DURING delivery; the popup took focus, the
 * RC10 phantom-Enter guard then (correctly) refused the synthetic Enter, and
 * item 1 stranded in the composer — the next inject appended to it and two items
 * went as ONE combined message (owner's screencast, extension log
 * `submit-clipboard: submit failed` 04:54:57.270).
 *
 * The anchor is the echo REGISTRY timestamp — both block writers append there at
 * persist time. Events younger than this window after the last block are the
 * block's own echo, never the item's real response completion (measured real
 * completions: +17 s, +21 s, +50 s). 12 s covers the full delivery span (≤8 s)
 * with margin while staying under every measured real completion.
 */
export const SEQUENCE_CONTINUATION_QUIET_MS = 12_000;

export async function runSequenceContinuationStop(
  projectRoot: string,
  host: 'windsurf' | 'cursor',
  ports: {
    spawnFn?: typeof spawn;
    binaryPath?: string;
    writeDecision?: typeof writeSubmitDecision;
    now?: () => number;
    logEvent?: typeof log;
    openStoreFn?: (db?: string) => Promise<unknown>;
    closeStoreFn?: (store: unknown) => Promise<void> | void;
    capMs?: number;
    latestEchoAt?: typeof latestReplacementEchoAt;
  } = {},
): Promise<SequenceContinuationResult> {
  const logEvent: typeof log = (level, name, data) => {
    try { (ports.logEvent ?? log)(level, name, data); } catch { /* never break the hook */ }
  };
  // 1. Only when an active sequence exists — read-only peek, same consume-only
  //    convention as the RC10 sweep. `runStop` re-validates with its own
  //    session manager, so a stale peek can only cost one harmless spawn.
  try {
    const s = await (ports.openStoreFn ?? openStore)(undefined as never);
    let row: ReturnType<typeof getActivePendingPromptSequence> = null;
    try {
      row = getActivePendingPromptSequence(s as never, projectRoot);
    } finally {
      try { await (ports.closeStoreFn ?? closeStore)(s as never); } catch { /* fail-open */ }
    }
    if (row === null) return { ran: false };
    // RC42 visibility: a row whose stored item list is EMPTY can never be packaged by the
    // continuation launcher ("no worded items" refusal, debug-only upstream) — the popup will not
    // render on ANY Stop, in the CLI or here. That row shape is produced at PREPARE time when the
    // upstream sequence planner fails/refuses (its summary falls back to the describe splitter, so
    // the MPS-1 popup still advertises a plan). Found live 2026-08-22 (row: item_count 4, items []).
    // The stop still runs below — outcomes stay byte-identical to the CLI — this line only makes
    // the silent upstream refusal diagnosable from the hook log.
    if ((row.payload?.items?.length ?? 1) === 0) {
      logEvent('warn', 'sequence_continuation_row_has_no_items', {
        host, item_count: row.itemCount, status: row.status,
      });
    }
  } catch {
    return { ran: false };
  }

  // RC43: quiet-window guard — see SEQUENCE_CONTINUATION_QUIET_MS above. The
  // premature event is the block's own echo; the item's real completion always
  // arrives later and passes. Fail-open: no registry ⇒ no deferral.
  try {
    const lastBlockAt = (ports.latestEchoAt ?? latestReplacementEchoAt)(projectRoot);
    const nowMs = (ports.now ?? (() => Date.now()))();
    if (lastBlockAt !== null && nowMs - lastBlockAt < SEQUENCE_CONTINUATION_QUIET_MS) {
      logEvent('info', 'sequence_continuation_deferred_quiet_window', {
        host, age_ms: nowMs - lastBlockAt,
      });
      return { ran: false, deferred: true };
    }
  } catch { /* fail-open — behave exactly as before the guard */ }

  const spawnFn = ports.spawnFn ?? spawn;
  const writeDecision = ports.writeDecision ?? writeSubmitDecision;
  const now = ports.now ?? (() => Date.now());
  let child: ChildProcess | null = null;
  let stdout = '';
  try {
    const { cmd, prefix } = nexpathCmd(ports.binaryPath);
    child = spawnFn(cmd, [...prefix, 'stop'], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'ignore'],
      // Same enrichment as the submit decider — the continuation popup needs
      // the GUI session the host may have stripped from the hook env (RC35).
      env: ensureNodeDirOnPath(enrichSpawnEnvFromSessionSnapshot(process.env)),
    });
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    // The continuation Stop payload — `stop_hook_active:true` is what routes
    // runStop to the continuation launcher (its top-of-ladder branch).
    child.stdin?.write(JSON.stringify({ cwd: projectRoot, hook_event_name: 'Stop', stop_hook_active: true }));
    child.stdin?.end();
    const capMs = ports.capMs ?? SEQUENCE_CONTINUATION_CAP_MS;
    const exitCode = await new Promise<number | null>((res) => {
      let settled = false;
      const finish = (code: number | null): void => { if (!settled) { settled = true; clearTimeout(t); res(code); } };
      const t = setTimeout(() => { try { child?.kill(); } catch { /* best-effort */ } finish(null); }, capMs);
      if (typeof t.unref === 'function') t.unref();
      child!.on('exit', (code) => finish(code));
      child!.on('close', (code) => finish(code));
      child!.on('error', () => finish(null));
    });
    const block = exitCode === 0 ? parseStopBlockOutput(stdout) : null;
    logEvent('info', 'sequence_continuation_stop_done', {
      host, exit_code: exitCode, stdout_len: stdout.length, blocked: block !== null,
    });
    if (!block) return { ran: true, blocked: false };
    const blockIssuedAt = now();
    await writeDecision({
      projectRoot,
      decisionId: `sq-${blockIssuedAt}-${blockIssuedAt % 100000}`,
      replacementText: block.reason,
      createdAt: blockIssuedAt,
      blockIssuedAt,
      hookPid: process.pid,
      ...(process.platform === 'win32' && process.ppid > 0 ? { hookShellPid: process.ppid } : {}),
      host,
    });
    // RC38: the injected item will re-enter the submit hook — register it so
    // the echo skip recognises it even if the single slot gets overwritten.
    appendReplacementEcho(projectRoot, block.reason);
    logEvent('info', 'sequence_continuation_decision_persisted', { host });
    return { ran: true, blocked: true };
  } catch (err) {
    logEvent('warn', 'sequence_continuation_failed', { host, message: (err as Error)?.message ?? 'unknown' });
    try { child?.kill(); } catch { /* best-effort */ }
    return { ran: true, blocked: false };
  }
}
