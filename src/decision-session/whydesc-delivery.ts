/**
 * Bug 2 — why-desc delivery to the agent.
 *
 * On selection the decision session currently sends only the option text to the agent; the
 * why-desc (CA-bound) is shown in the popup but never delivered. This module combines the
 * selected option with its rendered why-desc into the prompt the agent receives.
 *
 * Enabled by default now that the why-desc voice pass is complete (the why-descs are agent-voiced).
 * The gate is the `whydesc_delivery_enabled` config key (default 'true'; set it to 'false' to opt
 * out); it is read from the store at the delivery point. The combine is a pure function so it can
 * be unit-tested with the gate injected.
 */

import { getConfig } from '../store/config.js';
import type { Store } from '../store/db.js';

/**
 * Config key gating why-desc delivery. Default 'true' (see `DEFAULT_CONFIG`) now that the why-desc
 * voice rewrite is complete and the why-descs are agent-voiced; set it to 'false' to opt out.
 */
export const WHYDESC_DELIVERY_CONFIG_KEY = 'whydesc_delivery_enabled';

/** Resolve the delivery gate from the config store. OFF unless the key is explicitly 'true'. */
export function isWhyDescDeliveryEnabled(store: Store | undefined): boolean {
  if (!store) return false;
  return getConfig(store.db, WHYDESC_DELIVERY_CONFIG_KEY) === 'true';
}

/**
 * Combine the selected option (the prompt) with its rendered why-desc into one message for the
 * agent. Plain format (Decision 1 — sign-off): option, a blank line, then the why-desc; no
 * label. An empty/whitespace-only why-desc yields the option unchanged.
 */
export function combineOptionWithWhyDesc(option: string, whyDesc: string | undefined): string {
  const w = (whyDesc ?? '').trim();
  return w ? `${option}\n\n${w}` : option;
}

/**
 * The prompt to deliver on selection: the combined option + why-desc when delivery is enabled,
 * otherwise the option alone (current behaviour). `enabled` is passed explicitly by the caller
 * (resolved via `isWhyDescDeliveryEnabled`) so this stays a pure function.
 */
export function deliverSelectedPrompt(option: string, whyDesc: string | undefined, enabled: boolean): string {
  return enabled ? combineOptionWithWhyDesc(option, whyDesc) : option;
}

/** Normalize for injected-echo comparison: trim + collapse every whitespace run to one space. */
function normalizeForEcho(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * True when `promptText` is an echo of an advisory-injected prompt (an option, or an option +
 * why-desc after the delivery combine). The advisory guard uses this to skip synthetic turns.
 *
 * Robust to the agent reformatting the multi-line combined prompt: matches on an exact compare
 * (fast path, unchanged behaviour), a whitespace-normalized compare (newline/spacing drift), or
 * an option-prefix compare — the option is the text before the blank-line separator, so a prompt
 * that echoes the option but reformats the why-desc tail is still recognised. Only the immediately
 * next turn is checked (the field is cleared each prompt) and the option is a long, distinctive
 * string, so a genuine user prompt matching by prefix is not a real risk.
 */
export function isInjectedPromptEcho(injectedText: string, promptText: string): boolean {
  if (injectedText === promptText) return true;
  const normPrompt = normalizeForEcho(promptText);
  if (normalizeForEcho(injectedText) === normPrompt) return true;
  const option = normalizeForEcho(injectedText.split(/\n\s*\n/)[0] ?? '');
  return option.length >= 12 && normPrompt.startsWith(option);
}
