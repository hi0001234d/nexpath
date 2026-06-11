import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdvisoryFallback,
  toPayload,
  STATUS_BAR_TEXT,
  type StatusBarHandle,
} from './advisory-fallback.js';
import type { StoredAdvisory } from './advisory-store-reader.js';

const advisory = (overrides: Partial<StoredAdvisory> = {}): StoredAdvisory => ({
  projectRoot: '/proj',
  stage: 'implementation',
  flagType: 'stage_transition',
  pinchLabel: 'Quick check.',
  createdAt: 1000,
  status: 'shown',
  l1: ['Full: run the suite'],
  l2: ['Lighter: run changed tests'],
  l3: ['Min: smoke test'],
  ...overrides,
});

describe('toPayload', () => {
  it('maps L1 (full-depth) options to a webview payload', () => {
    expect(toPayload(advisory())).toEqual({
      advisory: 'Quick check.',
      options: [{ id: '0', label: 'Full: run the suite' }],
    });
  });
  it('falls back to L2 then L3 when earlier levels are empty', () => {
    expect(toPayload(advisory({ l1: [], l2: ['l2a', 'l2b'], l3: [] })).options).toEqual([
      { id: '0', label: 'l2a' },
      { id: '1', label: 'l2b' },
    ]);
    expect(toPayload(advisory({ l1: [], l2: [], l3: ['l3a'] })).options).toEqual([
      { id: '0', label: 'l3a' },
    ]);
  });
  it('uses a generic headline when pinchLabel is empty', () => {
    expect(toPayload(advisory({ pinchLabel: '' })).advisory).toBe('Nexpath advisory');
  });
});

describe('createAdvisoryFallback', () => {
  let statusBar: StatusBarHandle & { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
  let publishPayload: ReturnType<typeof vi.fn>;
  let showInfoOnce: ReturnType<typeof vi.fn>;
  let read: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    statusBar = { show: vi.fn(), hide: vi.fn() };
    publishPayload = vi.fn();
    showInfoOnce = vi.fn();
    read = vi.fn();
  });

  it('lights the status bar + first-time hint when a fresh advisory exists', async () => {
    read.mockResolvedValue(advisory({ createdAt: 5000 }));
    const fb = createAdvisoryFallback({
      publishPayload, statusBar, showInfoOnce, read,
      now: () => 6000, recentWindowMs: 60_000,
    });
    await fb.armIfPending('/proj');
    expect(statusBar.show).toHaveBeenCalledWith(STATUS_BAR_TEXT, expect.stringContaining('Quick check.'));
    expect(showInfoOnce).toHaveBeenCalledOnce();
  });

  it('does NOT surface when there is no advisory', async () => {
    read.mockResolvedValue(null);
    const fb = createAdvisoryFallback({ publishPayload, statusBar, showInfoOnce, read });
    await fb.armIfPending('/proj');
    expect(statusBar.show).not.toHaveBeenCalled();
    expect(showInfoOnce).not.toHaveBeenCalled();
  });

  it('does NOT surface a stale advisory (older than the recency window)', async () => {
    read.mockResolvedValue(advisory({ createdAt: 1000 }));
    const fb = createAdvisoryFallback({
      publishPayload, statusBar, showInfoOnce, read,
      now: () => 1_000_000, recentWindowMs: 60_000,
    });
    await fb.armIfPending('/proj');
    expect(statusBar.show).not.toHaveBeenCalled();
  });

  it('shows the first-time hint only once', async () => {
    read.mockResolvedValue(advisory({ createdAt: 5000 }));
    const fb = createAdvisoryFallback({
      publishPayload, statusBar, showInfoOnce, read, now: () => 6000,
    });
    await fb.armIfPending('/proj');
    await fb.armIfPending('/proj');
    expect(showInfoOnce).toHaveBeenCalledOnce();
    expect(statusBar.show).toHaveBeenCalledTimes(2);
  });

  it('never throws when the reader rejects', async () => {
    read.mockRejectedValue(new Error('db gone'));
    const fb = createAdvisoryFallback({ publishPayload, statusBar, read });
    await expect(fb.armIfPending('/proj')).resolves.toBeUndefined();
    expect(statusBar.show).not.toHaveBeenCalled();
  });

  it('clear() hides the status bar', () => {
    const fb = createAdvisoryFallback({ publishPayload, statusBar, read });
    fb.clear();
    expect(statusBar.hide).toHaveBeenCalledOnce();
  });

  it('showAdvisory() publishes the waiting advisory to the webview and hides the status bar', async () => {
    read.mockResolvedValue(advisory({ createdAt: 5000 }));
    const fb = createAdvisoryFallback({ publishPayload, statusBar, read, now: () => 6000 });
    await fb.armIfPending('/proj'); // arms pendingProject
    await fb.showAdvisory();
    expect(publishPayload).toHaveBeenCalledWith(toPayload(advisory({ createdAt: 5000 })));
    expect(statusBar.hide).toHaveBeenCalled();
  });

  it('showAdvisory() is a no-op when nothing is pending', async () => {
    const fb = createAdvisoryFallback({ publishPayload, statusBar, read });
    await fb.showAdvisory();
    expect(read).not.toHaveBeenCalled();
    expect(publishPayload).not.toHaveBeenCalled();
  });

  it('showAdvisory() hides the status bar if the advisory vanished from the store', async () => {
    read.mockResolvedValueOnce(advisory({ createdAt: 5000 })); // arm
    read.mockResolvedValueOnce(null);                          // gone by the time we open it
    const fb = createAdvisoryFallback({ publishPayload, statusBar, read, now: () => 6000 });
    await fb.armIfPending('/proj');
    await fb.showAdvisory();
    expect(publishPayload).not.toHaveBeenCalled();
    expect(statusBar.hide).toHaveBeenCalled();
  });
});
