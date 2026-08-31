/**
 * Per-agent inject-back dispatch — extracted verbatim from inject.ts (B4's
 * table) so the PE panel wiring (pe-inject.ts) can inject through the same
 * kit without importing the advisory module (which would be a cycle: inject.ts
 * imports pe-inject.ts to bootstrap it). Imports the *-inject.ts modules, NOT
 * the capture entries — see inject.ts's header note on the duplicate-observer
 * bug behind that rule.
 */
import { injectPromptText as injectPromptTextReplit } from './agents/replit-inject.js';
import { injectPromptText as injectPromptTextBolt } from './agents/bolt-inject.js';
import { injectPromptText as injectPromptTextLovable } from './agents/lovable-inject.js';
import { clipboardFallback } from './agents/inject-kit.js';
import { resolveAgentFromHostname } from './agents/agent-hosts.js';

/**
 * `Promise<unknown>` because the injectors no longer agree on a return type, and
 * deliberately so: the two whose delivery outcome is consumed at the submit gate
 * report it, and the one that is not on that path was left exactly as it was.
 * Nothing on THIS path reads the value — both callers below fire and forget — so
 * the loosest type that accepts every injector is the honest one here.
 */
const INJECTORS: Record<string, (text: string) => Promise<unknown>> = {
  replit: injectPromptTextReplit,
  bolt: injectPromptTextBolt,
  lovable: injectPromptTextLovable,
};

/** Inject `text` via the current host's agent injector; unknown hosts degrade
 * to the clipboard fallback rather than silently doing nothing. */
export function injectPromptText(text: string): Promise<unknown> {
  const injector = INJECTORS[resolveAgentFromHostname(window.location.hostname)];
  return injector ? injector(text) : clipboardFallback(text);
}
