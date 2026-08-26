// @vitest-environment jsdom
/**
 * The per-agent inject-back dispatch table (extracted from inject.ts in PB4 so
 * the PE wiring shares it): each known host routes to its own injector, any
 * unknown host degrades to the clipboard fallback — never a silent no-op.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replitMock, boltMock, lovableMock, clipboardMock } = vi.hoisted(() => ({
  replitMock: vi.fn().mockResolvedValue(undefined),
  boltMock: vi.fn().mockResolvedValue(undefined),
  lovableMock: vi.fn().mockResolvedValue(undefined),
  clipboardMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./agents/replit-inject.js', () => ({ injectPromptText: replitMock }));
vi.mock('./agents/bolt-inject.js', () => ({ injectPromptText: boltMock }));
vi.mock('./agents/lovable-inject.js', () => ({ injectPromptText: lovableMock }));
vi.mock('./agents/inject-kit.js', () => ({ clipboardFallback: clipboardMock }));

import { injectPromptText } from './inject-dispatch.js';

function setHostname(hostname: string): void {
  vi.stubGlobal('location', { hostname });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('injectPromptText dispatch', () => {
  const CASES: ReadonlyArray<[string, ReturnType<typeof vi.fn>]> = [
    ['replit.com', replitMock],
    ['bolt.new', boltMock],
    ['lovable.dev', lovableMock],
  ];
  for (const [hostname, mock] of CASES) {
    it(`${hostname} routes to its own injector with the exact text`, async () => {
      setHostname(hostname);
      await injectPromptText('the text');
      expect(mock).toHaveBeenCalledWith('the text');
      expect(clipboardMock).not.toHaveBeenCalled();
    });
  }

  it('an unknown host degrades to the clipboard fallback (never silent)', async () => {
    setHostname('unknown.example.com');
    await injectPromptText('t');
    expect(clipboardMock).toHaveBeenCalledWith('t');
    expect(replitMock).not.toHaveBeenCalled();
    expect(boltMock).not.toHaveBeenCalled();
    expect(lovableMock).not.toHaveBeenCalled();
  });
});
