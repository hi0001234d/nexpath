/**
 * Deterministic option source for the submit-time popup (hook milestone H3).
 *
 * This is the adapter that supplies the decider's `composeOptions` / `renderPopup`
 * ports. It is the LAST missing input: with it absent the decider resolves
 * `'allow'` for every prompt and the switch is inert.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM THE DECIDER ─────────────────────────
 * `submit-prompt-decider.ts` has **zero imports of any kind**, so the ownership
 * boundary is provable in the import graph rather than by reviewer discipline.
 * The engine's `composeDeterministicOptions` and the store layer's `createTtySelectFn` are
 * therefore consumed **here, at the wiring site**, and handed to the decider as
 * injected ports. Both are consume-only — neither file is modified.
 *
 * ── ⭐ REUSES `auto`'s CLASSIFICATION — NEVER RE-CLASSIFIES (owner ruling) ────
 * `composeDeterministicOptions()` is LLM-free, but it needs a `lookup`, and a
 * lookup needs a classified signal. Classification IS LLM-based
 * (`stage-classifier.ts` imports OpenAI). Re-running it here would put a network
 * round-trip on the submit path — exactly what amendment `A1` (deterministic-only)
 * exists to prevent, and it would compound Cursor's 60 s hook-timeout risk.
 *
 * It is not needed. `pre_user_prompt` already runs `nexpath auto`, which classifies
 * and persists the result (`upsertPendingAdvisory`). This reads that row and
 * rebuilds the lookup **synchronously from the store**:
 *
 *   persisted row (flagType, stage)          ← auto already paid for this
 *     → pinchSignalTypeForFlag(flagType, stage)
 *     → autogenAwareLookup(store, cwd, signalType)      [store read, no network]
 *     → composeDeterministicOptions({ lookup, level, register, role })
 *
 * Mirrors `stop.ts`'s deterministic branch (lines ~332–345).
 *
 * ── 🚫 NO OpenAI CLIENT ON THIS PATH, EVER ───────────────────────────────────
 * `stop.ts` reaches OpenAI only at lines 351–352 (`buildEngineGrounding` /
 * `generateFromEngine`) — the ENGINE path, which `A1` excludes. This file
 * deliberately imports neither, and a test pins that absence: silently acquiring a
 * client is precisely how the submit path would regress into a network round-trip
 * while every other test still passed.
 *
 * ── FAIL-OPEN ────────────────────────────────────────────────────────────────
 * Every failure returns `null`, which the decider treats as `'allow'` — the
 * original prompt is released unmodified. Per amendment `A3`, a failure while
 * HOLDING the user's prompt is strictly worse than today's "no advisory appears".
 */
import { getPendingAdvisory, markAdvisoryShown } from '../../store/pending-advisories.js';
// CONSUME-ONLY (another member's module): called exactly as stop.ts already calls them.
import {
  getPendingPromptEnhancement,
  markPromptEnhancementShown,
} from '../../store/pending-prompt-enhancements.js';
import { getUserDepthLevel } from '../../store/user-depth-level.js';
import { selectionRegister, resolveContentSource } from '../../decision-session/selection-registry.js';
import {
  autogenAwareLookup,
  pinchSignalTypeForFlag,
} from '../../decision-session/content-template-source.js';
import { composeDeterministicOptions } from '../../decision-session/engine-option-generator.js';
import {
  activePinFor,
  applyPinToLookup,
  applyPinToLevel,
  type ActivePin,
} from '../../decision-session/experiment-config.js';
import { createTtySelectFn } from '../../decision-session/TtySelectFn.js';
// CONSUME-ONLY. Imported rather than mirrored: a copied literal could drift from
// Layer C's sentinel and we would silently start injecting it as prompt text.
import { CLIPBOARD_ONLY } from '../../decision-session/DecisionSession.js';
import type { MaturityLevel } from '../../decision-session/content-template-schema.js';
import type { DeciderOptionSet, DeciderSelection } from './submit-prompt-decider.js';

