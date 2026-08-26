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

const INJECTORS: Record<string, (text: string) => Promise<void>> = {
  replit: injectPromptTextReplit,
  bolt: injectPromptTextBolt,
  lovable: injectPromptTextLovable,
};

/** Inject `text` via the current host's agent injector; unknown hosts degrade
 * to the clipboard fallback rather than silently doing nothing. */
export function injectPromptText(text: string): Promise<void> {
  const injector = INJECTORS[resolveAgentFromHostname(window.location.hostname)];
  return injector ? injector(text) : clipboardFallback(text);
}
