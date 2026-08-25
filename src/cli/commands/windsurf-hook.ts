/**
 * `nexpath windsurf-hook <event>` — the shim invoked by Windsurf's Cascade hooks
 * (configured in ~/.codeium/windsurf/hooks.json by `nexpath install`).
 *
 * Reads the hook JSON on stdin, remaps it to the nexpath Layer-C CLI contract, and
 * fires `nexpath auto` / `nexpath stop`. `<event>` ∈ { pre_user_prompt,
 * post_cascade_response }. `--project <dir>` overrides the project root (defaults
 * to process.cwd(), which Windsurf sets to the active workspace folder).
 *
 * **Exits 0 in every shipped configuration — a hook must never block or break
 * Cascade.** Amended 2026-08-10 (hook milestone H2): there is now exactly ONE
 * path that exits non-zero, and it is off by default.
 *
 * When `NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY=1` (internal switch, never
 * persisted, never user-facing) **and** the prompt-submit decider explicitly
 * returns `'block'`, a `pre_user_prompt` exits **2** — Windsurf's documented
 * signal to cancel the prompt before Cascade sees it. This is the deliberate
 * inversion of the original always-exit-0 contract that the prompt-submit-time
 * advisory requires; it is stated here rather than left to contradict the code.
 *
 * Everything else still exits 0, including every failure path: a thrown decider,
 * an unexpected value, or any error at all falls through to exit 0 (fail-open,
 * amendment A3). With the switch unset — the default — the gated block is skipped
 * entirely and behaviour is byte-identical to before.
 */
import type { Command } from 'commander';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runWindsurfHook, parsePayload, type RunResult } from '../../windsurf-hook/handler.js';
import {
  checkAndRecordCursorInvocation,
  WINDSURF_INVOCATION_DIRNAME,
  WINDSURF_FALLBACK_WINDOW_MS,
} from '../../cursor-hook/invocation-guard.js';
import { decideSubmitPrompt, type DeciderOptionSet, type DeciderSelection } from './submit-prompt-decider.js';
import { runSequenceContinuationStop, SEQUENCE_CONTINUATION_QUIET_MS } from './submit-stop-decider.js';
import {
  createDeterministicSubmitOptionSource,
  type SubmitOptionSource,
} from './submit-option-source.js';
import { openStore, closeStore } from '../../store/db.js';
import { log } from '../../logger.js';
import { killProcessTree } from '../../utils/kill-tree.js';
import { getPendingAdvisory, markAdvisoryShown } from '../../store/pending-advisories.js';
import { isSubmitAdvisoryEnabledForHost } from './submit-flow-config.js';
import { writeSubmitDecision, readReplacementEchoes, latestReplacementEchoAt,
} from './submit-decision-store.js';
import { buildStopDrivenPromptSubmitDecider } from './submit-stop-decider.js';
import { createHoldBudget, type HoldBudget } from './submit-hold-budget.js';
// CONSUME-ONLY. `SessionStateManager` is not Vedansi-owned (`hi0001234d` 15 /
// `harshil480` 15) — it is called here, never modified.
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { bringPopupToFront } from '../../windsurf-hook/foreground.js';

/**
 * Resolve once the spawned `auto`/`stop` child exits (so the hook has finished its
 * work — `auto` has persisted the advisory, `stop` has shown the popup + got the
 * selection — before we return). Resolves immediately if there is no child, and
 * is bounded by `timeoutMs` so a hook can never hang forever.
 */
export function awaitChild(child: ChildProcess | null | undefined, timeoutMs = 600_000): Promise<void> {
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.on('exit', finish);
    child.on('close', finish);
    child.on('error', finish);
  });
}

/** Read all of stdin (returns '' immediately when attached to a TTY / no pipe). */
export function defaultReadStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

export interface WindsurfHookCliDeps {
  readStdin?: () => Promise<string>;
  run?: typeof runWindsurfHook;
  cwd?: string;
}

/**
 * Testable core: read stdin, resolve the project root, dispatch to the handler.
 * Kept free of `process.exit` so unit tests can call it directly.
 */
export async function handleWindsurfHookCli(
  event: string,
  opts: { project?: string },
  deps: WindsurfHookCliDeps = {},
): Promise<RunResult> {
  const readStdin = deps.readStdin ?? defaultReadStdin;
  const run = deps.run ?? runWindsurfHook;
  const cwd = opts.project ?? deps.cwd ?? process.cwd();
  const raw = await readStdin();
  return run(event, raw, { cwd });
}

/**
 * Backward-compatibility switch for the prompt-submit-time advisory flow
 * (hook milestone, H2). **Internal and non-user-facing by design**: read straight
 * from `process.env`, never persisted, never surfaced by `nexpath status` or
 * `nexpath config`. A `nexpath config set` key was explicitly rejected for this —
 * it would appear in the public config dump and be settable by any user, failing
 * the "invisible to end users" requirement.
 *
 * Matches the existing `NEXPATH_*` convention (`NEXPATH_DEBUG`, `NEXPATH_SIM`,
 * `NEXPATH_LOG_LEVEL`) including the exact-equality `=== '1'` read: unset, `'0'`,
 * `'true'`, or anything else all fall through to **today's exact behaviour**.
 */
export const WINDSURF_PROMPTSUBMIT_ADVISORY_ENV = 'NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY';

/** True only when the switch is explicitly `'1'`. Default OFF — never `!== '0'`. */
export function isWindsurfPromptSubmitAdvisoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[WINDSURF_PROMPTSUBMIT_ADVISORY_ENV] === '1';
}

/**
 * What the gated `pre_user_prompt` path decided. Kept deliberately small: H2 only
 * builds the switch and the exit-2 wiring; H3 supplies the real decision (popup →
 * user picks → block). Until then the default decider always returns
 * `'allow'`, so switching the env var on changes nothing observable on its own.
 */