/**
 * Structurally identical to the decider's `DeciderOptionSet` and to the `l1/l2/l3`
 * of the engine's `GeneratedOptions` — deliberately, so the set passes through without
 * the decider ever importing `decision-session`.
 */
export interface SubmitOptionSourceDeps {
  /** Opaque here — only forwarded to store/lookup helpers. */
  store: unknown;
  projectRoot: string;
  sessionId?: string;
  /** From the session profile; both optional, both local reads. */
  role?: string;
  nature?: string;

  // ── Seams. Defaults are the REAL implementations, never no-ops. ────────────
  // (A prior bug in this milestone shipped `() => false` defaults, so the
  // production path silently did nothing while every test passed.)
  getRow?: typeof getPendingAdvisory;
  getLevel?: typeof getUserDepthLevel;
  composeFn?: typeof composeDeterministicOptions;
  selectFnFactory?: typeof createTtySelectFn;
  /** Seams for the classification→lookup chain, so this is unit-testable
   *  without a real Store. Defaults are the real implementations. */
  signalTypeFn?: typeof pinchSignalTypeForFlag;
  contentSourceFn?: typeof resolveContentSource;
  lookupFn?: typeof autogenAwareLookup;
  markShownFn?: typeof markAdvisoryShown;
  /** Seams for the pending-PE consume (H8, G-ARBITRATION Finding 2). */
  getPeRowFn?: typeof getPendingPromptEnhancement;
  markPeShownFn?: typeof markPromptEnhancementShown;
  log?: (message: string) => void;
}

export interface SubmitOptionSource {
  composeOptions: (promptText: string) => DeciderOptionSet | null;
  renderPopup: (promptText: string, options: DeciderOptionSet) => Promise<DeciderSelection>;
  /**
   * Call ONLY when this path fully handled the turn (decision === 'block').
   *
   * H3's acceptance requires that no pending advisory survives such a turn, so
   * `post_cascade_response` hits its existing `no_pending` branch unchanged.
   * Option-A ordering means `auto` has already written the row, so it is consumed
   * here instead of never being written. Without this the user would get BOTH the
   * submit-time popup and the old post-response popup.
   *
   * `getPendingAdvisory` filters `status = 'pending'`, so marking it shown is
   * exactly what makes `stop` see nothing. No-op when no row was read.
   */
  consumeHandledTurn: () => void;
  /**
   * True when the user explicitly picked Layer C's "copy to clipboard" option
   * (`CLIPBOARD_ONLY`) rather than a replacement. The caller must NOT treat that
   * as prompt text — see `renderPopup`.
   */
  wasClipboardRequested: () => boolean;
}

/** Pick the list matching the resolved maturity level. */
function listForLevel(set: DeciderOptionSet, level: MaturityLevel): string[] {
  if (level === 1) return set.l1;
  if (level === 3) return set.l3;
  return set.l2;
}

/**
 * Build the deterministic option source.
 *
 * `composeOptions` and `renderPopup` come from ONE factory so the resolved
 * maturity level is shared between them via closure. The alternative — widening
 * the decider's port signature to carry the level — would couple the decider to
 * this adapter's internals for no behavioural gain.
 */
