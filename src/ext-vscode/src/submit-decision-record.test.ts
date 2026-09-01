/**
 * H3 — the cross-process decision record.
 *
 * This is untrusted input by construction: written by the CLI hook, read by the
 * extension host. The tests below are weighted toward REJECTION, because the
 * failure that matters is not "a valid record was rejected" (fail-open — the user
 * simply keeps their prompt) but "an invalid record was accepted and something
 * wrong was injected into a real chat".
 */
import { describe, it, expect } from 'vitest';
import {
  parseSubmitDecisionRecordV1,
  parseSubmitDecisionJsonV1,
  buildSubmitDecisionRecordV1,
  describeSubmitDecisionSafely,
  SUBMIT_DECISION_SCHEMA_V1,
} from './submit-decision-record.js';

const valid = {
  schemaVersion: 1,
  decisionId: 'd-1',
  replacementText: 'the picked option',
  createdAt: 1_700_000_000_000,
  blockIssuedAt: 1_699_999_999_000,
  hookPid: 4242,
  host: 'windsurf' as const,
};

describe('accepts a well-formed record', () => {
  it('round-trips build → parse unchanged', () => {
    const built = buildSubmitDecisionRecordV1({
      decisionId: 'd-9', replacementText: 'x', createdAt: 5, host: 'cursor', blockIssuedAt: 4, hookPid: 7,
    });
    expect(parseSubmitDecisionRecordV1(built)).toEqual(built);
    expect(built.schemaVersion).toBe(SUBMIT_DECISION_SCHEMA_V1);
  });

  it('parses from JSON text — what the hook actually writes', () => {
    expect(parseSubmitDecisionJsonV1(JSON.stringify(valid))).toEqual(valid);
  });

  it('drops unknown extra keys rather than passing them through', () => {
    const parsed = parseSubmitDecisionRecordV1({ ...valid, sneaky: 'nope', originalPrompt: 'secret' });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('sneaky');
    // The original prompt must never survive into the record — a second on-disk
    // copy of the user's prompt is exactly the raw-prompt-on-disk leak class.
    expect(parsed).not.toHaveProperty('originalPrompt');
  });
});

describe('rejects anything malformed — every failure means "nothing pending"', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'not an object'],
    ['a number', 42],
    ['an array', [valid]],
  ])('rejects %s', (_label, input) => {
    expect(parseSubmitDecisionRecordV1(input)).toBeNull();
  });

  it('rejects a wrong/absent schemaVersion — an older or newer writer must not be trusted', () => {
    expect(parseSubmitDecisionRecordV1({ ...valid, schemaVersion: 2 })).toBeNull();
    expect(parseSubmitDecisionRecordV1({ ...valid, schemaVersion: '1' })).toBeNull();
    const { schemaVersion: _drop, ...without } = valid;
    expect(parseSubmitDecisionRecordV1(without)).toBeNull();
  });

  it('rejects an EMPTY replacementText — injecting "" would clear the composer and lose the turn', () => {
    expect(parseSubmitDecisionRecordV1({ ...valid, replacementText: '' })).toBeNull();
  });

  it.each([
    ['missing replacementText', { ...valid, replacementText: undefined }],
    ['non-string replacementText', { ...valid, replacementText: 123 }],
    ['empty decisionId', { ...valid, decisionId: '' }],
    ['non-string decisionId', { ...valid, decisionId: null }],
    ['non-numeric createdAt', { ...valid, createdAt: 'soon' }],
    // Stage 1 of the mandated five. A record without it cannot be timed, and
    // JSON.stringify silently drops an undefined field on the writer side.
    ['missing blockIssuedAt', (() => { const v = { ...valid } as Record<string, unknown>; delete v.blockIssuedAt; return v; })()],
    ['non-numeric blockIssuedAt', { ...valid, blockIssuedAt: 'soon' }],
    ['NaN blockIssuedAt', { ...valid, blockIssuedAt: Number.NaN }],
    ['NaN createdAt', { ...valid, createdAt: Number.NaN }],
    ['Infinity createdAt', { ...valid, createdAt: Number.POSITIVE_INFINITY }],
    ['unknown host', { ...valid, host: 'vscode-generic' }],
    ['missing host', { ...valid, host: undefined }],
  ])('rejects %s', (_label, input) => {
    expect(parseSubmitDecisionRecordV1(input)).toBeNull();
  });

  it('returns null on malformed JSON instead of throwing — a half-written file must not crash the poller', () => {
    expect(parseSubmitDecisionJsonV1('{"schemaVersion":1,"decisionId"')).toBeNull();
    expect(parseSubmitDecisionJsonV1('')).toBeNull();
    expect(parseSubmitDecisionJsonV1('null')).toBeNull();
  });
});

describe('privacy — the redacted describe must never leak prompt text', () => {
  it('reports a length, never the replacement text itself', () => {
    const d = describeSubmitDecisionSafely(valid);
    expect(d).toEqual({
      decisionId: 'd-1', host: 'windsurf', createdAt: valid.createdAt, replacementLength: valid.replacementText.length,
    });
    expect(JSON.stringify(d)).not.toContain('the picked option');
  });

  it('does not leak even a marker embedded in the text', () => {
    const d = describeSubmitDecisionSafely({ ...valid, replacementText: 'ZZQX_LEAK_MARKER_7741' });
    expect(JSON.stringify(d)).not.toContain('ZZQX_LEAK_MARKER_7741');
  });
});
