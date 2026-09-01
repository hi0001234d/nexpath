/**
 * Extension-side runtime for the submit-time advisory (hook milestone H3, Gap 2).
 *
 * Two small pieces the wiring in `extension.ts` needs, kept here rather than
 * inline so both are unit-testable without an extension host.
 *
 * ── THE SWITCH ───────────────────────────────────────────────────────────────
 * This is the extension-side twin of the CLI's
 * `isWindsurfPromptSubmitAdvisoryEnabled` (`src/cli/commands/windsurf-hook.ts`).
 * It is duplicated ON PURPOSE rather than imported: `src/ext-vscode` is a separate
 * npm package and cannot import from `src/cli` — the same `rootDir`/`TS6059` wall
 * the PE milestone hit six times (see `G-ROOTDIR`). The duplication is a single
 * literal plus an exact-equality read, and `submit-advisory-runtime.test.ts` pins
 * the env-var NAME so the two halves can never silently diverge.
 *
 * Read semantics match the CLI exactly: enabled only for the literal `'1'`.
 * Unset, `'0'`, `'true'` — anything else — leaves today's behaviour untouched.
 *
 * ── THE STORE READ ───────────────────────────────────────────────────────────
 * The hook persists a decision, blocks the prompt, and exits; the extension picks
 * the decision up. The handoff is a small JSON file per project root rather than a
 * SQLite table because the extension must read it from a *different process* that
 * has already exited, and a plain file needs no schema migration in a phase that
 * may yet be reshaped.
 *
 * Every failure resolves to `null` — missing file, unreadable file, malformed
 * JSON, or a record that fails validation. `null` means "nothing pending", which
 * is the fail-open outcome (`A3`): the user simply keeps whatever the hook left.
 */
import { readFile, unlink } from 'node:fs/promises';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  parseSubmitDecisionJsonV1,
  type SubmitDecisionRecordV1,
} from './submit-decision-record.js';

/** Must stay byte-identical to the CLI's constant — pinned by test. */
/** `~/.nexpath/session-env.json` — read by the CLI decider before spawning
 *  `stop`. Duplicated from the CLI (G-ROOTDIR wall); pinned by contract test. */
export const SESSION_ENV_SNAPSHOT_FILENAME = 'session-env.json';

const SESSION_ENV_SNAPSHOT_KEYS = [
  'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
  'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE', 'XDG_DATA_DIRS', 'XDG_CURRENT_DESKTOP',
  'LANG', 'TERM',
] as const;

/**
 * RC35: persist the GUI session env for the CLI's popup host.
 *
 * The extension host runs INSIDE the editor's desktop session, so its env is
 * the real one. Windsurf spawns its Cascade hooks with that session STRIPPED
 * (measured 2026-08-21: identical hook + rows popped under the desktop env and
 * sat silent under the hook env; Cursor, which passes the session through, was
 * fine minutes apart on the same machine). The CLI decider fills ONLY missing
 * vars from this snapshot — it never overrides the hook env.
 *
 * Linux-only by construction (these vars are meaningless elsewhere), and pure
 * best-effort: any write failure is swallowed — the decider treats a missing
 * snapshot as "no enrichment", which is exactly today's behaviour.
 */
export function writeSessionEnvSnapshot(deps: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  writeFile?: (path: string, data: string) => void;
  nexpathHome?: string;
} = {}): boolean {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'linux') return false;
  const env = deps.env ?? process.env;
  const snap: Record<string, string> = {};
  for (const k of SESSION_ENV_SNAPSHOT_KEYS) {
    const v = env[k];
    if (typeof v === 'string' && v.length > 0) snap[k] = v;
  }
  if (Object.keys(snap).length === 0) return false;
  try {
    const home = deps.nexpathHome ?? join(homedir(), '.nexpath');
    const write = deps.writeFile ?? ((p2: string, d: string) => {
      mkdirSync(dirname(p2), { recursive: true });
      writeFileSync(p2, d, 'utf8');
    });
    write(join(home, SESSION_ENV_SNAPSHOT_FILENAME), JSON.stringify(snap, null, 2));
    return true;
  } catch {
    return false; // best-effort — never break activation
  }
}