export type WindsurfPromptSubmitDecision = 'allow' | 'block';


/**
 * Build the default `pre_user_prompt` decider (H3 Gap 2b).
 *
 * **Ports, with a real default.** `composeOptions`/`renderPopup` remain injectable
 * seams, but they now default to `createDeterministicSubmitOptionSource` — so the
 * switched-on path produces real options instead of being inert. Passing
 * `ports.composeOptions` overrides that and skips opening a Store entirely.
 *
 * **Ownership is still intact.** Hiren's `composeDeterministicOptions` and
 * Bhavnesh's `createTtySelectFn` are CONSUME-ONLY (dev plan §1.3) and are reached
 * only through `submit-option-source.ts`, the adapter. Neither is imported here,
 * and `submit-prompt-decider.ts` still has zero imports of any kind.
 *
 * **The Store is opened per invocation and always closed** (`finally`). This runs
 * in a short-lived hook subprocess alongside the `auto` child of the same turn, so
 * a leaked handle would hold the SQLite lock against it.
 *
 * Every failure — store open, option source, popup — falls through to `'allow'`
 * (fail-open, amendment A3): the original prompt is released unmodified rather
 * than cancelled with nothing to replace it.
 */
export function buildDefaultPromptSubmitDecider(
  opts: { project?: string },
  ports: {
    composeOptions?: (promptText: string) => DeciderOptionSet | null;
    renderPopup?: (promptText: string, options: DeciderOptionSet) => Promise<DeciderSelection>;
    now?: () => number;
    /** Pre-built option source. Bypasses store opening; lets the block-only
     *  consume rule be observed directly in tests. */
    optionSource?: SubmitOptionSource;
    /**
     * Which host the decision is for. Defaults to `'windsurf'` so every existing
     * caller is unchanged. H6 passes `'cursor'` to reuse this decider rather than
     * growing a parallel implementation — the block/persist/consume logic is
     * identical; only the record's host tag differs.
     */
    host?: 'windsurf' | 'cursor';
    openStore?: (db?: string) => Promise<unknown>;
    closeStore?: (store: unknown) => Promise<void> | void;
  } = {},
): (event: string, o: { project?: string }, promptText?: string) => Promise<WindsurfPromptSubmitDecision> {
  const now = ports.now ?? (() => Date.now());
  const openStoreFn = ports.openStore ?? openStore;
  const closeStoreFn = ports.closeStore ?? closeStore;

  return async (_event, o, promptText) => {
    const projectRoot = o.project ?? opts.project ?? process.cwd();

    // The option source needs a Store. Opened per invocation and ALWAYS closed —
    // this runs inside a short-lived hook subprocess, so a leaked handle would
    // hold the SQLite lock against the `auto` child running in the same turn.
    //
    // ── RETRY (live root cause, 2026-08-12) ─────────────────────────────────
    // Option-A means `auto` (and, on Cursor, the extension's concurrent
    // pipeline) is finishing its store WRITES in the very window this open
    // runs. A transiently locked SQLite then failed the open, the old silent
    // catch nulled the source, and the decider allowed in ~200 ms — measured
    // live, invisible without the log lines below. A short bounded retry
    // (well inside the hold budget) absorbs the transient; a persistent
    // failure still fails open exactly as before.
    let store: unknown = null;
    let source: SubmitOptionSource | null = ports.optionSource ?? null;
    if (!ports.composeOptions && !source) {
      for (let attempt = 0; attempt < 3 && !store; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 150));
          store = await openStoreFn(undefined as never);
        } catch (err) {
          store = null;
          log('warn', 'submit_decider_store_open_failed', {
            attempt: attempt + 1,
            message: (err as Error)?.message ?? 'unknown',
          });
        }
      }
      if (store) {
        // The log seam was silently a no-op before — every "allowing because X"
        // diagnostic went nowhere, which is how a 210 ms silent allow cost a
        // day of live debugging. Wire it to the shared file logger.
        source = createDeterministicSubmitOptionSource({
          store,
          projectRoot,
          log: (m) => log('info', 'submit_option_source', { m }),
        });
      }
      // Fail-open (A3): no store ⇒ no options ⇒ the prompt is released.
    }

    // NOTE (RC6, 2026-08-13): a no-row lookup retry was considered here and
    // deliberately REJECTED — it taxed every quiet (no-advisory) submit ~1.4 s,
    // and in the measured failure the clobbering writer (PE's `stop`) holds its
    // in-memory copy for minutes, so a short retry cannot recover. The actual
    // fix is upstream: `suppressWatcherAuto` removes the duplicate classifier,
    // so the hook's own `auto` flush is the last word before this open. On PE
    // turns the PE surface owns the moment (G-ARBITRATION), so a residual DS
    // miss there is acceptable by design.
    try {
      const decision = await decideSubmitPrompt(promptText ?? promptTextForHook(), {
        composeOptions: ports.composeOptions
          ?? source?.composeOptions
          ?? ((): DeciderOptionSet | null => null),
        renderPopup: ports.renderPopup
          ?? source?.renderPopup
          ?? (async (): Promise<DeciderSelection> => null),
        persistDecision: async (replacementText) => {
          // Stamped here: the decision to block is made the instant the user
          // picks an option, immediately before persistence.
          const blockIssuedAt = now();

          // ── VED-PE-10: the injected body must NOT re-enter as a new prompt ──
          // The handoff is explicit: a generated body re-entering `UserPromptSubmit`
          // "must not silently trigger fresh classification, profile cadence,
          // product-feedback cadence, detected-language updates, memory learning,
          // or another PE/DS popup as if they were new user-authored prompts."
          //
          // Our replacement IS such a body: the extension injects it and
          // auto-submits, which fires a fresh `pre_user_prompt`.
          //
          // The guard for exactly this already ships — `auto.ts:706` reads
          // `lastInjectedPrompt`, clears it, and returns `no_action` on an echo
          // match, skipping classification AND `recordActivity` (`:722`, "so
          // synthetic prompts do not count"). So this REUSES shipped machinery
          // rather than inventing a second guard — and it resolves the H4
          // promptCount double-count by the same stroke, because the counter sits
          // behind the same gate.
          //
          // Recorded BEFORE the decision file is written: if persistence fails we
          // return 'allow' and never block, and `auto` clears the field on the next
          // turn regardless, so a stale value cannot suppress a genuine prompt.
          if (store) {
            try {
              const mgr = SessionStateManager.load(store as never, projectRoot);
              mgr.setInjectedPrompt(store as never, replacementText);
            } catch {
              // Non-fatal: worst case the replacement is re-classified, which is
              // today's behaviour — never a reason to strand the user's prompt.
            }
          }

          await writeSubmitDecision({
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
            replacementText,
            createdAt: now(),
            host: ports.host ?? 'windsurf',
          });
        },
      });

      // H3 acceptance: no pending advisory may survive a turn this path fully
      // handled, or `post_cascade_response` shows the OLD popup as well and the
      // user gets two. Option-A ordering means `auto` already wrote the row, so
      // it is consumed here. Only on 'block' — an allowed prompt is an ordinary
      // turn and must keep today's behaviour exactly.
      if (decision === 'block') source?.consumeHandledTurn();
      return decision;
    } finally {
      if (store) { try { await closeStoreFn(store as never); } catch { /* fail-open */ } }
    }
  };
}

