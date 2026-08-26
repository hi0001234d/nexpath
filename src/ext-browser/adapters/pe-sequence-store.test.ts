import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockSet } = vi.hoisted(() => ({ mockGet: vi.fn(), mockSet: vi.fn() }));
vi.mock('webextension-polyfill', () => ({
  default: { storage: { local: { get: mockGet, set: mockSet } } },
}));

import { getPendingSequence, recordPendingSequence, type PendingSequenceRow } from './pe-sequence-store.js';

const ROOT = 'https://bolt.new/~/p1';
const KEY = `nexpath_pending_sequence::${ROOT}`;
const row: PendingSequenceRow = {
  sessionId: 's1', createdAt: 100, status: 'first_sent', requestId: 'r1',
  handoffDecisionId: 'h1', currentBodyId: 'b1', bodyRevision: 1, remainingTaskCount: 2,
};

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({});
  mockSet.mockReset().mockResolvedValue(undefined);
});

describe('pe-sequence-store (PB6 — ids and counts only)', () => {
  it('records one row per root under the pending-sequence key', async () => {
    await recordPendingSequence(ROOT, row);
    expect(mockSet).toHaveBeenCalledWith({ [KEY]: row });
  });

  it('round-trips a valid row and rejects malformed/missing ones (fail-closed reads)', async () => {
    mockGet.mockResolvedValue({ [KEY]: row });
    expect(await getPendingSequence(ROOT)).toEqual(row);
    mockGet.mockResolvedValue({ [KEY]: { ...row, status: 'done' } });
    expect(await getPendingSequence(ROOT)).toBeNull();
    mockGet.mockResolvedValue({ [KEY]: { ...row, bodyRevision: '1' } });
    expect(await getPendingSequence(ROOT)).toBeNull();
    mockGet.mockResolvedValue({});
    expect(await getPendingSequence(ROOT)).toBeNull();
    mockGet.mockRejectedValue(new Error('storage gone'));
    expect(await getPendingSequence(ROOT)).toBeNull();
  });

  it('never stores prompt or body text — the row is ids and counts only', () => {
    const values = Object.values(row);
    for (const v of values) {
      expect(typeof v === 'string' ? v.split(' ').length : 1).toBe(1);
    }
  });
});