export const WINDSURF_SUBMIT_ADVISORY_ENV = 'NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY';

/**
 * The config-backed submit-flow flag (owner ruling 2026-08-12) — the shipped,
 * developer-controlled switch. MIRROR of the CLI's `submit-flow-config.ts`:
 * `~/.nexpath/submit-flow.json` = `{ "cursor": bool, "windsurf": bool }`. Env var
 * (below) overrides it. Cannot import the CLI resolver (separate package,
 * G-ROOTDIR), so the filename + shape are duplicated and pinned by a contract
 * test. Kept out of the nexpath config table on purpose so it never appears in
 * `nexpath status`/`config` — invisible to end users by construction.
 */
export const SUBMIT_FLOW_FLAG_FILENAME = 'submit-flow.json';

/**
 * Read the shipped flag file. EXPORTED so tests can (a) pin its semantics and
 * (b) inject a stub into the switch resolvers below — without the stub, the
 * suite's result depends on whatever `~/.nexpath/submit-flow.json` happens to
 * be on the developer's machine (found live 2026-08-13: the whole env-semantics
 * describe failed on any machine where the shipped flag was ON).
 */
export function readSubmitFlowFlag(host: 'cursor' | 'windsurf'): boolean {
  try {
    const raw = readFileSync(join(homedir(), '.nexpath', SUBMIT_FLOW_FLAG_FILENAME), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed[host] === true;
  } catch {
    return false; // absent / unreadable / garbage ⇒ old flow (safe default)
  }
}

/** Absolute path of the shipped flag file (single source for logs + readers). */
export function submitFlowFlagPath(): string {
  return join(homedir(), '.nexpath', SUBMIT_FLOW_FLAG_FILENAME);
}

export interface SubmitFlowGateExplanation {
  enabled: boolean;
  /** Human-readable, PII-free reason — safe to log verbatim. */
  reason: string;
}

/**
 * WHY the submit flow is (not) enabled for `host` — RC19.
 *
 * ── THE FAILURE THIS EXISTS FOR (Windows tester, 2026-08-17) ────────────────
 * When the flow did not arm, the extension logged NOTHING: the ENABLED line was
 * simply absent, so a live diagnosis meant guessing between "flag file missing",
 * "this host's key never written", "corrupt JSON" and "env override". Silence is
 * not an acceptable failure mode for a switch that decides the entire product
 * surface — every disarmed activation must say why, on every OS.
 *
 * Resolution order MIRRORS `is{Windsurf,Cursor}SubmitAdvisoryEnabled` exactly
 * (env '1'/'0' override → flag file → OFF); a contract test pins that the two
 * can never disagree.
 */
export function explainSubmitFlowGate(
  host: 'cursor' | 'windsurf',
  env: NodeJS.ProcessEnv = process.env,
  readRaw: (path: string) => string | null = (p) => {
    try { return readFileSync(p, 'utf8'); } catch { return null; }
  },
): SubmitFlowGateExplanation {
  const envName = host === 'cursor' ? CURSOR_SUBMIT_ADVISORY_ENV : WINDSURF_SUBMIT_ADVISORY_ENV;
  const v = env[envName];
  if (v === '1') return { enabled: true, reason: `env override ${envName}=1 (forced ON)` };
  if (v === '0') return { enabled: false, reason: `env override ${envName}=0 (developer revert to the old flow)` };

  const path = submitFlowFlagPath();
  const raw = readRaw(path);
  if (raw === null) {
    return { enabled: false, reason: `flag file not found or unreadable at ${path} — run "Nexpath: Set up CLI"` };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { enabled: false, reason: `flag file is not valid JSON (${path}) — run "Nexpath: Set up CLI"` };
  }
  if (parsed[host] === true) return { enabled: true, reason: `flag file has ${host}=true` };
  // The per-host gap that produced the Windows failure: a machine registered for
  // the OTHER editor has the file but not this host's key.
  const keys = Object.keys(parsed).join(', ') || '(none)';
  return {
    enabled: false,
    reason: parsed[host] === false
      ? `flag file has ${host}=false (this editor is deliberately on the old flow)`
      : `flag file has no "${host}" key — this editor was never registered (keys present: ${keys}); run "Nexpath: Set up CLI"`,
  };
}

/** How the resolvers consult the flag file; injectable for hermetic tests. */
export type ReadSubmitFlowFlagFn = (host: 'cursor' | 'windsurf') => boolean;

/**
 * Windsurf submit-flow ON? Env var (`'1'`/`'0'`) is the developer override and
 * wins; otherwise the shipped `~/.nexpath/submit-flow.json` flag decides;
 * otherwise OFF (old flow byte-identical). Mirrors the CLI resolver.
 */
export function isWindsurfSubmitAdvisoryEnabled(
  env: NodeJS.ProcessEnv = process.env,
  readFlag: ReadSubmitFlowFlagFn = readSubmitFlowFlag,
): boolean {
  const v = env[WINDSURF_SUBMIT_ADVISORY_ENV];
  if (v === '1') return true;
  if (v === '0') return false;
  return readFlag('windsurf');
}

/** Where the hook parks a decision for a given project root. */
export function submitDecisionPath(projectRoot: string): string {
  return join(projectRoot, '.nexpath', 'submit-decision.json');
}

export interface SubmitDecisionReaderDeps {
  /** Injected for tests; defaults to the real fs read. */
  read?: (path: string) => Promise<string>;
  /** Injected for tests; defaults to the real fs unlink. */
  remove?: (path: string) => Promise<void>;
  /** Injected for tests; defaults to a real `kill(pid, 0)` liveness probe. */
  isProcessAlive?: (pid: number) => boolean;
  /** Which host's records to accept. Defaults to `'windsurf'` (H3 behaviour). */
  expectedHost?: 'windsurf' | 'cursor';
}

/**
 * Read (and consume) the pending decision for a root.
 *
 * **Consumed on read, deliberately.** The record is a one-shot handoff: leaving it
 * in place would let a later turn re-deliver a decision the user already saw. The
 * poller has its own `decisionId` dedup and a stale-turn guard, but deleting here
 * means a *restarted* extension cannot replay an old decision either — the guards
 * are per-process and would not catch that.
 *
 * Deletion failure is ignored: the record was already parsed successfully, and the
 * poller's guards still prevent a duplicate delivery within this process. Failing
 * the read because cleanup failed would lose a valid decision for no benefit.
 */
/**
 * RC30 — how long, after the hook itself has exited, we still wait for the SHELL
 * that spawned it (win32 only; `hookShellPid` is absent everywhere else).
 *
 * Bounded on purpose. The wrapper exits within milliseconds of its child in
 * practice, but a pid can be reused or a wrapper can wedge, and a decision that
 * is never delivered is worse than one delivered slightly early: the user's
 * prompt was already blocked, so nothing would arrive at all. Measured from
 * `blockIssuedAt` (the record is persisted immediately after), not from
 * `createdAt`, which can trail a long human decision.
 */
export const SHELL_EXIT_GRACE_MS = 10_000;

/**
 * The block/injection race guard.
 *
 * `hookPid` alone is correct on POSIX, where Cascade runs the `command` field
 * directly. On Windows it runs the `powershell` field, so the tree is
 * `powershell.exe -> node.exe`: `hookPid` is node, but the host only cancels the
 * original prompt when the WRAPPER exits. Waiting on node alone cleared ~58 ms
 * too early and the replacement queued behind a still-live prompt.
 *
 * Returns true while delivery must be deferred. With no `hookShellPid` — every
 * POSIX record, and every record written before RC30 — this is exactly the
 * pre-RC30 expression, so Linux/macOS behaviour is unchanged by construction.
 */
/**
 * RC39: after the win32 WRAPPER dies, wait one settle interval before
 * delivering. The wrapper's exit is when the host RECEIVES the blocking exit
 * code — processing the cancel (tearing down the held submission, freeing the
 * composer) takes a beat longer. Injecting inside that beat is how the
 * replacement ended up QUEUED behind a still-live turn on Devin/Windows. One
 * short settle lets the cancel land so the inject REPLACES instead of queueing.
 * POSIX records carry no `hookShellPid`, so this whole mechanism is unreachable
 * there (pinned) — Linux/macOS behaviour is unchanged by construction.
 */
export const SHELL_EXIT_SETTLE_MS = 1_500;

/** blockIssuedAt+shellPid → when the wrapper was FIRST observed dead. Entries
 *  are dropped once delivered/expired; keyed per decision so retries are cheap. */
const shellDeadSeenAt = new Map<string, number>();

export function shouldDeferForHookExit(
  record: { hookPid: number; hookShellPid?: number; blockIssuedAt: number },
  isAlive: (pid: number) => boolean,
  now: number,
): boolean {
  // RC63 (marketplace smoke test, Windows/Cursor 2026-08-24): the grace cap
  // must be the FIRST check. It used to sit after the hookPid-alive test, so
  // it capped a lingering SHELL but not a lingering hookPid — and on Windows
  // the dead hook's pid gets recycled to unrelated processes, which made
  // `isAlive(hookPid)` true for as long as the pid's NEW owner lived: the
  // smoke test observed its decision 32 s late (sinceBlockIssuedMs: 32063),
  // and a pid recycled to a system process (EPERM ⇒ alive) would have stalled
  // FOREVER. A real hook can never be alive 10 s after its own block — the
  // block IS its exit — so past the grace window every "alive" answer is the
  // recycling artifact. Latent since RC40 (probabilistic, dice per turn), not
  // a regression of any later change.
  if (now - record.blockIssuedAt > SHELL_EXIT_GRACE_MS) return false; // never stall — caps EVERY check below
  if (isAlive(record.hookPid)) return true;
  if (record.hookShellPid !== undefined && isAlive(record.hookShellPid)) return true;
  // ── RC40 (measured LIVE on Ubuntu, 2026-08-21 12:52): the settle applies to
  // EVERY platform, not just the win32 wrapper. The host cancels the held
  // prompt when the hook exits, but PROCESSING that cancel takes a beat — and
  // the poll tick can land inside it: the 12:52 turn observed the decision
  // +45ms after the block and injected +82ms; Windsurf was still tearing the
  // held submission down, so the replacement landed in the QUEUE ("1 message
  // queued") instead of the idle composer — the identical symptom Windows
  // showed chronically. One settle interval after the LAST relevant pid is
  // first seen dead closes the race everywhere; the grace cap above still
  // guarantees delivery can never stall.
  const lastPid = record.hookShellPid ?? record.hookPid;
  const key = `${record.blockIssuedAt}:${lastPid}`;
  const seen = shellDeadSeenAt.get(key);
  if (seen === undefined) {
    shellDeadSeenAt.set(key, now);
    if (shellDeadSeenAt.size > 64) {
      // bounded: drop the oldest entries so a long session cannot grow this
      const oldest = [...shellDeadSeenAt.entries()].sort((x, y) => x[1] - y[1]).slice(0, 32);
      for (const [k] of oldest) shellDeadSeenAt.delete(k);
    }
    return true;
  }
  if (now - seen < SHELL_EXIT_SETTLE_MS) return true;
  shellDeadSeenAt.delete(key);
  return false;
}

/**
 * Is a pid still running? Cross-OS: `kill(pid, 0)` sends no signal and is
 * supported on Linux, macOS and Windows. `EPERM` means the process EXISTS but is
 * not ours, so it counts as alive; only `ESRCH` (no such process) means gone.
 * Any unexpected error is treated as ALIVE, which defers rather than risking the
 * double-prompt — the conservative direction.
 */
export function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code !== 'ESRCH';
  }
}

