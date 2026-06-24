import type { AdvisoryStatus } from './advisory-store-reader.js';

/**
 * Windsurf delivery poller.
 *
 * On Windsurf the terminal popup (Cascade `post_cascade_response` → `nexpath stop`)
 * is the PRIMARY advisory surface, exactly like Cursor/CLI. But the read-only
 * Cascade hook can't carry the popup's selection back into Cascade, and the
 * extension never sees `stop`'s stdout. So this poller, reading the shared store,
 * does two things:
 *
 *   1. **Bridge the popup selection.** When the user picks an option in the popup,
 *      Layer C's `stop` persists it to `session_states.lastInjectedPrompt`. The
 *      poller injects that into Cascade (and clears any fallback). This is what
 *      makes the popup work end-to-end on Windsurf.
 *
 *   2. **Fallback ONLY when the popup didn't deliver.** `stop` marks the advisory
 *      `status='shown'` the moment it runs. So when an advisory is `shown` but no
 *      selection arrives within a short grace, the popup failed/was dismissed —
 *      then (and only then) the poller arms the in-editor status-bar fallback. An
 *      advisory still `pending` (popup not run yet) never arms the fallback.
 *
 * Read-only on the store; no `vscode` import (fully dependency-injected for tests).
 */

export interface AdvisoryPollerDeps {
  /**
   * Candidate project roots to check. Pass both the canonicalised and raw
   * workspace path — the Cascade hook's `auto`/`stop` may record either.
   */
  projectRoots: string[];
  /**
   * Read the latest advisory's metadata (created_at + status) for a root.
   * Option-INDEPENDENT on purpose: since the option `auto`→`stop` move the row
   * carries no generated options, but the bridge only needs to detect that an
   * advisory exists (the selection is read separately via `readInjected`). Wire
   * this to `readLatestAdvisoryMeta`, NOT `readLatestAdvisory`.
   */
  readAdvisory: (projectRoot: string) => Promise<AdvisoryStatus | null>;
  /** Read the popup's persisted selection (`session_states.lastInjectedPrompt`). */
  readInjected: (projectRoot: string) => Promise<string | null>;
  /** Inject the popup's selected prompt into Cascade (and clear the fallback). */
  onSelection: (prompt: string) => void | Promise<void>;
  /** Arm the in-editor fallback (popup ran but produced no selection). */
  onArm: (projectRoot: string) => void | Promise<void>;
  /** Poll interval in ms (default 2000). */
  intervalMs?: number;
  /**
   * Grace after the popup is marked `shown` before arming the fallback (ms).
   * Gives the user time to pick from the popup; default 6000.
   */
  graceMs?: number;
  /** Injectable clock — only advisories parked AFTER start() are considered. */
  now?: () => number;
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export interface AdvisoryPoller {
  start(): void;
  stop(): void;
  pollOnce(): Promise<void>;
}

export function createAdvisoryPoller(deps: AdvisoryPollerDeps): AdvisoryPoller {
  const now = deps.now ?? (() => Date.now());
  const intervalMs = deps.intervalMs ?? 2000;
  const graceMs = deps.graceMs ?? 6000;
  const setIntervalFn = deps.setIntervalFn ?? ((cb, ms) => setInterval(cb, ms) as unknown);
  const clearIntervalFn =
    deps.clearIntervalFn ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

  let handle: unknown = null;
  let inFlight = false;
  let startedAt = 0;
  let lastInjectedValue: string | null = null;
  let armedAt = 0;          // createdAt of the advisory whose fallback we've armed
  let handledAt = 0;        // createdAt of an advisory whose selection we injected
  let shownAt = 0;          // createdAt of the advisory we're timing for "shown"
  let shownFirstSeen = 0;   // when we first observed that advisory as `shown`

  async function pollOnce(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    try {
      // Newest advisory across candidate roots.
      let best: { root: string; advisory: AdvisoryStatus } | null = null;
      for (const root of deps.projectRoots) {
        let advisory: AdvisoryStatus | null;
        try { advisory = await deps.readAdvisory(root); } catch { advisory = null; }
        if (advisory && (!best || advisory.createdAt > best.advisory.createdAt)) {
          best = { root, advisory };
        }
      }
      if (!best || best.advisory.createdAt <= startedAt) return; // nothing parked since start

      let injected: string | null = null;
      try { injected = await deps.readInjected(best.root); } catch { injected = null; }

      // 1. Popup selection → inject into Cascade (once), clear fallback.
      if (injected && injected !== lastInjectedValue) {
        lastInjectedValue = injected;
        await deps.onSelection(injected);
        handledAt = Math.max(handledAt, best.advisory.createdAt);
      } else if (!injected) {
        lastInjectedValue = null; // auto cleared it → allow the next selection
      }

      // 2. Fallback only when the popup ran (`shown`) but yielded no selection.
      const at = best.advisory.createdAt;
      if (at <= armedAt || at <= handledAt) return; // already armed / handled by popup
      if (best.advisory.status !== 'shown') return; // popup hasn't run yet → wait
      if (shownAt !== at) { shownAt = at; shownFirstSeen = now(); }
      if (!injected && now() - shownFirstSeen >= graceMs) {
        await deps.onArm(best.root);
        armedAt = at;
      }
    } finally {
      inFlight = false;
    }
  }

  return {
    start(): void {
      if (handle !== null) return;
      startedAt = now();
      handle = setIntervalFn(() => { void pollOnce(); }, intervalMs);
    },
    stop(): void {
      if (handle !== null) { clearIntervalFn(handle); handle = null; }
    },
    pollOnce,
  };
}
