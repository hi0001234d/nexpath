import type { DecisionSessionPayload } from './ipc.js';
import {
  readLatestAdvisory,
  type StoredAdvisory,
  type AdvisoryStoreReaderDeps,
} from './advisory-store-reader.js';

/**
 * In-editor advisory fallback (Layer B only).
 *
 * The terminal popup Layer C spawns on `nexpath stop` is the primary advisory
 * surface, but it is environment-fragile: on Linux it needs a GUI terminal
 * emulator + `$DISPLAY`/`$WAYLAND_DISPLAY` + a session bus, and even then can
 * land behind the editor. When it doesn't appear, the advisory Layer C already
 * generated would be lost.
 *
 * This module is the safety net: when a prompt cycle finishes WITHOUT the user
 * selecting in the terminal popup, it checks nexpath's store (read-only) for a
 * fresh advisory and, if one exists, lights a status-bar item. Clicking it (the
 * `nexpath.showAdvisory` command) reveals that advisory in the extension's own
 * webview — a surface that always works, on every OS, with no terminal at all.
 * Selecting an option there injects it into the chat input via the same path the
 * terminal popup uses. Layer C is untouched: we only READ the row it wrote.
 *
 * Pure + dependency-injected (no `vscode` import) so it unit-tests without a
 * host; `extension.ts` supplies the real status-bar / webview / toast bindings.
 */

/** Minimal status-bar surface the fallback drives (real impl backed by `vscode.StatusBarItem`). */
export interface StatusBarHandle {
  show(text: string, tooltip: string): void;
  hide(): void;
}

export interface AdvisoryFallbackDeps {
  /** Push a payload to the webview (`view-provider.publishPayload`). */
  publishPayload: (payload: DecisionSessionPayload) => void;
  /** The status-bar surface to light when an advisory is waiting. */
  statusBar: StatusBarHandle;
  /** Read the latest stored advisory for a project (defaults to the real store reader). */
  read?: (projectRoot: string) => Promise<StoredAdvisory | null>;
  /** Reader options (db path etc.) passed through to the default reader. */
  readerDeps?: AdvisoryStoreReaderDeps;
  /** Show a one-time discoverability toast (caller gates "once-ever" via globalState). */
  showInfoOnce?: (message: string) => void;
  /** Injectable clock (tests). */
  now?: () => number;
  /**
   * How recent (ms) an advisory must be to count as "from this cycle". Guards
   * against resurfacing a stale advisory from earlier in the session on every
   * subsequent prompt. Defaults to 60s.
   */
  recentWindowMs?: number;
}

export const STATUS_BAR_TEXT = '$(lightbulb) Nexpath advisory';
export const FIRST_TIME_HINT =
  'Nexpath has an advisory ready. If the terminal popup didn’t appear, ' +
  'click “Nexpath advisory” in the status bar to view it here.';

export interface AdvisoryFallback {
  /**
   * Call when a prompt cycle finished with NO terminal selection. Surfaces the
   * status bar if a fresh advisory exists for `projectRoot`; otherwise no-op.
   */
  noteCycleWithoutSelection(projectRoot: string): Promise<void>;
  /** Call when the user DID select in the terminal popup — clears the pending fallback. */
  clear(): void;
  /** Command handler (`nexpath.showAdvisory`): reveal the waiting advisory in the webview. */
  showAdvisory(): Promise<void>;
}

/** Map a stored advisory → the webview payload. Prefers L1 (full-depth) options. */
export function toPayload(a: StoredAdvisory): DecisionSessionPayload {
  const options = a.l1.length ? a.l1 : a.l2.length ? a.l2 : a.l3;
  return {
    advisory: a.pinchLabel || 'Nexpath advisory',
    options:  options.map((label, i) => ({ id: String(i), label })),
  };
}

export function createAdvisoryFallback(deps: AdvisoryFallbackDeps): AdvisoryFallback {
  const read =
    deps.read ?? ((projectRoot: string) => readLatestAdvisory(projectRoot, deps.readerDeps));
  const now = deps.now ?? (() => Date.now());
  const recentWindowMs = deps.recentWindowMs ?? 60_000;

  let pendingProject: string | null = null;
  let hintShown = false;

  return {
    async noteCycleWithoutSelection(projectRoot: string): Promise<void> {
      let advisory: StoredAdvisory | null;
      try {
        advisory = await read(projectRoot);
      } catch {
        return;
      }
      if (!advisory) return;
      // Only surface advisories generated during (roughly) this cycle.
      if (now() - advisory.createdAt > recentWindowMs) return;

      pendingProject = projectRoot;
      deps.statusBar.show(
        STATUS_BAR_TEXT,
        `${advisory.pinchLabel || 'Nexpath'} — click to view nexpath’s advisory`,
      );
      if (!hintShown && deps.showInfoOnce) {
        hintShown = true;
        deps.showInfoOnce(FIRST_TIME_HINT);
      }
    },

    clear(): void {
      pendingProject = null;
      deps.statusBar.hide();
    },

    async showAdvisory(): Promise<void> {
      if (pendingProject === null) return;
      let advisory: StoredAdvisory | null;
      try {
        advisory = await read(pendingProject);
      } catch {
        return;
      }
      if (!advisory) {
        deps.statusBar.hide();
        pendingProject = null;
        return;
      }
      deps.publishPayload(toPayload(advisory));
      deps.statusBar.hide();
      pendingProject = null;
    },
  };
}
