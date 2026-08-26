/**
 * Browser feedback store — the extension's counterpart of the CLI popup
 * host's feedbackSink target (PE-BR-11 closed 2026-08-25). The popup host
 * turns a panel feedback command into the ENGINE'S OWN submitted event shape
 * (feedback-adapter.ts pure builders — the same ones cli-submit-popup.ts
 * :341-368 uses) and this module persists it.
 *
 * Storage: one JSON list under a single extension-storage key, newest first,
 * capped — typed "Other" text stays LOCAL to the browser profile exactly as
 * the CLI's store stays local to the machine. The ring/log NEVER receives the
 * text; callers log content-free acknowledgements only.
 */

export interface PeFeedbackKeyStore {
  getKey(name: string): Promise<string | null>;
  setKey(name: string, value: string): Promise<void>;
}

export const PE_FEEDBACK_EVENTS_KEY = 'nexpath_pe_feedback_events';
/** Newest-first cap — old feedback rotates out, the store can never grow unbounded. */
export const PE_FEEDBACK_EVENTS_CAP = 50;

export interface StoredPeFeedbackEventV1 {
  at: number;
  /** The engine's submitted popup event, verbatim (includes category/text). */
  event: unknown;
}

/**
 * Append one submitted feedback event (newest first, capped). Best-effort by
 * contract: feedback must never break the popup flow, so storage errors
 * resolve false and the caller logs a content-free failure.
 */
export async function recordPeFeedbackEvent(
  store: PeFeedbackKeyStore,
  event: unknown,
  at: number,
): Promise<boolean> {
  try {
    const raw = await store.getKey(PE_FEEDBACK_EVENTS_KEY);
    let list: StoredPeFeedbackEventV1[] = [];
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed as StoredPeFeedbackEventV1[];
    }
    list.unshift({ at, event });
    await store.setKey(PE_FEEDBACK_EVENTS_KEY, JSON.stringify(list.slice(0, PE_FEEDBACK_EVENTS_CAP)));
    return true;
  } catch {
    return false;
  }
}