/**
 * Cursor's switch — the extension-side mirror of the CLI's
 * `NEXPATH_CURSOR_PROMPTSUBMIT_ADVISORY`.
 *
 * Duplicated from the CLI for the same reason as the Windsurf one: `src/cli` and
 * `src/ext-vscode` are separate packages that cannot import each other. Pinned by
 * test so the two halves cannot silently diverge. Independent of Windsurf's
 * switch — the platforms must be enablable separately.
 */
export const CURSOR_SUBMIT_ADVISORY_ENV = 'NEXPATH_CURSOR_PROMPTSUBMIT_ADVISORY';

/**
 * Cursor submit-flow ON? Same resolution as Windsurf: env override (`'1'`/`'0'`)
 * wins, else the shipped `~/.nexpath/submit-flow.json` flag, else OFF.
 */
export function isCursorSubmitAdvisoryEnabled(
  env: NodeJS.ProcessEnv = process.env,
  readFlag: ReadSubmitFlowFlagFn = readSubmitFlowFlag,
): boolean {
  const v = env[CURSOR_SUBMIT_ADVISORY_ENV];
  if (v === '1') return true;
  if (v === '0') return false;
  return readFlag('cursor');
}

/**
 * Non-consuming PEEK at the pending submit decision (H8, `G-ARBITRATION`
 * Finding 1).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The hook's re-entry guard writes the replacement into
 * `session_states.lastInjectedPrompt` so `auto` skips the injected turn. On
 * Windsurf that SAME field is also the DS advisory-poller's delivery-bridge
 * signal (`advisory-poller.ts` — "bridge the popup selection"), so the DS
 * poller would inject the replacement a SECOND time alongside the submit
 * poller's own delivery. The DS poller's guard needs to ask "is this text a
 * submit-flow replacement?" — and it may ask BEFORE the submit poller has
 * consumed the decision (tick order is non-deterministic), so the answer must
 * not consume the record. No `remove`, no `hookPid` liveness gate (we are not
 * delivering — just identifying), no side effects at all.
 */