/**
 * The prompt text the hook received. Windsurf delivers it on stdin, which
 * `handleWindsurfHookCli` already consumes, so it is not re-read here — the
 * option source is what needs it, and that adapter is supplied by the wiring
 * site. Returns an empty string until then, which the decider treats as `'allow'`.
 */
function promptTextForHook(): string {
  return '';
}

/**
 * What Cascade's block card shows after the vendor prefix ("1 hook(s) blocked
 * this action: …") when this hook blocks a submit — written to STDERR right
 * before `exit(2)` (RC14/RC14b; every property below verified live against the
 * shipped language server with probe hooks + pixel captures, 2026-08-14):
 * stderr REPLACES the vendor default "Action blocked by hook"; the card is a
 * SINGLE line clipped at the panel edge (no wrap); leading newlines are
 * TRIMMED, so a multi-line layout is impossible. Hence a message short enough
 * (~24 chars) to always render complete — a full sentence on its own. The
 * refined prompt appearing + auto-submitting right below the card carries the
 * rest of the explanation (Cursor renders the long-form `user_message`
 * instead; that channel does not exist on Windsurf).
 */
export const WINDSURF_BLOCK_CARD_MESSAGE = 'Nexpath held this prompt';

/**
 * Is this submit the hook's OWN replacement coming back around? (VED-PE-10.)
 *
 * Live sequence, measured 2026-08-13 on Cursor: block → replacement injected +
 * auto-submitted by the extension → that submit fires the hook AGAIN. The
 * hook's own `auto` then consumed the `lastInjectedPrompt` echo guard, so the
 * EXTENSION's duplicate watcher-auto (which runs seconds later) classified the
 * replacement as a fresh prompt, parked a new advisory, and the replacement's
 * hook run popped a SECOND popup nobody was watching — stalling the replacement
 * ~57 s behind the hold before failing open.
 *
 * So the hook must recognise the echo BEFORE spawning anything: when the
 * incoming prompt text equals the persisted `lastInjectedPrompt` (written by
 * `persistDecision` at block time), the whole gated path is skipped — no auto
 * spawn, no popup, instant release. The guard field is deliberately NOT
 * cleared here: the watcher's own `auto` still needs to hit it (`auto.ts:706`)
 * so the synthetic prompt is not classified or counted, and Layer C already
 * clears a stale value on the next genuine turn regardless.
 *
 * Fail-open: any failure (no store, no state) reports `false` and the normal
 * path runs — worst case is today's behaviour, never a stranded prompt.
 */
/**
 * RC64 — duplicate hook-invocation guard, Windsurf half (Windows Devin,
 * 2026-08-25). Windows registers BOTH the global `~/.codeium/windsurf/hooks.json`
 * and the workspace `.windsurf/hooks.json` (RC21: that era's Devin executed
 * ONLY the workspace file, so the global entry was inert armor — the newer
 * Devin build executes BOTH). One submit then spawned two full pipelines: two
 * autos prepared two DIFFERENT enhancements, two popups, two blocks, two
 * injected replacements (tester screenshot: both queued behind the busy
 * session). Same class as Cursor §8.1, same cure as RC50/56: an atomic
 * exclusive-create claim, keyed on the payload's per-action `execution_id`
 * (Windsurf's analog of Cursor's `generation_id`). The first invocation wins
 * and runs everything; the twin exits 0 untouched — Windsurf blocks on ANY
 * hook's exit 2, so the twin allowing changes nothing about the cancel
 * (empirically: with both invocations blocking today, one card renders).
 *
 * Fallback when a payload has no `execution_id`: trajectory + content hash,
 * with the SHORT `WINDSURF_FALLBACK_WINDOW_MS` — that key repeats on a
 * legitimate same-text resubmit, and duplicates arrive milliseconds apart
 * (RC50 measured 2–100 ms). No trajectory either ⇒ fail-open, run the flow.
 */
