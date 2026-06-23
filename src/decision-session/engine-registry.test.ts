import { describe, it, expect } from 'vitest';
import {
  resolveEngine,
  ENGINES,
  type Engine,
  type ParamPolarity,
  type EngineInput,
  type ContentSpec,
} from './engine-registry.js';
import { contentTemplateEngine } from './content-template-engine.js';
import { absenceSignalEngine } from './absence-signal-engine.js';
import { openStore } from '../store/db.js';
import { SessionStateManager } from '../classifier/SessionStateManager.js';

const ALL_POLARITIES: ParamPolarity[] = ['good_present', 'corrective', 'governance', 'meta'];

describe('engine-registry — routing', () => {
  it('routes good_present → ContentTemplateEngine (first accepts() match)', () => {
    expect(resolveEngine('good_present')).toBe(contentTemplateEngine);
  });

  it('routes corrective → AbsenceSignalEngine', () => {
    expect(resolveEngine('corrective')).toBe(absenceSignalEngine);
  });

  it('routes governance + meta to NEITHER engine (exception classes)', () => {
    expect(resolveEngine('governance')).toBeNull();
    expect(resolveEngine('meta')).toBeNull();
  });

  it('at most one engine accepts any polarity (no overlap)', () => {
    for (const p of ALL_POLARITIES) {
      expect(ENGINES.filter((e) => e.accepts(p)).length).toBeLessThanOrEqual(1);
    }
  });

  it('keeps ContentTemplateEngine before AbsenceSignalEngine (determinism)', () => {
    expect(ENGINES.indexOf(contentTemplateEngine)).toBeLessThan(ENGINES.indexOf(absenceSignalEngine));
  });

  it('add-an-engine: a new engine routes via one array entry — router unchanged', () => {
    const tooling: Engine = {
      name: 'tooling',
      accepts: (p) => p === 'good_present',
      run: () => ({ kind: 'content-template', payload: null }),
    };
    // Placed first → first-accepts-match returns it (demonstrates array-walk extensibility).
    expect(resolveEngine('good_present', [tooling, ...ENGINES])).toBe(tooling);
    // The default registry is unaffected.
    expect(resolveEngine('good_present')).toBe(contentTemplateEngine);
  });
});

describe('ContentTemplateEngine', () => {
  it('owns good_present, never owns corrective (guard-rail: does not fire mistakes)', () => {
    expect(contentTemplateEngine.accepts('good_present')).toBe(true);
    expect(contentTemplateEngine.accepts('corrective')).toBe(false);
    expect(contentTemplateEngine.accepts('governance')).toBe(false);
    expect(contentTemplateEngine.accepts('meta')).toBe(false);
  });

  it('run() is deferred to the content-template layer (throws until built)', () => {
    expect(() => contentTemplateEngine.run({} as EngineInput)).toThrow(/content-template layer/);
  });
});

describe('AbsenceSignalEngine', () => {
  it('owns corrective, never owns good_present', () => {
    expect(absenceSignalEngine.accepts('corrective')).toBe(true);
    expect(absenceSignalEngine.accepts('good_present')).toBe(false);
    expect(absenceSignalEngine.accepts('governance')).toBe(false);
    expect(absenceSignalEngine.accepts('meta')).toBe(false);
  });

  it('run() wraps detectAbsenceFlags and returns an absence ContentSpec', async () => {
    const store = await openStore(':memory:');
    const state = SessionStateManager.load(store, '/test/project').current;
    const out = absenceSignalEngine.run({ state });
    expect(out.kind).toBe('absence');
    expect(Array.isArray((out as Extract<ContentSpec, { kind: 'absence' }>).flags)).toBe(true);
    store.db.close();
  });
});