export async function peekPendingSubmitDecision(
  projectRoot: string,
  deps: SubmitDecisionReaderDeps = {},
): Promise<SubmitDecisionRecordV1 | null> {
  const path = submitDecisionPath(projectRoot);
  const read = deps.read ?? ((p: string) => readFile(p, 'utf8'));
  const expectedHost = deps.expectedHost ?? 'windsurf';

  let text: string;
  try {
    text = await read(path);
  } catch {
    return null; // absent is the common case, not an error
  }
  const record = parseSubmitDecisionJsonV1(text);
  if (!record) return null;
  if (record.host !== expectedHost) return null;
  return record;
}

/** Where the hook mirrors the record, cwd-independently (RC22). */
export function submitDecisionMirrorPath(): string {
  return join(homedir(), '.nexpath', 'submit-decision.json');
}

/**
 * Compare two filesystem roots the way the OS would.
 *
 * Windows made this necessary: the hook's `process.cwd()` and VS Code's
 * `workspaceFolders[0].fsPath` routinely differ in separator style and drive
 * letter case (`c:\Users\…` vs `C:\Users\…`) for the SAME directory. A
 * strict string compare would reject a perfectly valid record.
 */
export function sameRoot(a: string, b: string): boolean {
  const norm = (v: string) => v.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/** How stale a mirrored record may be before it is discarded (ms). */
export const MIRROR_MAX_AGE_MS = 90_000;

/**
 * Read (and consume) the USER-LEVEL mirror — the cwd-independent handoff (RC22).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The primary record lives at `<projectRoot>/.nexpath/submit-decision.json`,
 * where `projectRoot` is the HOOK's `process.cwd()`. Cascade's payload carries
 * no workspace, so when that cwd is not the folder the editor has open — the
 * normal situation for the Windows/Devin WORKSPACE hook, which is the only hook
 * Windows executes — the block still happens but the replacement is written
 * where no poller looks. The user's prompt is cancelled and nothing arrives.
 * The OLD flow never had this failure mode because it handed off through the
 * per-user store; this restores that property.
 *
 * ACCEPTANCE (deliberately conservative — a wrong-window injection would be
 * worse than a missed one):
 *   1. the record's `projectRoot` matches one of this window's roots, OR
 *   2. the record carries no usable root AND this window has exactly ONE root
 *      AND the record is fresh (< MIRROR_MAX_AGE_MS) — one editor, one project,
 *      a decision seconds old, same host: there is no other window it could
 *      belong to.
 * Everything else is left on disk (a different window may still claim it) and
 * simply expires.
 */
export async function readPendingSubmitDecisionMirror(
  roots: readonly string[],
  deps: SubmitDecisionReaderDeps & { now?: () => number; path?: string } = {},
): Promise<SubmitDecisionRecordV1 | null> {
  const path = deps.path ?? submitDecisionMirrorPath();
  const read = deps.read ?? ((p: string) => readFile(p, 'utf8'));
  const remove = deps.remove ?? ((p: string) => unlink(p));
  const isAlive = deps.isProcessAlive ?? defaultIsProcessAlive;
  const expectedHost = deps.expectedHost ?? 'windsurf';
  const now = deps.now ?? (() => Date.now());

  let text: string;
  try {
    text = await read(path);
  } catch {
    return null;
  }
  const record = parseSubmitDecisionJsonV1(text);
  if (!record) return null;
  if (record.host !== expectedHost) return null;

  // Expired mirrors are swept so a dead record cannot sit around being retried.
  if (now() - record.createdAt > MIRROR_MAX_AGE_MS) {
    try { await remove(path); } catch { /* best-effort */ }
    return null;
  }
  // Same block/injection race guard as the primary reader: never deliver while
  // the hook that wrote it is still alive (its exit is what cancels the prompt).
  if (shouldDeferForHookExit(record, isAlive, now())) return null;

  const claimable = record.projectRoot
    ? roots.some((r) => sameRoot(r, record.projectRoot as string))
    : roots.length === 1;
  if (!claimable) return null;

  try { await remove(path); } catch { /* one-shot; dedup also guards */ }
  return record;
}

export async function readPendingSubmitDecision(
  projectRoot: string,
  deps: SubmitDecisionReaderDeps = {},
): Promise<SubmitDecisionRecordV1 | null> {
  const path = submitDecisionPath(projectRoot);
  const read = deps.read ?? ((p: string) => readFile(p, 'utf8'));
  const remove = deps.remove ?? ((p: string) => unlink(p));
  const isAlive = deps.isProcessAlive ?? defaultIsProcessAlive;
  const expectedHost = deps.expectedHost ?? 'windsurf';

  let text: string;
  try {
    text = await read(path);
  } catch {
    return null; // absent is the overwhelmingly common case, and not an error
  }

  const record = parseSubmitDecisionJsonV1(text);
  if (!record) return null; // malformed / wrong version / half-written

  // Only Windsurf decisions may be delivered here. A Cursor record reaching this
  // reader would mean a wiring mistake; delivering it would inject into the wrong
  // host, so it is dropped rather than trusted.
  // Deliver only a record written FOR THIS HOST. Cross-host delivery would
  // inject into the wrong editor, so a mismatch is dropped rather than trusted.
  // H6: the expected host is now a parameter — before, `cursor` records were
  // dropped unconditionally, so the Cursor path could never have delivered.
  if (record.host !== expectedHost) return null;

  // ── BLOCK/INJECTION RACE GUARD ────────────────────────────────────────────
  // The hook persists this record BEFORE `exit(2)`, and Windsurf only cancels
  // the prompt once the process actually exits. Injecting inside that window
  // would submit the replacement while the ORIGINAL prompt is still live — two
  // prompts for one submission.
  //
  // Process liveness is the signal: hook alive ⇒ exit code not yet delivered.
  // The check sits BEFORE `remove` deliberately — this reader is one-shot, so
  // consuming and then deferring would destroy the decision permanently. A
  // deferred record stays on disk and is retried on the next poll.
  if (shouldDeferForHookExit(record, isAlive, Date.now())) return null;

  try {
    await remove(path);
  } catch {
    // ignored on purpose — see the note above
  }
  return record;
}
