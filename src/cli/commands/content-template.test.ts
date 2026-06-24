import { describe, it, expect } from 'vitest';
import { scaffoldRecord, validateRecordObject } from './content-template.js';
import { validateContentTemplateRecord, MATURITY_LEVELS } from '../../decision-session/content-template-schema.js';

describe('content-template CLI — scaffoldRecord', () => {
  it('scaffolds a minimal record with just the level-1 floor (schema-valid)', () => {
    const r = scaffoldRecord('TASK_REVIEW');
    expect(r.signalType).toBe('TASK_REVIEW');
    expect(Object.keys(r.levelForms)).toEqual(['1']);
    expect(validateContentTemplateRecord(r).ok).toBe(true);
  });

  it('--shape scaffolds the full 5-column ladder (schema-valid)', () => {
    const r = scaffoldRecord('TASK_REVIEW', { shape: true });
    expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([...MATURITY_LEVELS]);
    expect(validateContentTemplateRecord(r).ok).toBe(true);
  });
});

describe('content-template CLI — validateRecordObject', () => {
  it('reports schema failure and runs no review gates', () => {
    const res = validateRecordObject({ signalType: '', source: 'bogus' });
    expect(res.schema.ok).toBe(false);
    expect(res.review).toBeUndefined();
  });

  it('runs the review gates on a schema-valid record', () => {
    const r = scaffoldRecord('X', { shape: true });
    const res = validateRecordObject(r);
    expect(res.schema.ok).toBe(true);
    expect(res.review).toBeDefined();
    expect(res.review?.coverage.ok).toBe(true); // floor present → all levels reachable
  });

  it('applies the keyword-retention gate when a keyword is supplied', () => {
    const r = scaffoldRecord('plan');
    r.levelForms[1] = { kind: 'slot-variant', cell: { option: 'no keyword here', whyDesc: 'nor here' } };
    const res = validateRecordObject(r, 'plan');
    expect(res.review?.keywordRetention.ok).toBe(false);
    expect(res.review?.keywordRetention.missingLevels).toContain(1);
  });
});
