import { describe, it, expect } from 'vitest';
import {
  validateContentTemplateRecord,
  composePhase1,
  resolveSlotValue,
  resolveLevelForm,
  escapeSlotValue,
  MATURITY_LEVELS,
  type ContentTemplateRecord,
  type Slot,
  type LevelForm,
} from './content-template-schema.js';

function cell(option = 'opt', whyDesc = 'why') { return { option, whyDesc }; }
function form(kind: LevelForm['kind'] = 'slot-variant', c = cell()): LevelForm { return { kind, cell: c }; }
function validRecord(overrides: Partial<ContentTemplateRecord> = {}): ContentTemplateRecord {
  return {
    signalType: 'TASK_REVIEW',
    source: 'shipped',
    schemaVersion: 1,
    levelForms: { 1: form() },
    slots: [],
    ...overrides,
  };
}

describe('content-template-schema — validation (the single gate)', () => {
  it('accepts a well-formed record', () => {
    expect(validateContentTemplateRecord(validRecord())).toEqual({ ok: true, errors: [] });
  });

  it('rejects a non-object', () => {
    expect(validateContentTemplateRecord(null).ok).toBe(false);
  });

  it('requires the mandatory level-1 floor', () => {
    const r = validRecord({ levelForms: { 2: form() } });
    const res = validateContentTemplateRecord(r);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/level-1 floor/);
  });

  it('rejects a bad source tier and an unknown schemaVersion', () => {
    expect(validateContentTemplateRecord(validRecord({ source: 'bogus' as never })).ok).toBe(false);
    expect(validateContentTemplateRecord(validRecord({ schemaVersion: 999 })).ok).toBe(false);
  });

  it('validates slot shape per type', () => {
    expect(validateContentTemplateRecord(validRecord({ slots: [{ name: 'x', type: 'static-ref' }] })).ok).toBe(false); // missing ref
    expect(validateContentTemplateRecord(validRecord({ slots: [{ name: 'x', type: 'choice' }] })).ok).toBe(false);     // missing choices
    expect(validateContentTemplateRecord(validRecord({ slots: [{ name: 'x', type: 'literal', ref: 'v' }] })).ok).toBe(true);
    expect(validateContentTemplateRecord(validRecord({ slots: [{ name: 'x', type: 'param-value', ref: 'p' }] })).ok).toBe(true);
  });

  it('rejects a malformed levelForm (bad kind / cell)', () => {
    expect(validateContentTemplateRecord(validRecord({ levelForms: { 1: { kind: 'nope' as never, cell: cell() } } })).ok).toBe(false);
    expect(validateContentTemplateRecord(validRecord({ levelForms: { 1: { kind: 'slot-variant', cell: { option: 'o' } as never } } })).ok).toBe(false);
  });

  it('validates param-axes tags against the closed AR-1 set (optional field)', () => {
    expect(validateContentTemplateRecord(validRecord({ paramAxes: { framework: 'open', test_runner: 'nominal' } })).ok).toBe(true);
    expect(validateContentTemplateRecord(validRecord())).toEqual({ ok: true, errors: [] }); // omitted is fine
    const bad = validateContentTemplateRecord(validRecord({ paramAxes: { framework: 'bogus' as never } }));
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/paramAxes\.framework/);
  });

  it('validates the optional F8 spine field (array of non-empty strings)', () => {
    expect(validateContentTemplateRecord(validRecord({ spine: ['review-cadence'] })).ok).toBe(true);
    expect(validateContentTemplateRecord(validRecord())).toEqual({ ok: true, errors: [] }); // omitted is fine
    expect(validateContentTemplateRecord(validRecord({ spine: 'review' as never })).ok).toBe(false);
    expect(validateContentTemplateRecord(validRecord({ spine: [''] as never })).ok).toBe(false);
  });

  it('validates the optional l2SafeguardRequired field (boolean when present)', () => {
    expect(validateContentTemplateRecord(validRecord({ l2SafeguardRequired: true })).ok).toBe(true);
    expect(validateContentTemplateRecord(validRecord({ l2SafeguardRequired: false })).ok).toBe(true);
    expect(validateContentTemplateRecord(validRecord())).toEqual({ ok: true, errors: [] }); // omitted is fine (defaults false)
    const bad = validateContentTemplateRecord(validRecord({ l2SafeguardRequired: 'yes' as never }));
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/l2SafeguardRequired/);
  });

  it('validates the optional l2SafeguardLine field (non-empty string when present)', () => {
    expect(validateContentTemplateRecord(validRecord({ l2SafeguardLine: 'Ask me for go-ahead before X.' })).ok).toBe(true);
    expect(validateContentTemplateRecord(validRecord())).toEqual({ ok: true, errors: [] }); // omitted is fine
    expect(validateContentTemplateRecord(validRecord({ l2SafeguardLine: '' })).ok).toBe(false); // empty rejected
    const bad = validateContentTemplateRecord(validRecord({ l2SafeguardLine: 42 as never }));
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/l2SafeguardLine/);
  });
});

