// Post-Pass-2 desc-base substitution pipeline.
//
// Runs the desc-base substitution steps AFTER Pass 2 returns the
// generated option texts. For each option:
//
//   - take the STATIC desc-base from the per-option entry in `content`
//   - run the runtime prompt-evidence injection (replaces the
//     {R5_INJECT: ...} placeholder)
//   - run the CA-facing bookend substitution (replaces {R4_OPEN} /
//     {R4_CLOSE})
//
// The function pairs each generated option-text with the static
// desc-base of the same index. When indexes do not line up (typically
// because validation has already enforced count parity, but defensive
// against edge cases) the static option's desc-base is passed through
// verbatim.
//
// Returns OptionEntry[] tuples so the call site keeps the option-
// text-vs-desc-base structural separation locked by the shape.

import type { PromptRecord } from '../classifier/types.js';
import type { DecisionContent, OptionEntry } from './options.js';
import { injectR5, type R5Register, type InjectR5Options } from './r5-injection.js';
import { substituteCAFacingBookend } from './r4-bookends.js';

export interface ApplyRuntimeSubstitutionsInput {
  generatedOptionTexts: readonly string[];
  staticEntries:        readonly OptionEntry[];
  history:              readonly PromptRecord[];
  signalType:           string;
  register:             R5Register;
  injectOptions?:       InjectR5Options;
}

export async function applyRuntimeSubstitutions(
  input: ApplyRuntimeSubstitutionsInput,
): Promise<OptionEntry[]> {
  // Per-entry calls are independent (no inter-call state); run in
  // parallel to keep per-advisory latency under the Haiku p50 target.
  return Promise.all(
    input.generatedOptionTexts.map(async (optionText, i) => {
      const staticEntry    = input.staticEntries[i];
      const staticDescBase = staticEntry?.descBase ?? '';

      // step 1 — prompt-evidence injection
      const afterR5 = await injectR5(
        staticDescBase,
        input.history,
        input.signalType,
        input.register,
        input.injectOptions ?? {},
      );

      // step 2 — CA-facing bookend substitution (runs LAST)
      const final = substituteCAFacingBookend(afterR5);

      return { option: optionText, descBase: final };
    }),
  );
}

/**
 * Run the post-Pass-2 substitution pipeline against the generated
 * option texts for all three levels in one call. Returns the fully-
 * substituted L1 / L2 / L3 OptionEntry arrays in a single structural
 * payload.
 */
export async function applyRuntimeSubstitutionsAllLevels(
  generated:    { l1: readonly string[]; l2: readonly string[]; l3: readonly string[] },
  content:      DecisionContent,
  history:      readonly PromptRecord[],
  signalType:   string,
  register:     R5Register,
  injectOptions?: InjectR5Options,
): Promise<{ l1: OptionEntry[]; l2: OptionEntry[]; l3: OptionEntry[] }> {
  // Capability opt-out: a set may declare `descBaseEnabled: false` to skip the
  // desc-base pipeline entirely. Options keep their generated text; desc-bases
  // are emitted empty. Defaults to enabled when omitted.
  if (content.descBaseEnabled === false) {
    const skip = (texts: readonly string[]): OptionEntry[] => texts.map((option) => ({ option, descBase: '' }));
    return { l1: skip(generated.l1), l2: skip(generated.l2), l3: skip(generated.l3) };
  }

  // Per-set length budget comes from DecisionContent. Merge it into
  // injectOptions so injectR5 enforces the tier ceiling.
  const mergedOptions: InjectR5Options = {
    ...(injectOptions ?? {}),
    lengthBudget: injectOptions?.lengthBudget ?? content.lengthBudget,
  };
  const [l1, l2, l3] = await Promise.all([
    applyRuntimeSubstitutions({ generatedOptionTexts: generated.l1, staticEntries: content.L1, history, signalType, register, injectOptions: mergedOptions }),
    applyRuntimeSubstitutions({ generatedOptionTexts: generated.l2, staticEntries: content.L2, history, signalType, register, injectOptions: mergedOptions }),
    applyRuntimeSubstitutions({ generatedOptionTexts: generated.l3, staticEntries: content.L3, history, signalType, register, injectOptions: mergedOptions }),
  ]);
  return { l1, l2, l3 };
}
