import { describe, it, expect } from 'vitest';
import { extractMovementCredits, MOVEMENT_CREDIT, MOVEMENT_CREDIT_MAP } from './trajectory-credit.js';
import type { ParamEvent } from '../telemetry/param-events.js';

function ev(signalKey: string, over: Partial<ParamEvent> = {}): ParamEvent {
  return {
    schemaVersion: 1,
    ts: 1_700_000_000_000,
    projectRoot: '/p',
    sessionId: 's1',
    promptIndex: 0,
    signalKey,
    channel: 'probe',
    stage: null,
    stageConfidence: null,
    source: 'live',
    ...over,
  };
}

describe('extractMovementCredits', () => {
  it('an acquired capability credits its mapped practice signal', () => {
    const { credits } = extractMovementCredits([ev('env_fact_changed:has_test_runner:acquired')]);
    expect(credits.get('test_creation')).toBe(MOVEMENT_CREDIT);
  });

  it('losing or changing a fact never credits (regressions are the absence side\'s job)', () => {
    const { credits } = extractMovementCredits([
      ev('env_fact_changed:has_test_runner:lost'),
      ev('env_fact_changed:project_framework:changed'),
    ]);
    expect(credits.size).toBe(0);
  });

  it('an unmapped fact is consumed without credit', () => {
    const { events, credits } = extractMovementCredits([ev('env_fact_changed:has_version_control:acquired')]);
    expect(credits.size).toBe(0);
    expect(events).toEqual([]); // consumed — never an inert profile entry
  });

  it('re-acquiring the same fact within the window counts once', () => {
    const { credits } = extractMovementCredits([
      ev('env_fact_changed:has_ci_pipeline:acquired', { ts: 1 }),
      ev('env_fact_changed:has_ci_pipeline:acquired', { ts: 2 }),
    ]);
    expect(credits.get('ci_pipeline')).toBe(MOVEMENT_CREDIT);
  });

  it('distinct facts credit independently', () => {
    const { credits } = extractMovementCredits([
      ev('env_fact_changed:has_test_runner:acquired'),
      ev('env_fact_changed:has_security_scanner:acquired'),
    ]);
    expect(credits.get('test_creation')).toBe(MOVEMENT_CREDIT);
    expect(credits.get('security_check')).toBe(MOVEMENT_CREDIT);
  });

  it('every trajectory row is consumed — even malformed ones — and other events pass through untouched', () => {
    const practice = ev('test_creation', { channel: 'keyword', stage: 'implementation' });
    const { events, credits } = extractMovementCredits([
      practice,
      ev('env_fact_changed:weird'), // malformed trajectory row
      ev('env_fact_changed:has_test_runner:acquired'),
    ]);
    expect(events).toEqual([practice]);
    expect(credits.get('test_creation')).toBe(MOVEMENT_CREDIT);
  });

  it('the credit map only targets signals the promotion corroborators also use', () => {
    expect(Object.values(MOVEMENT_CREDIT_MAP).sort()).toEqual(['ci_pipeline', 'security_check', 'test_creation']);
  });
});
