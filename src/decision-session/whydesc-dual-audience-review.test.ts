import { describe, it, expect } from 'vitest';
import { SHIPPED_CONTENT_TEMPLATES } from './content-template-tooling.js';
import { resolveRegisterForms } from './content-template-engine.js';
import { findWhyDescVoiceViolations } from './whydesc-voice-lint.js';

// Phase 18.4 — final dual-audience review on a cross-class sample.
//
// Each why-desc is dual-audience: it is delivered to the coding agent (an instruction it reads and
// acts on) AND surfaced in the popup as the `↳` sub-line the USER reads. This review samples cells
// across the full shipped set (a deterministic stride, spanning classes / registers / sensitivity),
// prints each `option / ↳ why-desc` pair as the human-review artifact, and locks the structural
// properties that make a cell read well for BOTH audiences:
//   - agent side: voice-clean AND complements (not restates) the option — findWhyDescVoiceViolations;
//   - user side : a single, self-contained, reasonably-short sub-line, with no raw runtime token.
//
// Placeholder-carrying desc-bases (a minority — they get a runtime substitution) are out of scope
// for a STATIC review and are counted separately; the reviewed set must still be substantial.

const PLACEHOLDER = /\{[R{]/;
const SUBLINE_MAX = 600; // a generous ceiling — catches runaway content, not normal 1-2 sentence why-descs

const STRIDE = 12;
const SAMPLE = SHIPPED_CONTENT_TEMPLATES.filter((_, i) => i % STRIDE === 0);

function cells(): Array<{ sig: string; register: 'base' | 'beginner'; level: number; option: string; whyDesc: string }> {
  const out: Array<{ sig: string; register: 'base' | 'beginner'; level: number; option: string; whyDesc: string }> = [];
  for (const r of SAMPLE) {
    for (const lvl of [1, 3, 5] as const) {
      const c = r.levelForms[lvl]?.cell;
      if (c) out.push({ sig: r.signalType, register: 'base', level: lvl, option: c.option, whyDesc: c.whyDesc });
    }
    if (r.registerOverrides?.beginner) {
      const forms = resolveRegisterForms(r, 'beginner');
      for (const lvl of [1, 5] as const) {
        const c = forms[lvl]?.cell;
        if (c) out.push({ sig: r.signalType, register: 'beginner', level: lvl, option: c.option, whyDesc: c.whyDesc });
      }
    }
  }
  return out;
}

describe('why-desc dual-audience review — cross-class sample (18.4)', () => {
  const all = cells();
  const reviewable = all.filter((c) => !PLACEHOLDER.test(c.whyDesc));

  it('the cross-class sample is substantial (not a vacuous review)', () => {
    expect(SAMPLE.length).toBeGreaterThanOrEqual(10);
    expect(reviewable.length).toBeGreaterThanOrEqual(30);
    // eslint-disable-next-line no-console
    console.log(`[18.4] sample records=${SAMPLE.length} reviewable cells=${reviewable.length} (of ${all.length}; ${all.length - reviewable.length} carry a runtime placeholder — out of static scope)`);
  });

  it('every reviewable cell reads well for BOTH audiences (agent-voice-clean + popup sub-line shape)', () => {
    const bad: string[] = [];
    for (const c of reviewable) {
      const voice = findWhyDescVoiceViolations(c.whyDesc, c.option);
      const singleLine = !c.whyDesc.includes('\n');
      const bounded = c.whyDesc.trim().length > 0 && c.whyDesc.length <= SUBLINE_MAX;
      if (voice.length || !singleLine || !bounded) {
        bad.push(`${c.sig} ${c.register} L${c.level}: voice=${JSON.stringify(voice.map((v) => v.pattern))} singleLine=${singleLine} len=${c.whyDesc.length}`);
      }
    }
    expect(bad, `dual-audience issues:\n${bad.join('\n')}`).toEqual([]);
  });

  it('prints the review artifact — option / ↳ why-desc pairs for human inspection', () => {
    // A readable subset (first base cell per sampled record) so the log stays scannable.
    const seen = new Set<string>();
    for (const c of reviewable) {
      if (c.register !== 'base' || seen.has(c.sig)) continue;
      seen.add(c.sig);
      // eslint-disable-next-line no-console
      console.log(`\n[18.4] ${c.sig} L${c.level}\n   OPTION: ${c.option.replace(/\n/g, ' ⏎ ')}\n   ↳ WHY : ${c.whyDesc}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
});