export function createDeterministicSubmitOptionSource(
  deps: SubmitOptionSourceDeps,
): SubmitOptionSource {
  const getRow = deps.getRow ?? getPendingAdvisory;
  const getLevel = deps.getLevel ?? getUserDepthLevel;
  const composeFn = deps.composeFn ?? composeDeterministicOptions;
  const selectFnFactory = deps.selectFnFactory ?? createTtySelectFn;
  const signalTypeFn = deps.signalTypeFn ?? pinchSignalTypeForFlag;
  const contentSourceFn = deps.contentSourceFn ?? resolveContentSource;
  const lookupFn = deps.lookupFn ?? autogenAwareLookup;
  const log = deps.log ?? (() => {});

  // Set by composeOptions, read by renderPopup within the same turn.
  let resolvedLevel: MaturityLevel = 2;
  // Row id read this turn, so a blocked turn can consume it. Null ⇒ nothing read.
  let lastRowId: number | null = null;
  // The advisory's pinch label, for the popup header (see renderPopup).
  let lastPinchLabel: string | null = null;
  // True when the user explicitly chose "copy to clipboard" in the popup.
  let clipboardRequested = false;

  const composeOptions = (_promptText: string): DeciderOptionSet | null => {
    try {
      // 1. Reuse auto's classification. No row ⇒ nothing was classified for this
      //    turn ⇒ no popup. (Gap 5's "no pending_advisory row" case lands here.)
      const row = getRow(deps.store as never, deps.projectRoot, deps.sessionId);
      lastRowId = row ? row.id : null;
      lastPinchLabel = row ? row.pinchLabel ?? null : null;
      if (!row) {
        log('submit_option_source: no pending_advisory row — allowing');
        return null;
      }

      // 2. Classified signal → signal type. Local map lookup, no LLM.
      const signalType = signalTypeFn(row.flagType, row.stage);
      if (!signalType) {
        log('submit_option_source: flag has no signal type — allowing');
        return null;
      }

      // 3. Only the content-template source has deterministic records; the engine
      //    source is the LLM path that `A1` excludes.
      if (contentSourceFn(signalType) !== 'content-template') {
        log('submit_option_source: signal is not content-template — allowing');
        return null;
      }

      // 4. Experiment pin. Fail-open: malformed config ⇒ no pinning.
      let activePin: ActivePin | null = null;
      try { activePin = activePinFor(deps.store as never, signalType); } catch { activePin = null; }

      const baseLookup = lookupFn(deps.store as never, deps.projectRoot, signalType);
      const lookup = activePin ? applyPinToLookup(baseLookup, activePin.pin) : baseLookup;

      const baseLevel = (getLevel(deps.store as never, deps.projectRoot)?.currentLevel ?? 2) as MaturityLevel;
      resolvedLevel = activePin ? applyPinToLevel(baseLevel, activePin.pin) : baseLevel;

      const register = selectionRegister(deps.nature as never);

      // 5. The engine's generator — synchronous, LLM-free, consume-only.
      const generated = composeFn({ lookup, level: resolvedLevel, register, role: deps.role });
      if (!generated) {
        log('submit_option_source: generator returned nothing — allowing');
        return null;
      }

      const set: DeciderOptionSet = { l1: generated.l1, l2: generated.l2, l3: generated.l3 };
      if (listForLevel(set, resolvedLevel).length === 0) {
        log('submit_option_source: no options at the resolved level — allowing');
        return null;
      }
      return set;
    } catch (err) {
      // Fail-open (A3): never let an option-source fault hold the user's prompt.
      log(`submit_option_source: failed, allowing — ${(err as Error)?.message ?? 'unknown'}`);
      return null;
    }
  };

  const renderPopup = async (
    _promptText: string,
    options: DeciderOptionSet,
  ): Promise<DeciderSelection> => {
    try {
      const choices = listForLevel(options, resolvedLevel);
      if (choices.length === 0) return null;

      // The store layer's TTY selector — consume-only.
      // Same arguments the CLI flow passes (`stop.ts:303`). We reuse Layer C's
      // popup wholesale, so it must be constructed the same way — the store and
      // project root are what let the popup script resolve its clipboard command
      // chain and context. Calling it bare compiles (both params are optional)
      // but builds a popup missing that context.
      const selectFn = selectFnFactory(deps.store as never, deps.projectRoot);
      // Null on a non-TTY host (no interactive terminal) — release the prompt.
      if (!selectFn) { log('submit_option_source: no TTY selector — allowing'); return null; }
      const picked: unknown = await selectFn({
        message: 'Refine this prompt before sending?',
        // ── ⚠ REQUIRED HEADER FIELDS (live root cause, 2026-08-12) ─────────
        // The popup window's render-loop emits `pinch-label` and `question`
        // lines UNCONDITIONALLY (`render-loop.js` header pair) — an undefined
        // value crashes `styler` (`line.length`), the terminal closes within
        // ~200 ms, the selection resolves null, and the decider silently
        // allows. Measured live: the popup "flashed" and every submit passed
        // through. `stop.ts` never hits this because `runDecisionSession`
        // always supplies both. So they are REQUIRED here, not decoration:
        // the advisory's own pinch label (with a constant fallback so a
        // label-less row still renders) and the question line.
        pinchLabel: lastPinchLabel ?? 'Nexpath',
        question: 'Refine this prompt before sending?',
        options: choices.map((text) => ({ value: text, label: text })),
      } as never);

      // The selector's shape varies by build; accept a bare string or `{ value }`,
      // and treat anything else as a dismissal rather than guessing.
      // ── EXPLICIT "copy to clipboard" (Layer C's sentinel) ────────────────
      // The popup returns `__NEXPATH_CLIP__` when the user chooses copy rather
      // than a replacement. Treating it as ordinary text would INJECT THE LITERAL
      // SENTINEL into the user's chat and auto-submit it. It is surfaced to the
      // caller as a distinct signal instead.
      if (picked === CLIPBOARD_ONLY) { clipboardRequested = true; return null; }
      if (typeof picked === 'string') return picked || null;
      const pv = (picked as { value?: unknown } | null)?.value;
      if (pv === CLIPBOARD_ONLY) { clipboardRequested = true; return null; }
      if (picked && typeof picked === 'object' && typeof pv === 'string') {
        return ((picked as { value: string }).value) || null;
      }
      // Dismissal / unknown shape. Logged because this exact silent null once
      // masked a crashing popup window for a full day (2026-08-12): the crash
      // and a user pressing Esc were indistinguishable without this line.
      log('submit_option_source: popup returned no selection — allowing');
      return null;
    } catch (err) {
      // Fail-open (A3): a popup fault releases the prompt unmodified.
      log(`submit_option_source: popup failed, allowing — ${(err as Error)?.message ?? 'unknown'}`);
      return null;
    }
  };

  const consumeHandledTurn = (): void => {
    if (lastRowId !== null) {
      try {
        (deps.markShownFn ?? markAdvisoryShown)(deps.store as never, lastRowId);
      } catch (err) {
        // Non-fatal: the prompt is already blocked and the replacement persisted.
        // Worst case the old post-response popup also appears — annoying, not lost work.
        log(`submit_option_source: could not consume row — ${(err as Error)?.message ?? 'unknown'}`);
      }
    }

    // ── H8 / G-ARBITRATION Finding 2: the pending PE row must not survive ────
    // `auto` (run inside the hold, option-A) may ALSO have stored a
    // `pending_prompt_enhancements` row for the prompt the user just cancelled
    // and replaced. Left pending, that row fires later surfaces for a prompt
    // that no longer exists: the Windsurf pePoller inserts its body into
    // Cascade, and the next Stop's peLaunch pops the PE popup for it.
    //
    // Same principle as the advisory consume above — H3's acceptance rule ("no
    // pending artifact survives a turn this path fully handled") extended to
    // the PE table. Called only on 'block' by the wiring site, so an allowed
    // prompt keeps today's PE behaviour exactly. CONSUME-ONLY: both functions
    // are another member's store exports, called precisely as stop.ts calls
    // them — no Layer C file is modified.
    try {
      const getPeRow = deps.getPeRowFn ?? getPendingPromptEnhancement;
      const markPeShown = deps.markPeShownFn ?? markPromptEnhancementShown;
      const peRow = getPeRow(deps.store as never, deps.projectRoot);
      if (peRow) markPeShown(deps.store as never, peRow.id);
    } catch (err) {
      // Non-fatal for the same reason as above; the residual (pePoller may act
      // during the hold, BEFORE this consume runs) is a recorded G-ARBITRATION
      // question, not something this call site can close.
      log(`submit_option_source: could not consume PE row — ${(err as Error)?.message ?? 'unknown'}`);
    }
  };

  return { composeOptions, renderPopup, consumeHandledTurn, wasClipboardRequested: () => clipboardRequested };
}
