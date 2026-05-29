import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatEventHandler } from './chat-pipeline.js';
import type { ChatHistoryEvent } from './chat-history-types.js';
import type { DecisionSessionPayload } from './ipc.js';

const makeEvent = (overrides: Partial<ChatHistoryEvent> = {}): ChatHistoryEvent => ({
  prompt: 'hello world',
  rawSessionId: 'tab:abc-123',
  capturedAt: new Date(0),
  sourcePath: '/fake/state.vscdb',
  extractorId: 'cursor-v2025-q2',
  ...overrides,
});

const fakePayload: DecisionSessionPayload = {
  advisory: 'Consider clarifying scope.',
  options: [{ id: 'a', label: 'Refine the request' }],
};

describe('createChatEventHandler', () => {
  let spawnAuto: ReturnType<typeof vi.fn>;
  let spawnStop: ReturnType<typeof vi.fn>;
  let publishPayload: ReturnType<typeof vi.fn>;
  let errorLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spawnAuto = vi.fn().mockResolvedValue(undefined);
    spawnStop = vi.fn().mockResolvedValue(null);
    publishPayload = vi.fn();
    errorLog = vi.fn();
  });

  it('happy path: spawnAuto → spawnStop → publishPayload (when payload non-null)', async () => {
    spawnStop.mockResolvedValueOnce(fakePayload);
    const handler = createChatEventHandler({
      spawnAuto,
      spawnStop,
      publishPayload,
      logger: { error: errorLog },
    });
    const event = makeEvent();
    await handler(event);
    expect(spawnAuto).toHaveBeenCalledWith('hello world', 'tab:abc-123', event);
    expect(spawnStop).toHaveBeenCalledWith('tab:abc-123', event);
    expect(publishPayload).toHaveBeenCalledWith(fakePayload);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('skips publishPayload when spawnStop returns null', async () => {
    spawnStop.mockResolvedValueOnce(null);
    const handler = createChatEventHandler({
      spawnAuto,
      spawnStop,
      publishPayload,
      logger: { error: errorLog },
    });
    await handler(makeEvent());
    expect(spawnAuto).toHaveBeenCalledOnce();
    expect(spawnStop).toHaveBeenCalledOnce();
    expect(publishPayload).not.toHaveBeenCalled();
  });

  it('uses composeSessionId to derive the session id (workspace-prefixed)', async () => {
    spawnStop.mockResolvedValueOnce(fakePayload);
    const compose = vi.fn((e: ChatHistoryEvent) => `ws-X|${e.rawSessionId}`);
    const handler = createChatEventHandler({
      spawnAuto,
      spawnStop,
      publishPayload,
      composeSessionId: compose,
      logger: { error: errorLog },
    });
    const event = makeEvent();
    await handler(event);
    expect(compose).toHaveBeenCalledOnce();
    expect(spawnAuto).toHaveBeenCalledWith(
      'hello world',
      'ws-X|tab:abc-123',
      event,
    );
    expect(spawnStop).toHaveBeenCalledWith('ws-X|tab:abc-123', event);
  });

  it('forwards the originating ChatHistoryEvent so callers can derive per-event cwd', async () => {
    // Multi-workspace R4.3 regression guard. If two extension instances
    // ever watch the same db, each must be able to attribute the prompt
    // to the source workspace via event.sourcePath — not to its own cwd.
    spawnStop.mockResolvedValueOnce(fakePayload);
    const handler = createChatEventHandler({
      spawnAuto,
      spawnStop,
      publishPayload,
      logger: { error: errorLog },
    });
    const event = makeEvent({
      sourcePath: '/home/u/.config/Cursor/User/workspaceStorage/abc/state.vscdb',
    });
    await handler(event);
    const autoCallEvent = spawnAuto.mock.calls[0][2] as ChatHistoryEvent;
    const stopCallEvent = spawnStop.mock.calls[0][1] as ChatHistoryEvent;
    expect(autoCallEvent.sourcePath).toBe(event.sourcePath);
    expect(stopCallEvent.sourcePath).toBe(event.sourcePath);
  });

  it('logs and returns early when spawnAuto rejects (no stop, no publish)', async () => {
    spawnAuto.mockRejectedValueOnce(new Error('auto blew up'));
    const handler = createChatEventHandler({
      spawnAuto,
      spawnStop,
      publishPayload,
      logger: { error: errorLog },
    });
    await handler(makeEvent());
    expect(spawnAuto).toHaveBeenCalledOnce();
    expect(spawnStop).not.toHaveBeenCalled();
    expect(publishPayload).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      '[nexpath] spawnAuto failed:',
      expect.any(Error),
    );
  });

  it('logs and returns early when spawnStop rejects (no publish)', async () => {
    spawnStop.mockRejectedValueOnce(new Error('stop blew up'));
    const handler = createChatEventHandler({
      spawnAuto,
      spawnStop,
      publishPayload,
      logger: { error: errorLog },
    });
    await handler(makeEvent());
    expect(spawnAuto).toHaveBeenCalledOnce();
    expect(spawnStop).toHaveBeenCalledOnce();
    expect(publishPayload).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      '[nexpath] spawnStop failed:',
      expect.any(Error),
    );
  });

  it('logs and swallows when publishPayload throws (does not propagate to watcher)', async () => {
    spawnStop.mockResolvedValueOnce(fakePayload);
    publishPayload.mockImplementationOnce(() => {
      throw new Error('publish blew up');
    });
    const handler = createChatEventHandler({
      spawnAuto,
      spawnStop,
      publishPayload,
      logger: { error: errorLog },
    });
    await expect(handler(makeEvent())).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      '[nexpath] publishPayload failed:',
      expect.any(Error),
    );
  });

  it('handler always resolves — never propagates exceptions to the watcher', async () => {
    spawnAuto.mockRejectedValueOnce(new Error('a'));
    spawnStop.mockRejectedValueOnce(new Error('b'));
    publishPayload.mockImplementationOnce(() => {
      throw new Error('c');
    });
    const handler = createChatEventHandler({
      spawnAuto,
      spawnStop,
      publishPayload,
      logger: { error: errorLog },
    });
    await expect(handler(makeEvent())).resolves.toBeUndefined();
  });
});
