/**
 * RC50 — duplicate hook-invocation guard (Bhavnesh's 2026-08-23 report §8.1).
 *
 * Cursor on Windows executes MULTIPLE registrations per submit (project-level
 * + byte-identical user-level; a stale claude-settings entry made three).
 * Every registration runs the same command — so one submit would open one
 * popup PER REGISTRATION. Cursor's payload carries a per-submit
 * `generation_id`; the first invocation claims it, later ones with the same
 * key answer `continue` immediately.
 *
 * ── RC56: ATOMIC claim ───────────────────────────────────────────────────────
 * The first cut kept a read-modify-write JSON registry — but the duplicate
 * invocations arrive 2–100 ms apart (measured on the Windows tester), and two
 * processes can both pass the read before either write lands: a coin-flip
 * race, i.e. occasional DOUBLE POPUPS exactly when everything else works.
 * The claim is now an EXCLUSIVE FILE CREATE (`wx`): the filesystem itself
 * arbitrates — exactly one process ever wins a key, no read-modify-write
 * window at all. Stale markers are pruned best-effort on each call.
 *
 * Fail-open by construction: no generation id, or any fs error other than
 * EEXIST ⇒ NOT a duplicate ⇒ exactly the un-guarded behaviour.
 */
import { writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const CURSOR_INVOCATION_DIRNAME = 'cursor-hook-invocations';
export const CURSOR_INVOCATION_MAX_AGE_MS = 10 * 60_000;

/**
 * RC64 — the same duplicate class hit WINDSURF/Devin on Windows (2026-08-25
 * tester screenshot: one submit → TWO different enhancements queued). Windows
 * registers both the global `~/.codeium/windsurf/hooks.json` and the workspace
 * `.windsurf/hooks.json` (RC21-era Devin executed only the workspace file;
 * newer builds execute BOTH). Windsurf's payload carries a per-action
 * `execution_id` — the honest analog of Cursor's `generation_id` — so the
 * identical atomic claim applies; markers just live in their own dir.
 */
export const WINDSURF_INVOCATION_DIRNAME = 'windsurf-hook-invocations';
/**
 * RC64 fallback window, used only when a payload has NO execution_id and the
 * key degrades to trajectory+content-hash. That key REPEATS on a legitimate
 * same-text resubmit, so the window must be shorter than a human retry while
 * still covering the duplicate spawn burst (RC50 measured 2–100 ms apart).
 */
export const WINDSURF_FALLBACK_WINDOW_MS = 10_000;

export function cursorInvocationDir(projectRoot: string): string {
  return join(projectRoot, '.nexpath', CURSOR_INVOCATION_DIRNAME);
}

/** Marker filename for one (event, generationId) — fs-safe. */
export function cursorInvocationMarkerName(event: string, generationId: string): string {
  return `${event}-${generationId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

export interface CursorInvocationGuardDeps {
  now?: () => number;
  /** Exclusive create — MUST throw with code EEXIST when the file exists. */
  writeExclusiveFn?: (p: string) => void;
  mkdirFn?: (p: string) => void;
  readdirFn?: (p: string) => string[];
  /** mtime (ms) of a marker, for pruning. */
  mtimeMsFn?: (p: string) => number;
  removeFn?: (p: string) => void;
  /** RC64: marker directory under `.nexpath/` (default: Cursor's). */
  dirName?: string;
  /**
   * RC64: the claim window. An existing marker OLDER than this is STALE — it
   * is removed and the claim retried, so a repeating key (the windsurf
   * fallback hash) stops deduplicating once the window has passed. Also the
   * pruning age. Default: the original 10-minute Cursor window.
   */
  maxAgeMs?: number;
}

/**
 * True when this (event, generationId) was already CLAIMED by another
 * invocation — the caller answers `continue` and does nothing else. The first
 * caller claims atomically and gets false.
 */
export function checkAndRecordCursorInvocation(
  projectRoot: string,
  event: string,
  generationId: string | undefined,
  deps: CursorInvocationGuardDeps = {},
): boolean {
  try {
    if (!generationId) return false;
    const maxAgeMs = deps.maxAgeMs ?? CURSOR_INVOCATION_MAX_AGE_MS;
    const dir = join(projectRoot, '.nexpath', deps.dirName ?? CURSOR_INVOCATION_DIRNAME);
    const marker = join(dir, cursorInvocationMarkerName(event, generationId));
    const mkdir = deps.mkdirFn ?? ((p: string) => mkdirSync(p, { recursive: true }));
    const writeExclusive = deps.writeExclusiveFn ?? ((p: string) => writeFileSync(p, '', { flag: 'wx' }));
    const mtimeMs = deps.mtimeMsFn ?? ((p: string) => statSync(p).mtimeMs);
    const remove = deps.removeFn ?? ((p: string) => rmSync(p, { force: true }));
    try { mkdir(dir); } catch { /* exists / creatable race — the create below decides */ }
    const attemptClaim = (): 'won' | 'dup' | 'error' => {
      try { writeExclusive(marker); return 'won'; } // ← the atomic claim
      catch (err) { return (err as NodeJS.ErrnoException)?.code === 'EEXIST' ? 'dup' : 'error'; }
    };
    let claim = attemptClaim();
    if (claim === 'dup') {
      // RC64: a marker OLDER than the window is a stale leftover, not a live
      // twin — remove it and retry once. This is what makes short windows
      // honest (pruning only ever ran on WINNERS, so a stale marker could sit
      // forever and dedupe a legitimate repeat of the key). A second EEXIST
      // after the removal means another process re-claimed in the gap: a real
      // duplicate. Errors while aging keep the 'dup' verdict — the EEXIST
      // already proved a marker exists, and the common case is a twin created
      // milliseconds ago.
      try {
        const now = (deps.now ?? (() => Date.now()))();
        if (now - mtimeMs(marker) > maxAgeMs) {
          remove(marker);
          claim = attemptClaim();
        }
      } catch { /* keep 'dup' */ }
    }
    if (claim === 'dup') return true; // someone else won this key
    if (claim === 'error') return false; // any other fs problem: fail-open, run the flow
    // Won the claim — prune stale markers best-effort (never affects the answer).
    try {
      const now = (deps.now ?? (() => Date.now()))();
      const readdir = deps.readdirFn ?? readdirSync;
      for (const name of readdir(dir)) {
        const p = join(dir, name);
        try { if (now - mtimeMs(p) > maxAgeMs) remove(p); } catch { /* best-effort */ }
      }
    } catch { /* pruning is optional */ }
    return false;
  } catch {
    return false; // fail-open — never block the primary invocation
  }
}