describe('content-template-schema — two-phase compose (Phase-1 preserves {R...})', () => {
  const slots: Slot[] = [{ name: 'feature', type: 'literal', ref: 'checkout' }];

  it('fills {{name}} and leaves all {R...} runtime placeholders untouched', () => {
    const tpl = '{R4_OPEN}\nWork on {{feature}}. {R5_INJECT: last 4 prompts}\n{R4_CLOSE}';
    const out = composePhase1(tpl, slots);
    expect(out).toBe('{R4_OPEN}\nWork on checkout. {R5_INJECT: last 4 prompts}\n{R4_CLOSE}');
  });

  it('leaves an unfilled {{name}} as-is', () => {
    expect(composePhase1('see {{unknown}}', slots)).toBe('see {{unknown}}');
  });
});

describe('content-template-schema — the 4 slot types resolve from their source', () => {
  it('literal / param-value / static-ref / choice + fallback', () => {
    expect(resolveSlotValue({ name: 'a', type: 'literal', ref: 'lit' })).toBe('lit');
    expect(resolveSlotValue({ name: 'a', type: 'param-value', ref: 'p' }, { params: { p: 'pv' } })).toBe('pv');
    expect(resolveSlotValue({ name: 'a', type: 'static-ref', ref: 'k' }, { staticRefs: { k: 'sv' } })).toBe('sv');
    expect(resolveSlotValue({ name: 'a', type: 'choice', choices: ['x', 'y'] })).toBe('x'); // first by default
    expect(resolveSlotValue({ name: 'a', type: 'choice', choices: ['x', 'y'] }, { choiceSelector: () => 'y' })).toBe('y');
    expect(resolveSlotValue({ name: 'a', type: 'param-value', ref: 'missing', fallback: 'fb' })).toBe('fb');
  });
});

describe('content-template-schema — injection guard', () => {
  it('neutralises composition + runtime grammar inside a slot value', () => {
    expect(escapeSlotValue('{{evil}}')).not.toMatch(/\{\{evil\}\}/);
    expect(escapeSlotValue('x {R5_INJECT: y}')).not.toMatch(/\{R5_INJECT:/);
    expect(escapeSlotValue('{R4_OPEN}')).not.toMatch(/\{R4_OPEN\}/);
  });

  it('a param value containing grammar is NOT re-expanded by compose', () => {
    const slots: Slot[] = [{ name: 'u', type: 'param-value', ref: 'u' }];
    const out = composePhase1('hi {{u}}', slots, { params: { u: '{{feature}}' } });
    expect(out).not.toMatch(/hi \{\{feature\}\}/); // the injected {{feature}} is broken, not live
  });
});

describe('content-template-schema — levelForms resolution (closest-level, floor, clamp)', () => {
  const lf = { 1: form('structural-variant'), 3: form(), 5: form() };

  it('exact match wins', () => {
    expect(resolveLevelForm(lf, 3)?.level).toBe(3);
  });

  it('falls to the nearest authored within [floor, L+1], ties → lower', () => {
    expect(resolveLevelForm(lf, 2)?.level).toBe(1); // |2-1|=1 vs |2-3|=1 → tie → lower (1)
    expect(resolveLevelForm(lf, 4)?.level).toBe(3); // |4-3|=1 vs |4-5|=1 → tie → lower (3)
  });

  it('the mandatory level-1 floor guarantees a result for any level', () => {
    for (const l of MATURITY_LEVELS) expect(resolveLevelForm({ 1: form() }, l)).not.toBeNull();
  });

  it('respects the L+1 clamp (never reaches a far upper level)', () => {
    // requesting 1 with only level 5 authored: window [1,2] has none → null (floor guard absent here is intentional)
    expect(resolveLevelForm({ 5: form() }, 1)).toBeNull();
  });
});

describe('content-template-schema — declared-level-count flexibility', () => {
  it('the maturity levels are declared in one place (5 today)', () => {
    expect(MATURITY_LEVELS).toEqual([1, 2, 3, 4, 5]);
  });
});
