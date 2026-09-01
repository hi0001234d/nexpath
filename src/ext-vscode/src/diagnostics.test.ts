import { describe, it, expect } from 'vitest';
import { toSafeErrorRecord } from './diagnostics.js';

// BUG-AR9-G1 vector 4 (`diagnostic_error_object_leak`). The Stop-hook
// `reason` / IPC stdout body is delivery-only: it may travel that channel to be
// delivered, but must never be copied into a log or error payload. These tests
// pin the redaction, using a distinctive marker that stands in for a delivered
// prompt-enhancement body.

const BODY = 'SENSITIVE_PE_BODY_MARKER';

describe('toSafeErrorRecord', () => {
  it('keeps name, message and errno code', () => {
    const err = Object.assign(new Error('spawn nexpath ENOENT'), { code: 'ENOENT' });
    expect(toSafeErrorRecord(err)).toEqual({
      name: 'Error',
      message: 'spawn nexpath ENOENT',
      code: 'ENOENT',
      causeChainDepth: 0,
    });
  });

  it('drops the stack', () => {
    const err = new Error('boom');
    const record = toSafeErrorRecord(err);
    expect(record).not.toHaveProperty('stack');
    expect(JSON.stringify(record)).not.toContain('at ');
  });

  it('drops a payload-bearing cause chain but records its depth', () => {
    const root = new Error(`stop stdout was ${BODY}`);
    const mid = new Error('parse failed', { cause: root });
    const top = new Error('delivery failed', { cause: mid });

    const record = toSafeErrorRecord(top);

    expect(record.causeChainDepth).toBe(2);
    expect(JSON.stringify(record)).not.toContain(BODY);
  });

  it('drops arbitrary properties an upstream layer attached', () => {
    const err = Object.assign(new Error('transport failed'), {
      rawStdout: `{"decision":"block","reason":"${BODY}"}`,
      prompt: BODY,
    });

    const record = toSafeErrorRecord(err);

    expect(record).not.toHaveProperty('rawStdout');
    expect(record).not.toHaveProperty('prompt');
    expect(JSON.stringify(record)).not.toContain(BODY);
  });

  it('is always JSON-serializable, even for a self-referential cause', () => {
    const err = new Error('cyclic');
    (err as { cause?: unknown }).cause = err;

    const record = toSafeErrorRecord(err);

    expect(() => JSON.stringify(record)).not.toThrow();
    expect(record.causeChainDepth).toBe(0);
  });

  it('terminates on a long cause chain rather than walking it forever', () => {
    let err = new Error('leaf');
    for (let i = 0; i < 50; i += 1) err = new Error(`link-${i}`, { cause: err });

    const record = toSafeErrorRecord(err);

    expect(record.causeChainDepth).toBeLessThanOrEqual(16);
  });

  it('handles non-Error throws', () => {
    expect(toSafeErrorRecord('plain string')).toEqual({
      name: 'NonError',
      message: 'plain string',
      causeChainDepth: 0,
    });
  });

  it('survives a value whose toString throws', () => {
    const hostile = { toString(): string { throw new Error('nope'); } };
    expect(() => toSafeErrorRecord(hostile)).not.toThrow();
    expect(toSafeErrorRecord(hostile).message).toBe('[unstringifiable value]');
  });

  it('omits a non-string code rather than passing it through', () => {
    const err = Object.assign(new Error('odd'), { code: { nested: BODY } });
    const record = toSafeErrorRecord(err);
    expect(record).not.toHaveProperty('code');
    expect(JSON.stringify(record)).not.toContain(BODY);
  });
});