export function isDuplicateWindsurfInvocation(
  projectRoot: string,
  event: string,
  payload: ReturnType<typeof parsePayload>,
  guard: typeof checkAndRecordCursorInvocation = checkAndRecordCursorInvocation,
): { duplicate: boolean; key_kind: 'execution_id' | 'fallback' | 'none' } {
  const execId = payload?.execution_id ?? '';
  if (execId) {
    return {
      duplicate: guard(projectRoot, event, execId, { dirName: WINDSURF_INVOCATION_DIRNAME }),
      key_kind: 'execution_id',
    };
  }
  const trajectory = payload?.trajectory_id ?? '';
  if (!trajectory) return { duplicate: false, key_kind: 'none' };
  const content = event === 'pre_user_prompt'
    ? payload?.tool_info?.user_prompt ?? ''
    : payload?.tool_info?.response ?? '';
  const key = `${trajectory}-${createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
  return {
    duplicate: guard(projectRoot, event, key, {
      dirName: WINDSURF_INVOCATION_DIRNAME,
      maxAgeMs: WINDSURF_FALLBACK_WINDOW_MS,
    }),
    key_kind: 'fallback',
  };
}

export async function isReplacementEcho(
  projectRoot: string | undefined,
  promptText: string,
  ports: {
    openStore?: (db?: string) => Promise<unknown>;
    closeStore?: (store: unknown) => Promise<void> | void;
    loadState?: (store: unknown, projectRoot: string) => { current: { lastInjectedPrompt: string | null } };
  } = {},
): Promise<boolean> {
  if (!projectRoot || promptText.trim() === '') return false;
  const openStoreFn = ports.openStore ?? openStore;
  const closeStoreFn = ports.closeStore ?? closeStore;
  const loadState = ports.loadState
    ?? ((s: unknown, p: string) => SessionStateManager.load(s as never, p));
  let store: unknown = null;
  try {
    store = await openStoreFn(undefined as never);
    const last = loadState(store, projectRoot).current.lastInjectedPrompt;
    // ── RC12 (live block LOOP, 2026-08-13): exact equality was too brittle ──
    // The DS bridge injects the replacement DECORATED (an `@[nexpath:advisory]`
    // mention prefix + concatenation), and hosts may normalise whitespace — so
    // the echoed submit no longer `===` the recorded text, the skip missed,
    // and the hook BLOCKED ITS OWN REPLACEMENT repeatedly (each injection
    // stamped "blocked by hook", nothing ever ran). Match on normalised
    // CONTAINMENT instead: whitespace-collapsed, either side containing the
    // other, with a minimum-length floor so short prompts can never falsely
    // skip. Exact equality remains the fast path.
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    const b = norm(promptText);
    const matches = (recorded: string): boolean => {
      if (recorded === promptText) return true;
      const a = norm(recorded);
      if (a.length < 40 || b.length < 40) return false; // floor: never skip short prompts fuzzily
      return b.includes(a) || a.includes(b);
    };
    if (typeof last === 'string' && last.trim() !== '' && matches(last)) return true;
    // ── RC38 (Windows/Devin, 2026-08-21): the slot is SINGLE-ENTRY, and Devin
    // QUEUES a replacement injected while Cascade is busy. By the time the
    // queued item dequeues and re-fires this hook, a newer block has often
    // overwritten the slot — echo miss ⇒ a popup opens on OUR OWN replacement
    // (the tester's screenshots show the nested "My original request
    // (verbatim):" proof) ⇒ its selection re-blocks the dequeued item ⇒
    // spiral. The registry keeps the last few replacements (windowed); same
    // normalised-containment rule and the same ≥40-char floor, so an extra hit
    // can only ever skip text WE injected — never a user's own prompt.
    for (const recorded of readReplacementEchoes(projectRoot)) {
      if (matches(recorded)) return true;
    }
    return false;
  } catch {
    return false; // fail-open — run the normal path
  } finally {
    if (store) { try { await closeStoreFn(store as never); } catch { /* fail-open */ } }
  }
}

export interface WindsurfHookActionDeps {
  handle?: (event: string, opts: { project?: string }, deps?: WindsurfHookCliDeps) => Promise<RunResult>;
  readStdin?: () => Promise<string>;
  /** Bound on the gated stdin read. A hang here would hold the user's prompt. */
  stdinTimeoutMs?: number;
  /**
   * Read the submit-flow flag file (the config-backed switch). Injected for
   * tests so they never touch the real `~/.nexpath/submit-flow.json`; defaults
   * to the real reader. The gates resolve env-var-override → flag file.
   */
  readFlagFile?: (path: string) => string | null;
  /** H4: injectable hold budget. Defaults to the plan's 60-90s self-enforced cap. */
  holdBudget?: HoldBudget;
  /**
   * VED-PE-10 echo detector (see `isReplacementEcho`). Injected for tests so
   * they never open the real store; defaults to the real implementation.
   */
  checkReplacementEcho?: (projectRoot: string | undefined, promptText: string) => Promise<boolean>;
  raisePopup?: () => void;
  waitForChild?: (child: ChildProcess | null | undefined) => Promise<void>;
  exit?: (code: number) => void;
  env?: NodeJS.ProcessEnv;
  /**
   * Decides whether a `pre_user_prompt` should be blocked. Only consulted when the
   * switch is on. Defaults to `'allow'` so H2 alone is behaviour-neutral; H3
   * replaces it with the real popup-backed decision.
   */
  decidePromptSubmit?: (event: string, opts: { project?: string }, promptText: string) => Promise<WindsurfPromptSubmitDecision>;
  /** OWNER RULING 2026-08-12: consume the session's pending advisories before `stop` runs (switch on only). */
  suppressOldAdvisorySurface?: (projectRoot: string, sessionId: string) => Promise<number>;
  /** RC41 seam: injected in tests; defaults to the real continuation runner. */
  runSequenceContinuation?: (projectRoot: string, host: 'windsurf' | 'cursor') => Promise<{ ran: boolean; blocked?: boolean; deferred?: boolean }>;
  /** RC64 seam: duplicate-invocation check (duplicate ⇒ exit 0, do nothing). */
  checkDuplicateInvocation?: typeof isDuplicateWindsurfInvocation;
  /**
   * Bound on the POST-leg stdin read. Separate from `stdinTimeoutMs` (the PRE
   * leg, which holds the user's prompt and must stay tight): nothing is held on
   * the post-response leg, and the payload carries the full response text, which
   * LIVE-provenly (2026-08-12) can arrive slower than 2 s — the suppression was
   * silently skipped. Generous by design; bounded only against a never-closing pipe.
   */
  postStdinTimeoutMs?: number;
}

/**
 * OWNER RULING 2026-08-12 (G-ARBITRATION, popup-precedence half): with the
 * submit switch ON, the OLD advisory surface must never fire — the submit-time
 * popup IS the advisory surface on this host. With the switch OFF the old flow
 * runs untouched, and the CLI is out of scope for this milestone entirely.
 *
 * `stop` (Layer C, frozen) pops whatever `pending_advisories` row it finds, so
 * the enforcement point is the one process we own that runs BEFORE it: this
 * hook's `post_cascade_response` leg. It consumes the session's pending rows
 * with the same consume-only store calls `consumeHandledTurn` already uses —
 * `stop`'s ladder then finds no advisory and moves on to feedback/PE, which
 * this ruling deliberately leaves untouched.
 *
 * Recorded cost (team-lead note in the gate register): signals the submit flow
 * cannot render deterministically (A1 excludes the LLM path at submit) are
 * DROPPED under the switch, not deferred to a post-response popup.
 *
 * Fail-open: any error leaves rows in place — worst case is today's popup,
 * never a lost prompt. Sweep is capped; each mark exposes the next pending row.
 */
export async function suppressOldAdvisorySurfaceForSession(
  projectRoot: string,
  sessionId: string,
  ports: {
    openStore?: (db?: string) => Promise<unknown>;
    closeStore?: (store: unknown) => Promise<void> | void;
    getRow?: typeof getPendingAdvisory;
    markShown?: typeof markAdvisoryShown;
    log?: (line: string) => void;
  } = {},
): Promise<number> {
  const openStoreFn = ports.openStore ?? openStore;
  const closeStoreFn = ports.closeStore ?? closeStore;
  const getRow = ports.getRow ?? getPendingAdvisory;
  const markShown = ports.markShown ?? markAdvisoryShown;
  const logLine = ports.log ?? ((line: string) => log('info', 'windsurf_hook_advisory_suppression', { line }));
  let store: unknown = null;
  let consumed = 0;
  try {
    store = await openStoreFn(undefined as never);
    for (let i = 0; i < 8; i++) {
      const row = getRow(store as never, projectRoot, sessionId);
      if (!row) break;
      markShown(store as never, row.id);
      consumed++;
    }
    if (consumed > 0) {
      logLine(`windsurf-hook: old advisory surface suppressed for this session (${consumed} row(s), submit switch on)`);
    }
  } catch (err) {
    logLine(`windsurf-hook: advisory suppression failed open — ${(err as Error)?.message ?? 'unknown'}`);
  } finally {
    if (store) { try { await closeStoreFn(store as never); } catch { /* fail-open */ } }
  }
  return consumed;
}

/**
 * The `windsurf-hook` command body.
 *
 * Extracted from the command action purely so it can be tested. The action
 * resolves its own stdin and ends in `process.exit`, so calling it from a test
 * blocks on real stdin and then tears down the runner — which is why the
 * popup-raise gate below had no coverage. Every dependency defaults to exactly
 * what the action already used, so shipped behaviour is byte-identical.
 */
export async function runWindsurfHookAction(
  event: string,
  opts: { project?: string },
  deps: WindsurfHookActionDeps = {},
): Promise<void> {
  const handle = deps.handle ?? handleWindsurfHookCli;
  const raisePopup = deps.raisePopup ?? bringPopupToFront;
  const waitForChild = deps.waitForChild ?? awaitChild;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const env = deps.env ?? process.env;
  const readStdin = deps.readStdin ?? defaultReadStdin;
  const stdinTimeoutMs = deps.stdinTimeoutMs ?? 2_000;
  // Holds the stdin buffer when the gated path consumed it, so `handle` can replay
  // it instead of reading an already-drained pipe. Null ⇒ nothing was read.
  let preReadRaw: string | null = null;
  // Set by the gated pre_user_prompt path; the decision runs after `auto` has
  // classified THIS turn (option A). Never set when the switch is off.
  let hold: HoldBudget | null = null;
  let decideAfterAuto = false;
  let pendingPromptText = '';
  // Default decider (H3). Constructed unconditionally, but this only BUILDS a
  // closure — `openStore` lives inside it and runs solely on the gated call below
  // (`isWindsurfPromptSubmitAdvisoryEnabled`). So with the switch off no Store is
  // opened, no lock is taken, and nothing here is reachable: the backward-compat
  // guarantee is enforced by control flow, not by comment.
  //
  // The default decider now DOES have a real option source, but still resolves
  // `'allow'` for every prompt because `promptTextForHook()` is a stub (see it
  // below) — pinned by `windsurf-hook-option-wiring.test.ts`.
  // H9 (owner ruling 2026-08-13): the DEFAULT submit decision now runs Layer
  // C's `nexpath stop` inside the hold — the complete old popup surface (MPS
  // sequence → PE popup → advisory popup) at submit time; a selection blocks
  // and the extension injects it. The H3 advisory-only decider stays exported
  // for injected wirings and its own tests.
  const stopChildRef: { current: ChildProcess | null } = { current: null };
  const decidePromptSubmit = deps.decidePromptSubmit
    ?? buildStopDrivenPromptSubmitDecider(opts, {
      host: 'windsurf',
      onChild: (c) => { stopChildRef.current = c; },
    });

  try {
    // ── Prompt-submit-time advisory (hook milestone H2) ────────────────────
    // Gated behind NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY=1, default OFF. When
    // off, this block is skipped entirely and everything below is byte-identical
    // to the shipped behaviour — that is the milestone's core guarantee.
    //
    // Windsurf's `pre_user_prompt` contract is exit-code only: exit 2 blocks the
    // prompt before Cascade ever sees it (empirically confirmed — Cascade renders
    // "1 hook(s) blocked this action" and produces no response). Any other exit
    // code lets it through.
    //
    // FAIL-OPEN (amendment A3) is mandatory here: today a failure means no
    // advisory appears and the user loses nothing, but under this flow a failure
    // while the prompt is held would mean the prompt never sends — strictly
    // worse. So only an explicit 'block' decision exits 2; a thrown decider, an
    // unknown value, or anything unexpected falls through to the normal exit-0
    // path below.
    if (event === 'pre_user_prompt' && isSubmitAdvisoryEnabledForHost('windsurf', { env, readFlagFile: deps.readFlagFile })) {
      // RC35: env-gate parity with cursor_hook_gate. Cursor has logged
      // has_display/has_dbus since day one; Windsurf never did — which left
      // every "popup never appeared" report on this host env-blind. The 08-21
      // failure was exactly that: Windsurf spawns hooks with the GUI session
      // stripped, so the popup host cannot render and stop exits silently.
      log('info', 'windsurf_hook_gate', {
        enabled: true,
        has_display: Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
        has_dbus: Boolean(process.env.DBUS_SESSION_BUS_ADDRESS),
        has_xdg_runtime: Boolean(process.env.XDG_RUNTIME_DIR),
        has_xauthority: Boolean(process.env.XAUTHORITY),
      });
      // ── stdin is single-read, so it is consumed HERE and handed onward ────
      // `handleWindsurfHookCli` normally reads stdin itself. The decider needs the
      // same bytes (it must see the user's prompt text), and a pipe cannot be read
      // twice — so with the switch ON we read once here and replay the buffer into
      // `handle` below via `readStdin`. With the switch OFF we never read, and
      // `handle` consumes stdin exactly as it always has.
      // BOUNDED (amendment A3). `defaultReadStdin` resolves only on stdin 'end';
      // if the caller never closes the pipe, an unbounded await would hang the
      // hook WHILE HOLDING THE USER'S PROMPT — strictly worse than no advisory.
      // On timeout we fall through with '' , which the decider treats as 'allow'.
      // ── H4: ONE budget for the whole hold ────────────────────────────────
      // Started here, drawn down by every segment below. Per-segment timeouts
      // would SUM (2s + 600s + an unbounded popup), which is not a 60-90s cap by
      // any reading. Self-enforced: R2 says Cursor orphans timed-out hooks, so a
      // host-enforced bound is no bound at all.
      hold = deps.holdBudget ?? createHoldBudget();

      const stdinRes = await hold.run(() => Promise.race([
        readStdin(),
        new Promise<string>((r) => {
          const t = setTimeout(() => r(''), stdinTimeoutMs);
          if (typeof t.unref === 'function') t.unref();
        }),
      ]));
      preReadRaw = stdinRes.value ?? '';
      // ── RC64: duplicate-invocation guard — MUST run before anything else
      // spawns. A twin invocation (global + workspace registration, newer
      // Devin executes both) would otherwise run its OWN auto + popup +
      // block + delivery for the same submit. The twin ends here with exit 0;
      // the primary's exit 2 still blocks (Windsurf blocks on ANY hook's 2).
      {
        const dupCheck = (deps.checkDuplicateInvocation ?? isDuplicateWindsurfInvocation)(
          opts.project ?? process.cwd(), event, parsePayload(preReadRaw));
        if (dupCheck.duplicate) {
          log('warn', 'windsurf_hook_duplicate_invocation', { event, key_kind: dupCheck.key_kind });
          exit(0);
          return;
        }
      }
      // ── ORDERING (owner ruling: option A) ────────────────────────────────
      // The decision is DEFERRED to after `handle` + the child await below.
      // The option source reads the `pending_advisory` row that `nexpath auto`
      // writes, and `auto` is spawned by `handle`. Deciding here would read the
      // PREVIOUS turn's classification and advise on the wrong prompt.
      // Cost, accepted deliberately: `auto`'s runtime (including its LLM
      // classification) now sits inside the blocking window.
      pendingPromptText = parsePayload(preReadRaw)?.tool_info?.user_prompt ?? '';
      decideAfterAuto = true;
      // ── VED-PE-10: our own replacement re-entering must not re-advise ────
      // Checked BEFORE `handle` spawns auto: after that, auto consumes the
      // `lastInjectedPrompt` guard and the echo becomes unrecognisable — the
      // exact race that double-popped and stalled the replacement ~57 s
      // (measured live 2026-08-13). On an echo the deferred decision is simply
      // not armed; everything else (auto, capture guard) runs as today.
      if (pendingPromptText.trim() !== '') {
        // ── RC12 primary root cause (live block LOOP, 2026-08-13): this passed
        // `opts.project` ALONE, but the registered hook command carries no
        // `--project`, so it was ALWAYS undefined in production and the echo
        // check bailed before reading the store — the skip never fired once on
        // Windsurf. Resolve with the SAME fallback chain the stop decider uses
        // when it WRITES `lastInjectedPrompt` (`opts.project ?? process.cwd()`;
        // Windsurf sets cwd to the active workspace folder), so read and write
        // land on the same projectRoot.
        const echoProjectRoot = opts.project ?? process.cwd();
        const echoRes = await hold.run(() =>
          (deps.checkReplacementEcho ?? isReplacementEcho)(echoProjectRoot, pendingPromptText));
        if (!echoRes.timedOut && echoRes.value === true) {
          decideAfterAuto = false;
          log('info', 'windsurf_hook_echo_skip', { prompt_len: pendingPromptText.length });
        }
      }
    }

    // ── OWNER RULING 2026-08-12: switch ON ⇒ the old advisory surface is OFF ──
    // Same single-read constraint as the pre leg: stdin is consumed here and
    // replayed into `handle` below. No hold budget — nothing is being held on
    // the post-response leg; the bounded read protects against a never-closing
    // pipe only. Session-scoped: only THIS trajectory's pending advisories are
    // consumed, so concurrent sessions keep their own state. With the switch
    // off this block is skipped entirely (byte-identical shipped behaviour).
    if (event === 'post_cascade_response' && isSubmitAdvisoryEnabledForHost('windsurf', { env, readFlagFile: deps.readFlagFile })) {
      const postBound = deps.postStdinTimeoutMs ?? 15_000;
      const raw = await Promise.race([
        readStdin(),
        new Promise<string>((r) => {
          const t = setTimeout(() => r(''), postBound);
          if (typeof t.unref === 'function') t.unref();
        }),
      ]);
      preReadRaw = raw ?? '';
      // ── RC64: same duplicate guard on the post leg. The suppression sweep
      // below is idempotent, but the RC41 continuation is NOT — a twin
      // invocation would open a SECOND MPS popup for the same response event.
      // The primary runs everything; the twin ends here.
      {
        const dupCheck = (deps.checkDuplicateInvocation ?? isDuplicateWindsurfInvocation)(
          opts.project ?? process.cwd(), event, parsePayload(preReadRaw));
        if (dupCheck.duplicate) {
          log('warn', 'windsurf_hook_duplicate_invocation', { event, key_kind: dupCheck.key_kind });
          exit(0);
          return;
        }
      }
      const sessionId = parsePayload(preReadRaw)?.trajectory_id ?? '';
      if (sessionId) {
        const suppress = deps.suppressOldAdvisorySurface ?? suppressOldAdvisorySurfaceForSession;
        try {
          await suppress(opts.project ?? process.cwd(), sessionId);
        } catch { /* fail-open — worst case is today's popup; the sweep logs its own failures */ }
      } else {
        // Leaves a trace for live debugging: an empty session here means the
        // payload was missing/late — the exact silent-skip found 2026-08-12.
        log('warn', 'windsurf_hook_suppression_skipped', { reason: preReadRaw === '' ? 'stdin_timeout_or_empty' : 'no_trajectory_id' });
      }
    }

    // ── RC41: the MPS continuation trigger (Windsurf half) ───────────────────
    // `post_cascade_response` IS this host's "response finished" event — the
    // honest analog of the Claude Stop that drives the CLI's continuation
    // chain (stop.ts: next Stop with stop_hook_active:true → continuation
    // launcher → popup → block(item body), UN-GATED since 2026-08-17). With
    // the switch ON and an active sequence, run the SAME continuation Stop and
    // hand its block to the proven delivery pipeline (decision file → poller →
    // settle → inject → auto-submit → echo registry). When it ran, exit here:
    // the normal `handle` below would spawn a SECOND stop for the same event.
    // No sequence / switch off ⇒ {ran:false} ⇒ fall through — the old flow is
    // byte-identical.
    if (event === 'post_cascade_response' && isSubmitAdvisoryEnabledForHost('windsurf', { env, readFlagFile: deps.readFlagFile })) {
      const contRoot = opts.project ?? process.cwd();
      const cont = await (deps.runSequenceContinuation ?? runSequenceContinuationStop)(contRoot, 'windsurf');
      // RC43: a DEFERRED result (quiet-window echo of our own block) must ALSO
      // end this event — the old-flow `handle` below reaches runStop's no-block
      // path, which routes to the SAME continuation launcher and would reopen
      // the premature popup this guard just suppressed. The item's real
      // completion event arrives after the window and proceeds normally.
      if (cont.ran || cont.deferred === true) {
        log('info', 'windsurf_hook_sequence_continuation', { blocked: cont.blocked === true, deferred: cont.deferred === true });
        exit(0);
        return;
      }
      // RC46 (Windows tester, 2026-08-22 — the "second popup killed my
      // auto-submit" round): the RC43 quiet window lived INSIDE the runner,
      // which returns {ran:false} BEFORE consulting it when no sequence row
      // exists — so on a plain PE/advisory turn the 1–4 s post-block echo of
      // post_cascade_response sailed straight through to the old-flow `handle`
      // below, spawned a second stop, and its console stole the foreground at
      // the exact moment the win32 AppActivate+Enter fired (submit_failed,
      // stranded composer, merged prompts — the tester's log at 14:10:03Z).
      // Same guard, same anchor, one level up: within the quiet window of OUR
      // OWN last block, this event is the block's echo — end it. The item's
      // real response completion arrives later and falls through unchanged.
      try {
        const lastBlockAt = latestReplacementEchoAt(contRoot);
        const nowMs = Date.now();
        if (lastBlockAt !== null && nowMs - lastBlockAt < SEQUENCE_CONTINUATION_QUIET_MS) {
          log('info', 'windsurf_hook_post_leg_quiet_deferred', { age_ms: nowMs - lastBlockAt });
          exit(0);
          return;
        }
      } catch { /* fail-open: exactly the pre-RC46 fall-through */ }
      // ── RC58 (Windows/Devin 2026-08-24 — "second popup, Enter does nothing") ──
      // With the switch ON, the old-flow `handle` below MUST NOT run on this
      // event at all. It spawns the old-flow stop, which can render a PE or
      // feedback popup at POST-RESPONSE timing — but under the armed submit
      // surface the extension suppresses the old delivery bridge
      // (`suppressDsAdvisory` — extension.ts:1068 / chat-pipeline.ts:236), so a
      // selection made in that popup is UNDELIVERABLE: it renders, the user
      // picks, nothing injects. The window for it is real and intermittent —
      // the next prompt's `auto` takes 15–30 s of LLM time, so its pending row
      // often lands AFTER that submit's decider already looked, sits pending,
      // and the response-finished event then surfaces it at the old timing.
      // H9's ruling ("ALL popups — at submit time") already decided this: the
      // row waits for the NEXT submit, where the decider shows it through the
      // PROVEN delivery path. Switch OFF ⇒ this whole branch is unreachable
      // and the old flow is byte-identical.
      log('info', 'windsurf_hook_post_leg_closed', { reason: 'submit_flow_active' });
      exit(0);
      return;
    }

    // Name this surface for Layer C's popup "Send to …" label. The spawned
    // `nexpath stop` child inherits process.env (see windsurf-hook/spawn.ts
    // baseOpts), so setting it here makes the Windsurf popup say "Windsurf".
    env.NEXPATH_AGENT = 'windsurf';
    // Call shape is IDENTICAL to before when nothing was pre-read, so the
    // switch-off path passes exactly two arguments as it always has. Only the
    // gated path adds the replay dep.
    const result = preReadRaw === null
      ? await handle(event, opts)
      : await handle(event, opts, { readStdin: async () => preReadRaw as string });
    // The stop event opens Layer C's popup window (advisory, feedback, or
    // prompt-enhancement). On Linux, GNOME opens it behind Windsurf — raise it
    // to the front. The extension's popup-foreground never runs here (Windsurf
    // spawns `stop` via this hook, not via ipc). Fire-and-forget; unref'd so it
    // never keeps the hook process alive.
    if (event === 'post_cascade_response' && result.child) {
      raisePopup();
    }
    // Await the Layer-C child so the prompt is fully written + auto has
    // persisted the advisory (and stop has rendered the popup) before we exit.
    // The child await is the biggest term in the hold: option-A ordering means
    // `auto` (including its LLM classification) runs inside it. Drawn from the
    // shared budget rather than awaitChild's own 600s default.
    if (hold) {
      const waited = await hold.run(() => waitForChild(result.child));
      if (waited.timedOut) {
        // Fail-open (A3): release the prompt unmodified. Do NOT decide - the
        // classification this turn depends on never landed.
        //
        // DEFENCE-IN-DEPTH, not the load-bearing guard: `hold.run()` reports
        // `timedOut` only when the budget is exhausted, and an exhausted budget
        // refuses to START the next segment, so the decision below cannot run
        // either way. Verified by mutation: removing this line kills no test.
        // Kept because it states the intent locally instead of relying on a
        // property of another module.
        decideAfterAuto = false;
        // No orphan may survive the hold (plan acceptance). The child is
        // detached from our lifetime explicitly rather than left running.
        killProcessTree(result.child); // RC62: take the popup terminal too
      }
    } else {
      await waitForChild(result.child);
    }

    // ── Deferred submit decision (option A) ────────────────────────────────
    // `auto` has now persisted this turn's classification, so the option source
    // reads the CURRENT signal. Fail-open (A3) is unchanged: only an explicit
    // 'block' exits 2; a throw or any other value falls through to exit 0.
    if (decideAfterAuto) {
      let decision: WindsurfPromptSubmitDecision = 'allow';
      // Raise the submit popup to the foreground (fire-and-forget) BEFORE the
      // blocking decision — the submit popup opens behind Windsurf under GNOME
      // focus-stealing prevention just like the post-response one, so without
      // this the user may not see it and the hold times out to fail-open. Same
      // raiser used for the post_cascade_response popup above.
      raisePopup();
      // The popup waits for a HUMAN, so this segment is inherently unbounded and
      // is the plan's "no decision before the hold expires" failure mode. It gets
      // only what the earlier segments left.
      const decided = hold
        ? await hold.run(() => decidePromptSubmit(event, opts, pendingPromptText))
        : { timedOut: false, value: await decidePromptSubmit(event, opts, pendingPromptText).catch(() => 'allow' as const) };
      if (decided.timedOut) {
        // Hold exhausted while stop's popup waited — reap it so no popup
        // process outlives the hook (mirrors the auto orphan-kill above).
        killProcessTree(stopChildRef.current); // RC62: take the popup terminal too
      }
      // `!decided.timedOut` is likewise redundant today (a timed-out run yields
      // no value, so `value === 'block'` is already false) and equally kept as an
      // explicit statement of the rule: a timeout is never a decision.
      if (!decided.timedOut && decided.value === 'block') decision = 'block';
      if (decision === 'block') {
        // ── RC14 (owner demand, verified live 2026-08-14): Cascade's block card
        // is "%d hook(s) blocked this action: %s", where %s is THIS process's
        // STDERR on exit 2 — the vendor default "Action blocked by hook" fills
        // in only when stderr is empty (template + default extracted from
        // language_server_linux_x64; stderr substitution proven with a probe
        // hook whose stderr text rendered in the card). The card TRUNCATES at a
        // word boundary (~24 chars observed), so the key phrase leads and the
        // sentence degrades cleanly wherever it is cut.
        try { process.stderr.write(WINDSURF_BLOCK_CARD_MESSAGE); } catch { /* card falls back to vendor text */ }
        exit(2);
        return;
      }
    }
  } catch {
    // Never break Cascade — swallow any error and exit cleanly.
  }
  exit(0);
}

export function registerWindsurfHookCommand(program: Command): void {
  program
    .command('windsurf-hook <event>')
    .description('Internal: bridge a Windsurf Cascade hook to nexpath auto/stop (configured by `nexpath install`).')
    .option('-p, --project <dir>', 'Project root (defaults to the current working directory)')
    .action(async (event: string, opts: { project?: string }) => {
      await runWindsurfHookAction(event, opts);
    });
}
