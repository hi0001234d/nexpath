import { describe, it, expect } from 'vitest';
import {
  findJargonViolations,
  checkKeywordRetention,
  checkEscalation,
  checkCoverage,
  checkHeadlineOnly,
  reviewRecord,
  findVoiceViolations,
  checkVoice,
  checkL2Safeguard,
  DE_JARGON_TABLE,
  TOP_COLUMN_ALLOWED_CONCEPTS,
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

  it('allows the rest of the genuine-concept set (blue-green, min-permission DB) bare ONLY at the top', () => {
    expect(findJargonViolations('use blue-green deploys', { level: 5 })).toEqual([]);
    expect(findJargonViolations('use blue-green deploys', { level: 3 }).map((v) => v.term)).toEqual(['blue-green']);
    expect(findJargonViolations('give it a min-permission DB', { level: 5 })).toEqual([]);
    expect(findJargonViolations('give it a min-permission DB', { level: 3 }).map((v) => v.term)).toEqual(['min-permission DB']);
  });

  it('still flags a non-genuine-concept term even at the heaviest column', () => {
    expect(findJargonViolations('set up observability', { level: 5 }).map((v) => v.term)).toEqual(['observability']);
  });

  it('flags every distinct jargon term present in one string', () => {
    expect(findJargonViolations('add observability and a secrets manager').map((v) => v.term))
      .toEqual(['observability', 'secrets manager']);
  });

  it('flags the non-genuine-concept terms even at the heaviest column (CI gate, edge-case matrix)', () => {
    expect(findJargonViolations('add a CI gate', { level: 5 }).map((v) => v.term)).toEqual(['CI gate']);
    expect(findJargonViolations('build an edge-case matrix', { level: 5 }).map((v) => v.term)).toEqual(['edge-case matrix']);
  });

  it('passes plain instruction text', () => {
    expect(findJargonViolations('roll it out to a few users first and watch for errors')).toEqual([]);
  });
});

describe('content-authoring-rules — de-jargon data integrity', () => {
  it('every required de-jargon term is present, each with a plain-language alternative', () => {
    const required = ['ADR', 'canary', 'blue-green', 'CI gate', 'observability', 'secrets manager', 'min-permission DB', 'edge-case matrix'];
    const terms = DE_JARGON_TABLE.map((t) => t.term);
    for (const r of required) expect(terms).toContain(r);
    for (const t of DE_JARGON_TABLE) expect(t.plain.trim().length).toBeGreaterThan(0);
  });

  it('the bare-at-top genuine-concept set is exactly the three concepts and all live in the table', () => {
    expect([...TOP_COLUMN_ALLOWED_CONCEPTS]).toEqual(['ADR', 'canary', 'blue-green', 'min-permission DB']);
    const lowered = DE_JARGON_TABLE.map((t) => t.term.toLowerCase());
    for (const c of TOP_COLUMN_ALLOWED_CONCEPTS) expect(lowered).toContain(c.toLowerCase());
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

  it('matches case-insensitively (capitalised option / upper-case keyword)', () => {
    const r = rec({ 1: form('Plan the next task'), 3: form('write a PLAN first') });
    expect(checkKeywordRetention(r, 'PLAN').ok).toBe(true);
  });
});

describe('content-authoring-rules — escalation monotonicity', () => {
  it('passes a non-decreasing practice-weight sequence (flat is OK)', () => {
    expect(checkEscalation([1, 1, 2, 3, 3])).toEqual({ ok: true, firstDropIndex: -1 });
  });
  it('flags the first drop', () => {
    expect(checkEscalation([1, 2, 1])).toEqual({ ok: false, firstDropIndex: 2 });
  });
  it('treats an empty or single-column sequence as trivially monotonic', () => {
    expect(checkEscalation([])).toEqual({ ok: true, firstDropIndex: -1 });
    expect(checkEscalation([3])).toEqual({ ok: true, firstDropIndex: -1 });
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
  it('flags a two-key cell whose keys are not exactly option + whyDesc', () => {
    const bad = rec({ 1: { kind: 'slot-variant', cell: { option: 'a', extra: 'b' } as never } });
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

  it('surfaces a coverage failure (unreachable low columns, no floor)', () => {
    const review = reviewRecord(rec({ 5: form('plan at the top') }), 'plan');
    expect(review.ok).toBe(false);
    expect(review.coverage.ok).toBe(false);
    expect(review.coverage.unreachableLevels).toEqual([1, 2, 3]);
  });

  it('surfaces a headline-only failure (smuggled strength rows)', () => {
    const bad = rec({ 1: { kind: 'slot-variant', cell: { option: 'plan it', whyDesc: 'w', L2: ['x'] } as never } });
    const review = reviewRecord(bad, 'plan');
    expect(review.ok).toBe(false);
    expect(review.headlineOnly.offendingLevels).toEqual([1]);
  });

  it('detects jargon in the why-desc channel, not just the option', () => {
    const review = reviewRecord(rec({ 1: form('plan it', 'add observability') }), 'plan');
    expect(review.ok).toBe(false);
    expect(review.jargonByLevel[1]?.map((v) => v.term)).toEqual(['observability']);
    expect(review.keywordRetention.ok).toBe(true); // keyword lives in the option, which is clean
  });
});

describe('content-authoring-rules — Layer-1 voice gate', () => {
  it('flags banned third-person AI / prompt-object phrases', () => {
    expect(findVoiceViolations('Ask the AI to review this option').map((v) => v.pattern).sort())
      .toEqual(['ask the AI', 'the AI', 'this option'].sort());
  });

  it('passes clean first-person/imperative voice', () => {
    expect(findVoiceViolations('Review the login flow and tell me what you find')).toEqual([]);
  });

  it('checkVoice reports per-level violations across both channels', () => {
    const r = rec({ 1: form('plan it', 'the AI will plan'), 3: form('write a plan', 'clean why') });
    const res = checkVoice(r);
    expect(res.ok).toBe(false);
    expect(res.byLevel[1]?.map((v) => v.pattern)).toContain('the AI');
    expect(res.byLevel[3]).toBeUndefined();
  });
});

describe('content-authoring-rules — Layer-2 safeguard gate', () => {
  it('flags a sensitive action whose why-desc lacks a confirm-seek', () => {
    const r = rec({ 1: form('delete the old records', 'this cleans things up') });
    const res = checkL2Safeguard(r);
    expect(res.ok).toBe(false);
    expect(res.unguardedLevels).toEqual([1]);
    expect(res.triggersByLevel[1]).toContain('destructive-fs');
  });

  it('passes a sensitive action that carries a confirm-seek in the why-desc', () => {
    const r = rec({ 1: form('delete the old records', 'cleanup — still, confirm with me before this') });
    expect(checkL2Safeguard(r).ok).toBe(true);
  });

  it('passes a non-sensitive action regardless of safeguard wording', () => {
    expect(checkL2Safeguard(rec({ 1: form('review the plan', 'a quick check') })).ok).toBe(true);
  });
});
