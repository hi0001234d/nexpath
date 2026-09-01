/**
 * PE-scoped record of what the extension itself just injected into the host's
 * chat input (analysis F6, part of PEH-10).
 *
 * A delivered PE body re-enters the watcher as an indistinguishable fresh
 * `ChatHistoryEvent` — nothing today records what the extension injected. The
 * only existing protection is Layer C's `isInjectedPromptEcho` (`auto.ts`), a
 * normalised text-similarity match that is also **single-shot**:
 * `clearInjectedPrompt` runs before the match, so the guard is consumed
 * whether or not it actually matched. The analysis names a concrete failure
 * from this: two open Cursor windows both watching the same `state.vscdb`
 * both emit every bubble, so the first duplicate consumes the single-shot
 * guard and the genuine echo re-enters full classification.
 *
 * This module is a non-consuming, window-based check instead: it never
 * "uses up" a match, so every echo within the window is suppressed, not just
 * the first. Deliberately in-memory and per-process (no store write) — a
 * short-lived echo guard, not a durable record. PE-scoped and fail-safe:
 * Decision Session behaviour is entirely unaffected, since nothing here is
 * consulted on that path.
 *
 * **P8 extension (PEH-10 completion).** `isRecentEcho` alone is
 * text-similarity — necessarily so at this boundary, since a re-entering
 * chat event is just a plain string with no attached metadata. What P8 adds
 * is a second, typed layer on top: an optional `origin` (the delivered PE
 * body's `currentBodyId`/`bodyRevision`, mirroring the real
 * `PromptEnhancementDeliveryOriginGuardState`'s spirit — see
 * `popup-session.ts`) recorded alongside the text. `resolveOriginGuardState`
 * only ever reports an echo when a text match is CORROBORATED by a recorded
 * typed origin — a DS injection (which has no body id/revision to record)
 * can text-match by coincidence but can never satisfy the typed guard. This
 * is what "a text-similarity match alone does not trigger the guard" means:
 * text matching is necessary but not sufficient.
 */

const DEFAULT_ECHO_WINDOW_MS = 60_000; // mirrors chat-history-watcher's own dedup window

interface InjectedEntry {
  text:       string;
  injectedAt: number;
  origin:     PeInjectedOrigin | null;
}

/** The typed identity of a delivered PE body, recorded alongside its text. */
export interface PeInjectedOrigin {
  currentBodyId: string;
  bodyRevision:  number;
}

/**
 * Subset of the real `PromptEnhancementDeliveryOriginGuardState`
 * (`popup-session.ts`) this extension can actually produce — no session/
 * body-ref-resolution concept exists here, so `guard_written_for_body_ref`,
 * `pe_generated_next_submit_guard_required`, and `origin_guard_missing_invalid`
 * are not reachable and are not declared.
 */
export type PeDeliveryOriginGuardState =
  | 'not_delivered'
  | 'next_submit_processed_as_delivery_echo'
  | 'next_submit_mismatch_cleared';

export interface InjectedRecordStore {
  /**
   * Record that `text` was just injected into `projectRoot`'s chat input.
   * `origin` is the delivered body's typed identity — omit (or pass `null`)
   * for a DS injection, which has no body id/revision to attach.
   */
  record(projectRoot: string, text: string, now?: number, origin?: PeInjectedOrigin | null): void;
  /**
   * True when `text` exactly matches the most recently recorded PE injection
   * for `projectRoot`, within the echo window. Pure read — never consumes
   * the record, so repeated echoes within the window all match. Text-only —
   * see `resolveOriginGuardState` for the typed-origin-corroborated check.
   */
  isRecentEcho(projectRoot: string, text: string, now?: number): boolean;
  /**
   * Typed-origin-aware echo check (P8, PEH-10 completion). Reports
   * `next_submit_processed_as_delivery_echo` only when the text matches AND
   * the recorded entry carries a typed `origin` — a text match against an
   * entry with no origin (a DS injection) reports `not_delivered`, never an
   * echo. `next_submit_mismatch_cleared` covers both an expired window and a
   * differing text, since the real enum overloads "cleared" for both.
   */
  resolveOriginGuardState(projectRoot: string, text: string, now?: number): PeDeliveryOriginGuardState;
}

/** Create a fresh, empty store. `windowMs` is injectable for tests. */
export function createInjectedRecordStore(
  windowMs: number = DEFAULT_ECHO_WINDOW_MS,
): InjectedRecordStore {
  const lastInjected = new Map<string, InjectedEntry>();

  return {
    record(projectRoot, text, now = Date.now(), origin = null) {
      lastInjected.set(projectRoot, { text, injectedAt: now, origin });
    },
    isRecentEcho(projectRoot, text, now = Date.now()) {
      const entry = lastInjected.get(projectRoot);
      if (!entry) return false;
      if (entry.text !== text) return false;
      return now - entry.injectedAt <= windowMs;
    },
    resolveOriginGuardState(projectRoot, text, now = Date.now()) {
      const entry = lastInjected.get(projectRoot);
      if (!entry || !entry.origin) return 'not_delivered';
      const withinWindow = now - entry.injectedAt <= windowMs;
      if (!withinWindow || entry.text !== text) return 'next_submit_mismatch_cleared';
      return 'next_submit_processed_as_delivery_echo';
    },
  };
}
