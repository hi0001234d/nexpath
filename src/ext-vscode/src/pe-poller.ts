/**
 * Windsurf/Devin PE delivery poller (P10).
 *
 * Sibling of `advisory-poller.ts` — read this module's own doc comment
 * first, the design reasoning here only covers where PE genuinely differs.
 *
 * **Why this exists, same root cause as the DS poller:** the extension is
 * not in the Windsurf hook chain — Windsurf's own Cascade hooks call
 * `nexpath auto`/`nexpath stop` directly, bypassing the extension's
 * chat-history-watcher-driven spawn entirely. So the shared store is the
 * extension's ONLY signal that a PE is pending on Windsurf.
 *
 * **Why this is simpler than the DS poller, not just a copy of it:** the DS
 * poller has two jobs because a DS advisory has an interactive popup to
 * bridge a SELECTION back from (`readInjected`/`session_states.lastInjectedPrompt`)
 * and a fallback to arm when that popup produced nothing. This poller's only
 * job is: notice a pending PE, and directly insert its current body into
 * Cascade — the acceptance criterion's own wording, "delivery via the
 * verified `injectViaCascadeAction` direct Cascade insert."
 *
 * **CORRECTED 2026-08-11 — this header used to claim "a pending PE has no
 * popup on Windsurf at all" (raw-TTY reasoning). The live E2E disproved
 * that:** `stop`'s PE host does not need the hook's own TTY — it SPAWNS a
 * terminal window (`prompt-enhancement-host.ts`), and that popup opened fine
 * on GUI Linux. The result was this poller pre-inserting the body into
 * Cascade seconds BEFORE the popup appeared — behaviour neither the CLI nor
 * Cursor has. Owner ruling 2026-08-11: popup-first everywhere, so this
 * poller is now GATED at the wiring site (`extension.ts`, via
 * `pe-popup-host-probe.ts`): its `readPendingPe` returns `null` whenever a
 * popup host is possible, and the popup's "Use enhanced" selection bridges
 * through the advisory poller's `readPeEventMeta` gate instead. This module
 * itself is unchanged and still delivers wherever the popup genuinely cannot
 * open (headless/no-terminal hosts — the premise P10 was actually about).
 *
 * **Keyed on the PE table only — never `pending_advisories`, never
 * `lastInjectedPrompt`.** `PePollerDeps` has no field that could read
 * either (structural proof, same discipline as P7's no-clipboard-field
 * proof on `PeSendIntentInput`) — only `readPendingPe`, which this module's
 * own tests inject as `pe-store-reader.ts`'s `readPendingPromptEnhancement`.
 *
 * **"A row marked `'shown'` is not treated as proof a surface appeared."**
 * Historical note, corrected here per the dev plan's own later
 * finding: the CLI bug this once described (`markPromptEnhancementShown`
 * firing before `peLaunch`) **was fixed upstream** (commit `ad73180`) before
 * this module was written — the wording is deliberately "was", not "is".
 * The defensive posture still stands on principle, not as a workaround for
 * a live bug: this extension cannot assume the CLI's invariants hold across
 * versions it hasn't seen, so this poller's own dedup is keyed on
 * `createdAt` (which row it has itself already attempted), never on the
 * row's `status` field — the same pattern `advisory-poller.ts` already uses
 * for its OWN dedup, just not reused for "has a surface appeared" here.
 *
 * **Delivery outcome reuses `pe-delivery.ts`'s typed `PeInsertOutcome`** —
 * `injectViaCascadeAction` (`windsurf-cascade-action.ts`) has the exact
 * `(text: string) => Promise<boolean>` shape `injectPeBody` already expects
 * (no clipboard, same as `chatInputInject` — confirmed by reading it in
 * full), so this reuses P8's clipboard-free injector rather than
 * reimplementing delivery. Retries: a delivery attempt (success or failure)
 * marks that row's `createdAt` as handled and is never retried — same
 * one-shot-per-row semantics `advisory-poller.ts` already uses for its own
 * `armedAt`/`handledAt` tracking, chosen to avoid ever inserting the same
 * body into Cascade twice.
 *
 * Read-only on the store; no `vscode` import (fully dependency-injected for
 * tests, same as `advisory-poller.ts`).
 */

import type { PendingPromptEnhancementRow } from './pe-store-reader.js';
import { parsePromptEnhancementExtensionPayloadV1 } from './pe-payload.js';
import type { PeInsertOutcome } from './pe-delivery.js';

export interface PePollerDeps {
  /** Candidate project roots to check — same reasoning as `AdvisoryPollerDeps.projectRoots`. */
  projectRoots: string[];
  /**
   * Read the latest pending PE row for a root. Wire this to
   * `pe-store-reader.ts`'s `readPendingPromptEnhancement` — the PE table
   * only, never `advisory-store-reader.ts`'s DS reads.
   */
  readPendingPe: (projectRoot: string) => Promise<PendingPromptEnhancementRow | null>;
  /**
   * Direct-insert `text` into Cascade. Wire this to `injectPeBody` wrapping
   * `injectViaCascadeAction` — never a clipboard-touching injector (the no-clipboard rule).
   */
  onDeliver: (text: string) => Promise<PeInsertOutcome>;
  /** Optional: publish the parsed payload to the PE webview too, so the same renderer shows what was delivered if the panel is open. */
  onPublish?: (payload: ReturnType<typeof parsePromptEnhancementExtensionPayloadV1>) => void;
  /** Poll interval in ms (default 2000, matching `advisory-poller.ts`). */
  intervalMs?: number;
  /** Injectable clock — only rows parked AFTER start() are considered. */
  now?: () => number;
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  /** Optional logger for the typed delivery outcome (redacted — never raw body text). */
  onOutcome?: (outcome: PeInsertOutcome) => void;
}

export interface PePoller {
  start(): void;
  stop(): void;
  pollOnce(): Promise<void>;
}

export function createPePoller(deps: PePollerDeps): PePoller {
  const now = deps.now ?? (() => Date.now());
  const intervalMs = deps.intervalMs ?? 2000;
  const setIntervalFn = deps.setIntervalFn ?? ((cb, ms) => setInterval(cb, ms) as unknown);
  const clearIntervalFn =
    deps.clearIntervalFn ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

  let handle: unknown = null;
  let inFlight = false;
  let startedAt = 0;
  let handledAt = 0; // createdAt of the newest PE row we've already attempted delivery for

  async function pollOnce(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    try {
      // Newest pending PE row across candidate roots — PE table only.
      let best: { root: string; row: PendingPromptEnhancementRow } | null = null;
      for (const root of deps.projectRoots) {
        let row: PendingPromptEnhancementRow | null;
        try { row = await deps.readPendingPe(root); } catch { row = null; }
        if (row && (!best || row.createdAt > best.row.createdAt)) {
          best = { root, row };
        }
      }
      if (!best) return;
      if (best.row.createdAt <= startedAt) return; // nothing parked since start
      if (best.row.createdAt <= handledAt) return; // already attempted this row

      handledAt = best.row.createdAt; // mark handled BEFORE the attempt — never retry, even on failure
      const parsed = parsePromptEnhancementExtensionPayloadV1(best.row.resultJson);
      if (!parsed) return; // malformed/unparseable row — nothing deliverable

      deps.onPublish?.(parsed);
      const outcome = await deps.onDeliver(parsed.currentBodyText);
      deps.onOutcome?.(outcome);
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
