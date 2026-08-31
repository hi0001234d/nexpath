// @vitest-environment jsdom
/**
 * The WIRE CONTRACT between the inject kit and the page-world bridge.
 *
 * This exists because of a hole found by deleting the two flag lines from
 * `requestMainWorldInject`'s postMessage and re-running the suite: all 1,232
 * tests still passed. The two halves were each well covered and nothing checked
 * the wire between them — the bridge's own tests put the flags into the request
 * themselves, and the kit's tests stub the bridge and never look at the payload.
 * A refactor could therefore have dropped the flags, left CI green, and silently
 * restored the very behaviour they were added to fix.
 *
 * So these tests assert only one thing: what actually goes over postMessage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectViaSimulatedPaste } from './inject-kit.js';

let stopCapture: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  // Needed by the tests where the bridge is SKIPPED and the isolated-world paste
  // chain runs instead; jsdom implements neither of these.
  if (typeof globalThis.DataTransfer === 'undefined') {
    vi.stubGlobal('DataTransfer', class {
      private data = new Map<string, string>();
      setData(format: string, data: string): void { this.data.set(format, data); }
      getData(format: string): string { return this.data.get(format) ?? ''; }
    });
  }
  if (typeof globalThis.ClipboardEvent === 'undefined') {
    vi.stubGlobal('ClipboardEvent', class extends Event {
      clipboardData: unknown;
      constructor(type: string, init: { clipboardData?: unknown } & EventInit = {}) {
        super(type, init);
        this.clipboardData = init.clipboardData;
      }
    });
  }
});

afterEach(() => {
  stopCapture?.();
  stopCapture = null;
});

function makeComposer(): HTMLElement {
  const input = document.createElement('div');
  input.className = 'tiptap ProseMirror';
  document.body.appendChild(input);
  Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
  return input;
}

/**
 * Record every `nexpath:inject-request` that reaches the page, and answer it as
 * a live bridge would so the delivery completes instead of waiting out its
 * timeout.
 */
function captureBridgeRequests(): Array<Record<string, unknown>> {
  const requests: Array<Record<string, unknown>> = [];
  const onMsg = (ev: MessageEvent): void => {
    const m = ev.data as { type?: string; requestId?: string } | null;
    if (m?.type !== 'nexpath:inject-request') return;
    requests.push(m as Record<string, unknown>);
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'nexpath:inject-result', requestId: m.requestId, landed: true },
      source: window as unknown as MessageEventSource,
    }));
  };
  window.addEventListener('message', onMsg);
  stopCapture = () => window.removeEventListener('message', onMsg);
  return requests;
}

describe('inject-kit → page-world bridge: what actually goes over the wire', () => {
  it('⭐ carries BOTH opt-in flags when the caller sets them (Bolt)', async () => {
    makeComposer();
    const requests = captureBridgeRequests();

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'ENHANCED BODY', undefined, {
      useRenderedLandingText: true,
      useDirectInsertFirst: true,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      type: 'nexpath:inject-request',
      selector: '.tiptap.ProseMirror',
      text: 'ENHANCED BODY',
      useRenderedLandingText: true,
      useDirectInsertFirst: true,
    });
  });

  it('carries the read flag alone when only that is set (Replit — its order flag is deliberately off)', async () => {
    makeComposer();
    const requests = captureBridgeRequests();

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'ENHANCED BODY', undefined, {
      useRenderedLandingText: true,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      useRenderedLandingText: true,
      useDirectInsertFirst: false,
    });
  });

  it('carries neither flag when the caller sets no options (Lovable)', async () => {
    makeComposer();
    const requests = captureBridgeRequests();

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'ENHANCED BODY');

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      useRenderedLandingText: false,
      useDirectInsertFirst: false,
      useEditorApiInsert: false,
    });
  });

  it('carries the editor-API flag when the caller sets it (Replit)', async () => {
    makeComposer();
    const requests = captureBridgeRequests();

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'ENHANCED BODY', undefined, {
      useRenderedLandingText: true,
      useEditorApiInsert: true,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      useRenderedLandingText: true,
      useEditorApiInsert: true,
      useDirectInsertFirst: false,
    });
  });
});

/**
 * Whether the bridge is asked AT ALL for a size-limited composer.
 *
 * The bridge is skipped when the body has to be chunked, because the bridge
 * PASTES in one piece and that is exactly what such a composer drops. The
 * editor-API route does not paste, so the skip must not apply to it — and this
 * is load-bearing rather than cosmetic: a real enhanced prompt (2.1-2.5k) is
 * always over the chunk limit, so before this the one site that needs that route
 * never reached it on a single real delivery.
 */
describe('the chunked bridge skip', () => {
  const OVER_LIMIT = 'x'.repeat(2_500);

  it('⭐ no longer applies when the editor-API route is requested', async () => {
    makeComposer();
    const requests = captureBridgeRequests();

    await injectViaSimulatedPaste('.tiptap.ProseMirror', OVER_LIMIT, undefined, {
      pasteChunkChars: 800,
      useRenderedLandingText: true,
      useEditorApiInsert: true,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ text: OVER_LIMIT, useEditorApiInsert: true });
  });

  it('⭐ tells the bridge the body is OVER the limit — losing this re-opens the composer wipe', async () => {
    // The bridge reads this to decide whether it may fall back to a whole-body
    // paste. Read as false for an over-limit body it would attempt exactly the
    // paste this composer drops, after a select-all — deleting the user's own
    // prompt and putting nothing in its place.
    makeComposer();
    const requests = captureBridgeRequests();

    await injectViaSimulatedPaste('.tiptap.ProseMirror', OVER_LIMIT, undefined, {
      pasteChunkChars: 800,
      useRenderedLandingText: true,
      useEditorApiInsert: true,
    });

    expect(requests[0]).toMatchObject({ bodyExceedsPasteLimit: true });
  });

  it('and tells it the opposite for a body within the limit', async () => {
    makeComposer();
    const requests = captureBridgeRequests();

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'short body', undefined, {
      pasteChunkChars: 800,
      useRenderedLandingText: true,
      useEditorApiInsert: true,
    });

    expect(requests[0]).toMatchObject({ bodyExceedsPasteLimit: false });
  });

  it('still applies without that route — the shipped skip is untouched', async () => {
    // Fake timers: with the bridge skipped this runs the whole isolated-world
    // chain, whose landing budgets are sized in seconds.
    vi.useFakeTimers();
    try {
      makeComposer();
      const requests = captureBridgeRequests();

      const done = injectViaSimulatedPaste('.tiptap.ProseMirror', OVER_LIMIT, undefined, {
        pasteChunkChars: 800,
        useRenderedLandingText: true,
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await done;

      expect(requests).toEqual([]);   // the bridge was never asked
    } finally {
      vi.useRealTimers();
    }
  });

  it('a body UNDER the limit reaches the bridge either way', async () => {
    makeComposer();
    const requests = captureBridgeRequests();

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'short body', undefined, {
      pasteChunkChars: 800,
      useRenderedLandingText: true,
    });

    expect(requests).toHaveLength(1);
  });
});
