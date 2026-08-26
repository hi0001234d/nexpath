import { beforeEach, describe, expect, it, vi } from 'vitest';

// storage.local mock (established pattern — the real polyfill refuses non-extension contexts).
const { mockGet, mockSet } = vi.hoisted(() => ({ mockGet: vi.fn(), mockSet: vi.fn() }));
vi.mock('webextension-polyfill', () => ({
  default: { storage: { local: { get: mockGet, set: mockSet } } },
}));

// The engine validators are the engine's own tested surface; here they are
// controllable so the STORE's fail-closed posture is what gets exercised.
const { mockValidateReq, mockValidateRes } = vi.hoisted(() => ({
  mockValidateReq: vi.fn(),
  mockValidateRes: vi.fn(),
}));
vi.mock('../background/pe-engine.js', () => ({
  validatePromptEnhancementPrepareRequestV1: mockValidateReq,
  validatePromptEnhancementPrepareResultV1: mockValidateRes,
}));

import {
  getPendingPe,
  markPendingPeShown,
  pendingPeKey,
  upsertPendingPe,
  type PendingPeRecord,
} from './pe-pending-store.js';
import type {
  PromptEnhancementPrepareRequestV1,
  PromptEnhancementPrepareResultV1,
} from '../../prompt-enhancement/contracts.js';

const ROOT = 'https://bolt.new/~/sb1-test';
const request = { requestId: 'req-1' } as unknown as PromptEnhancementPrepareRequestV1;
const result = { enhancementId: 'enh-1' } as unknown as PromptEnhancementPrepareResultV1;

const baseRecord = (): PendingPeRecord => ({
  sessionId: 'sess-1',
  promptCount: 4,
  status: 'pending',
  createdAt: 111,
  request,
  result,
});

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset().mockResolvedValue(undefined);
  mockValidateReq.mockReset().mockReturnValue({ ok: true, reasonCodes: [] });
  mockValidateRes.mockReset().mockReturnValue({ ok: true, reasonCodes: [] });
});

describe('pe-pending-store', () => {
  it('upsert writes one replaceable row under the project-scoped key', async () => {
    await upsertPendingPe(ROOT, { sessionId: 'sess-1', promptCount: 4, request, result, now: 111 });
    expect(mockSet).toHaveBeenCalledWith({ [pendingPeKey(ROOT)]: baseRecord() });
    expect(pendingPeKey(ROOT)).toBe(`nexpath_pending_pe::${ROOT}`);
  });

  it('get round-trips a valid pending row', async () => {
    mockGet.mockResolvedValue({ [pendingPeKey(ROOT)]: baseRecord() });
    const rec = await getPendingPe(ROOT, 'sess-1');
    expect(rec?.promptCount).toBe(4);
  });

  it('is session-scoped: a row from another session reads as absent', async () => {
    mockGet.mockResolvedValue({ [pendingPeKey(ROOT)]: baseRecord() });
    expect(await getPendingPe(ROOT, 'sess-OTHER')).toBeNull();
  });

  it('a consumed (shown) row reads as absent', async () => {
    mockGet.mockResolvedValue({ [pendingPeKey(ROOT)]: { ...baseRecord(), status: 'shown' } });
    expect(await getPendingPe(ROOT, 'sess-1')).toBeNull();
  });

  it('fails closed on structural corruption', async () => {
    mockGet.mockResolvedValue({ [pendingPeKey(ROOT)]: { ...baseRecord(), promptCount: 'four' } });
    expect(await getPendingPe(ROOT, 'sess-1')).toBeNull();
    mockGet.mockResolvedValue({ [pendingPeKey(ROOT)]: 'not-an-object' });
    expect(await getPendingPe(ROOT, 'sess-1')).toBeNull();
  });

  it('fails closed when either engine validator rejects the stored payload', async () => {
    mockGet.mockResolvedValue({ [pendingPeKey(ROOT)]: baseRecord() });
    mockValidateReq.mockReturnValue({ ok: false, reasonCodes: ['bad'] });
    expect(await getPendingPe(ROOT, 'sess-1')).toBeNull();
    mockValidateReq.mockReturnValue({ ok: true, reasonCodes: [] });
    mockValidateRes.mockReturnValue({ ok: false, reasonCodes: ['bad'] });
    expect(await getPendingPe(ROOT, 'sess-1')).toBeNull();
  });

  it('a storage read failure reads as absent (fail-open for the pipeline)', async () => {
    mockGet.mockRejectedValue(new Error('storage gone'));
    expect(await getPendingPe(ROOT, 'sess-1')).toBeNull();
  });

  it('markShown flips status in place so a stop re-fire cannot re-show', async () => {
    mockGet.mockResolvedValue({ [pendingPeKey(ROOT)]: baseRecord() });
    await markPendingPeShown(ROOT);
    expect(mockSet).toHaveBeenCalledWith({ [pendingPeKey(ROOT)]: { ...baseRecord(), status: 'shown' } });
  });

  it('markShown on an absent row is a safe no-op', async () => {
    mockGet.mockResolvedValue({});
    await markPendingPeShown(ROOT);
    expect(mockSet).not.toHaveBeenCalled();
  });
});
