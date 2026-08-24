import { describe, it, expect } from 'vitest';
import { findWhyDescVoiceViolations } from '../whydesc-voice-lint.js';
import { resolveRegisterForms } from '../content-template-engine.js';
import { CLASS7_RECORDS } from './class7-records.js';

/**
 * Regression lock for the class-7 why-desc voice.
 *
 * The shipped `whydesc-voice-lint.test.ts` gate is GLOBAL — it only asserts the
 * whole-set flagged-cell total stays at or below a moving baseline. That gate does
 * NOT pin class 7 to zero: a caption-voice why-desc could be reintroduced into a
 * class-7 cell and still slip under the global baseline if another class dropped.
 *
 * This check closes that gap. Every served class-7 why-desc cell — all 20 base
 * records and the 11 beginner overrides, across all five maturity columns — must
 * carry ZERO voice violations, checked against its own option (so the coherence
 * rule participates). It is independent of the global baseline and fails the moment
 * any class-7 cell drifts back to caption / situation-statement voice.
 */

const LEVELS = [1, 2, 3, 4, 5] as const;

/** Every base cell is one (option, whyDesc) pair; the option is passed so the coherence rule runs. */
function baseCells() {
  return CLASS7_RECORDS.flatMap((r) =>
    LEVELS.filter((l) => r.levelForms[l]).map((l) => ({
      signalType: r.signalType,
      register: 'base' as const,
      level: l,
      cell: r.levelForms[l]!.cell,
    })),
  );
}

/** Beginner cells come from the resolved beginner register (base + structurally-divergent override). */
function beginnerCells() {
  return CLASS7_RECORDS.filter((r) => r.registerOverrides?.beginner?.divergence === 'structurally-divergent').flatMap((r) => {
    const forms = resolveRegisterForms(r, 'beginner');
    return LEVELS.filter((l) => forms[l]).map((l) => ({
      signalType: r.signalType,
      register: 'beginner' as const,
      level: l,
      cell: forms[l]!.cell,
    }));
  });
}

describe('class-7 why-desc voice — regression lock (agent-voice, zero drift)', () => {
  const base = baseCells();
  const beginner = beginnerCells();

  it('scans the full class-7 surface — 100 base cells + 55 beginner cells (guards against silent shrinkage)', () => {
    expect(base.length).toBe(100); // 20 records × 5 columns
    expect(beginner.length).toBe(55); // 11 casual-anchored overrides × 5 columns
  });

  it('every base why-desc is voice-clean (no caption / ladder-meta / situation-statement / coherence-restate drift)', () => {
    const flagged = base
      .map((c) => ({ ...c, v: findWhyDescVoiceViolations(c.cell.whyDesc, c.cell.option) }))
      .filter((c) => c.v.length > 0)
      .map((c) => `${c.signalType} L${c.level}: ${c.v.map((x) => x.pattern).join(',')}`);
    expect(flagged, `class-7 base cells drifted: ${JSON.stringify(flagged)}`).toEqual([]);
  });

  it('every beginner why-desc is voice-clean, including the authored col-3 (no frozen anchor to exempt)', () => {
    const flagged = beginner
      .map((c) => ({ ...c, v: findWhyDescVoiceViolations(c.cell.whyDesc, c.cell.option) }))
      .filter((c) => c.v.length > 0)
      .map((c) => `${c.signalType} L${c.level}: ${c.v.map((x) => x.pattern).join(',')}`);
    expect(flagged, `class-7 beginner cells drifted: ${JSON.stringify(flagged)}`).toEqual([]);
  });
});
