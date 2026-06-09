import {
  readLatestAdvisory,
  type StoredAdvisory,
  type AdvisoryStoreReaderDeps,
} from './advisory-store-reader.js';

/**
 * Advisory store poller — the Windsurf delivery bridge.
 *
 * On Windsurf the extension can't capture Cascade prompts (encrypted at rest), so
 * capture comes from the native Cascade hooks (`nexpath auto`, a separate process)
 * which park advisories in `~/.nexpath/prompt-store.db`. The extension's own
 * watcher→pipeline path therefore never fires there. This poller closes the gap:
 * it reads the store on an interval and, when a NEW advisory appears, hands it to
 * the same in-editor fallback (status bar → webview → chat-input inject) the
 * watcher uses on Cursor. Read-only on the store; Layer C untouched.
 *
 * Decoupled + dependency-injected (no `vscode` import) so it unit-tests without a
 * host or real timers.
 */

export interface AdvisoryPollerDeps {
  /**
   * Candidate project roots to check. Pass both the canonicalised and the raw
   * workspace path — the Cascade hook's `auto` may record either, depending on
   * whether Windsurf handed the hook a symlinked cwd (macOS `/var`↔`/private/var`,
   * Windows drive-case). The newest advisory across roots wins.
   */
  projectRoots: string[];
  /** Called with the project root whose advisory is fresh. */
  onFreshAdvisory: (projectRoot: string) => void | Promise<void>;
  /** Read the latest advisory for a root (defaults to the real store reader). */
  read?: (projectRoot: string) => Promise<StoredAdvisory | null>;
  /** Reader options (db path etc.) for the default reader. */
  readerDeps?: AdvisoryStoreReaderDeps;
  /** Poll interval in ms. Default 2000. */
  intervalMs?: number;
  /** Injectable clock — only advisories parked AFTER start() are delivered. */
  now?: () => number;
  /** Injectable timer (tests). */
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export interface AdvisoryPoller {
  start(): void;
  stop(): void;
  /** Run a single poll cycle (exposed for tests). */
  pollOnce(): Promise<void>;
}

export function createAdvisoryPoller(deps: AdvisoryPollerDeps): AdvisoryPoller {
  const read = deps.read ?? ((pr: string) => readLatestAdvisory(pr, deps.readerDeps));
  const now = deps.now ?? (() => Date.now());
  const intervalMs = deps.intervalMs ?? 2000;
  const setIntervalFn =
    deps.setIntervalFn ?? ((cb, ms) => setInterval(cb, ms) as unknown);
  const clearIntervalFn =
    deps.clearIntervalFn ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

  let handle: unknown = null;
  // Seeded on start() so advisories that predate activation aren't replayed.
  let lastDeliveredAt = 0;
  let inFlight = false;

  async function pollOnce(): Promise<void> {
    if (inFlight) return; // a slow read must not let cycles overlap
    inFlight = true;
    try {
      let best: { root: string; advisory: StoredAdvisory } | null = null;
      for (const root of deps.projectRoots) {
        let advisory: StoredAdvisory | null;
        try {
          advisory = await read(root);
        } catch {
          advisory = null;
        }
        if (advisory && (!best || advisory.createdAt > best.advisory.createdAt)) {
          best = { root, advisory };
        }
      }
      if (!best) return;
      if (best.advisory.createdAt <= lastDeliveredAt) return; // already delivered / not newer
      lastDeliveredAt = best.advisory.createdAt;
      await deps.onFreshAdvisory(best.root);
    } finally {
      inFlight = false;
    }
  }

  return {
    start(): void {
      if (handle !== null) return;
      lastDeliveredAt = now(); // only fire on advisories parked from now on
      handle = setIntervalFn(() => {
        void pollOnce();
      }, intervalMs);
    },
    stop(): void {
      if (handle !== null) {
        clearIntervalFn(handle);
        handle = null;
      }
    },
    pollOnce,
  };
}
