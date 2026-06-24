import { describe, it, expect } from 'vitest';
import {
  findJargonViolations,
  checkKeywordRetention,
  checkEscalation,
  checkCoverage,
  checkHeadlineOnly,
  reviewRecord,
} from './content-authoring-rules.js';
import type { ContentTemplateRecord, LevelForm, MaturityLevel } from './content-template-schema.js';

function form(option: string, whyDesc = 'why', kind: LevelForm['kind'] = 'slot-variant'): LevelForm {
  return { kind, cell: { option, whyDesc } };
}
function rec(levelForms: Partial<Record<MaturityLevel, LevelForm>>): ContentTemplateRecord {
  return { signalType: 'X', source: 'shipped', schemaVersion: 1, levelForms, slots: [] };
}

describe('content-authoring-rules — de-jargon', () => {
  it('flags a technical term carrying the instruction on its own', () => {
    expect(findJargonViolations('add observability').map((v) => v.term)).toEqual(['observability']);
  });

  it('allows a technical term inside a trailing parenthetical', () => {
    expect(findJargonViolations('hear about failures before users do (observability)')).toEqual([]);
  });

  it('allows the genuine-concept set bare ONLY at the heaviest column', () => {
    expect(findJargonViolations('write an ADR', { level: 5 })).toEqual([]);      // allowed at top
    expect(findJargonViolations('write an ADR', { level: 3 }).map((v) => v.term)).toEqual(['ADR']); // not at col-3
    expect(findJargonViolations('use a canary', { level: 5 })).toEqual([]);
  });

  it('still flags a non-genuine-concept term even at the heaviest column', () => {
    expect(findJargonViolations('set up observability', { level: 5 }).map((v) => v.term)).toEqual(['observability']);
  });

  it('passes plain instruction text', () => {
    expect(findJargonViolations('roll it out to a few users first and watch for errors')).toEqual([]);
  });
});

describe('content-authoring-rules — keyword retention', () => {
  it('passes when the keyword is in every authored column', () => {
    const r = rec({ 1: form('plan the next task'), 3: form('write a plan first'), 5: form('plan with acceptance criteria') });
    expect(checkKeywordRetention(r, 'plan').ok).toBe(true);
  });

  it('reports the columns missing the keyword', () => {
    const r = rec({ 1: form('plan the next task'), 3: form('just start coding'), 5: form('plan with acceptance criteria') });
    expect(checkKeywordRetention(r, 'plan').missingLevels).toEqual([3]);
  });
});

describe('content-authoring-rules — escalation monotonicity', () => {
  it('passes a non-decreasing practice-weight sequence (flat is OK)', () => {
    expect(checkEscalation([1, 1, 2, 3, 3])).toEqual({ ok: true, firstDropIndex: -1 });
  });
  it('flags the first drop', () => {
    expect(checkEscalation([1, 2, 1])).toEqual({ ok: false, firstDropIndex: 2 });
  });
});

describe('content-authoring-rules — coverage', () => {
  it('all levels reachable when the level-1 floor exists', () => {
    expect(checkCoverage(rec({ 1: form('a'), 3: form('b') })).ok).toBe(true);
  });
  it('reports unreachable levels when low columns have no fallback', () => {
    const res = checkCoverage(rec({ 5: form('only top') }));
    expect(res.ok).toBe(false);
    expect(res.unreachableLevels).toEqual([1, 2, 3]); // 4 falls up to 5 (L+1 clamp), 5 is exact
  });
});

describe('content-authoring-rules — headline-only', () => {
  it('passes a clean two-channel cell', () => {
    expect(checkHeadlineOnly(rec({ 1: form('a') })).ok).toBe(true);
  });
  it('flags a cell that smuggled extra (strength-row-like) keys', () => {
    const bad = rec({ 1: { kind: 'slot-variant', cell: { option: 'a', whyDesc: 'w', L2: ['x'] } as never } });
    expect(checkHeadlineOnly(bad).offendingLevels).toEqual([1]);
  });
});

describe('content-authoring-rules — aggregate review', () => {
  it('a clean record passes every check', () => {
    const r = rec({ 1: form('plan it'), 3: form('plan with a doc'), 5: form('plan with acceptance criteria') });
    expect(reviewRecord(r, 'plan').ok).toBe(true);
  });
  it('surfaces jargon + missing-keyword failures', () => {
    const r = rec({ 1: form('add observability'), 3: form('plan with a doc') });
    const review = reviewRecord(r, 'plan');
    expect(review.ok).toBe(false);
    expect(review.jargonByLevel[1]?.map((v) => v.term)).toEqual(['observability']);
    expect(review.keywordRetention.missingLevels).toContain(1);
  });
});
