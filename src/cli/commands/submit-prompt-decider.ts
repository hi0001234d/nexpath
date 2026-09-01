/**
 * Submit-time prompt decider (hook milestone H3, Gap 1).
 *
 * Replaces H2's `'allow'` stub: this is what decides whether a `pre_user_prompt`
 * gets blocked, and what replaces it if so.
 *
 * ── OWNERSHIP: why everything here is INJECTED, not imported ──────────────────
 * The spec'd flow is `classify → composeDeterministicOptions → TtySelectFn`, but
 * two of those live in files this milestone must NOT edit, verified by authorship
 * (both are other members' modules):
 *   • `composeDeterministicOptions` — `src/decision-session/engine-option-generator.ts`
 *   • `createTtySelectFn`           — `src/decision-session/TtySelectFn.ts`
 * The dev plan freezes `src/decision-session/**` as consume-only. So this module
 * imports **neither**: it declares the narrow ports it needs and the wiring site
 * adapts the real functions onto them. That keeps the ownership boundary provable
 * at the import graph (this file has zero `decision-session` imports) rather than
 * relying on reviewer discipline — and it keeps the decider unit-testable without
 * a `Store`, which `createTtySelectFn` would otherwise require.
 *
 * ── `G-A1`: DETERMINISTIC-ONLY (owner ruling 2026-08-10) ──────────────────────
 * Options come from the deterministic generator only — **no LLM call ever sits on
 * the submit path**. `composeDeterministicOptions` is verified synchronous and
 * LLM-free, so the popup can appear with zero added latency. This is amendment
 * A1's recommended v1 strategy; race-with-timeout and LLM-first are deliberately
 * NOT implemented here.
 *
 * ── FAIL-OPEN (`A3`) is the governing rule ───────────────────────────────────
 * Today a failure means no advisory appears and the user loses nothing. Here a
 * failure while the prompt is held would mean **the prompt never sends** —
 * strictly worse. So EVERY uncertain path returns `'allow'`: no options, a null
 * generator, a renderer that cannot open, an empty or unchanged selection, a
 * thrown anything. Only an explicit, non-empty, genuinely-different selection
 * blocks.
 */

/** What the deterministic generator yields, narrowed to what this decider reads. */
export interface DeciderOptionSet {
  l1: string[];
  l2: string[];
  l3: string[];
}

/** The user's choice, or `null` when they dismissed/skipped. */
export type DeciderSelection = string | null;

export interface SubmitPromptDeciderDeps {
  /**
   * Adapter over `composeDeterministicOptions`. Returns `null` when nothing is
   * applicable — which is the common case and must stay cheap.
   * **Must not perform network or LLM work** (`G-A1`).
   */
  composeOptions: (promptText: string) => DeciderOptionSet | null;
  /**
   * Adapter over the popup renderer. Resolves the picked text, or `null` if the
   * user dismissed. May resolve `null` when no renderer is available (no TTY).
   */
  renderPopup: (promptText: string, options: DeciderOptionSet) => Promise<DeciderSelection>;
  /** Persist the decision so the extension can pick it up. Throwing ⇒ fail-open. */
  persistDecision: (replacementText: string) => Promise<void>;
  /** Redacted logger. **Never** pass prompt or replacement text. */
  log?: (message: string) => void;
}

/** Mirrors `WindsurfPromptSubmitDecision` without importing it — same two values. */
export type SubmitPromptDecision = 'allow' | 'block';

/**
 * Decide whether to block this submitted prompt.
 *
 * Returns `'block'` **only** when all of the following hold: options were
 * produced, the popup returned a non-empty selection, that selection genuinely
 * differs from what the user typed, and the decision was persisted successfully.
 * Anything else — including a persist failure — returns `'allow'`, because a
 * block whose decision never reached the extension would strand the user with a
 * cancelled prompt and no replacement.
 */
export async function decideSubmitPrompt(
  promptText: string,
  deps: SubmitPromptDeciderDeps,
): Promise<SubmitPromptDecision> {
  const log = deps.log ?? (() => {});

  if (typeof promptText !== 'string' || promptText.trim().length === 0) {
    return 'allow';
  }

  let options: DeciderOptionSet | null = null;
  try {
    options = deps.composeOptions(promptText);
  } catch {
    log('[nexpath] submit-decider: option generation failed — allowing');
    return 'allow';
  }
  if (!options || (options.l1.length + options.l2.length + options.l3.length) === 0) {
    return 'allow'; // nothing to offer: the overwhelmingly common path, and cheap
  }

  let selection: DeciderSelection = null;
  try {
    selection = await deps.renderPopup(promptText, options);
  } catch {
    log('[nexpath] submit-decider: popup failed — allowing');
    return 'allow';
  }

  // Dismissed / skipped / no renderer ⇒ the original stands (amendment A5's
  // unambiguous cases: skipped and dismissed both send the original).
  if (typeof selection !== 'string' || selection.trim().length === 0) {
    log('[nexpath] submit-decider: no selection — allowing');
    return 'allow';
  }

  // Selecting the prompt you already typed is not a replacement. Blocking and
  // re-injecting identical text would cost the user a turn for no change.
  if (selection.trim() === promptText.trim()) {
    log('[nexpath] submit-decider: selection identical to original — allowing');
    return 'allow';
  }

  try {
    await deps.persistDecision(selection);
  } catch {
    // Critical: never block when the handoff could not be written. The extension
    // would have nothing to inject and the user's prompt would be gone.
    log('[nexpath] submit-decider: persist failed — allowing rather than stranding the prompt');
    return 'allow';
  }

  log(`[nexpath] submit-decider: blocking; replacement persisted (${selection.length} chars)`);
  return 'block';
}
