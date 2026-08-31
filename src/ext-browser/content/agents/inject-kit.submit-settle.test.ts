// @vitest-environment jsdom
/**
 * The post-insert settle, and the delivery outcome the kit now reports.
 *
 * With the insertion itself measured in single-digit milliseconds, the flat
 * `await sleep(SUBMIT_SETTLE_MS)` between pressing Enter and the button fallback
 * was the largest remaining cost on every delivery — paid in full even when the
 * site had cleared its composer within a frame.
 *
 * Two things are pinned here, and the second is why polling is SAFER than the
 * single read it replaces rather than only faster:
 *
 *   1. The settle ends as soon as the composer is observed clear.
 *   2. It takes TWO CONSECUTIVE clear reads to end it. A rich editor can report
 *      empty for one frame mid-reconcile; acting on that skips the button
 *      fallback and the prompt is never sent. The flat sleep sampled once, at
 *      the ceiling, with no second look.
 *
 * And the ceiling itself is unchanged: a composer that still holds the text at
 * `SUBMIT_SETTLE_MS` reaches the button exactly as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectViaSimulatedPaste } from './inject-kit.js';

let removeBridge: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
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
  removeBridge?.();
  removeBridge = null;
  vi.useRealTimers();
});

const BODY = 'ENHANCED BODY';

/**
 * A composer whose readable text is driven by a callback, so a test can model
 * what the editor reports on each individual read. Both reads the kit can make
 * (`innerText`, then `textContent`) are driven from the same source, so a
 * "cleared" read really is cleared.
 */
function makeComposer(read: () => string): HTMLElement {
  const input = document.createElement('div');
  input.className = 'tiptap ProseMirror';
  document.body.appendChild(input);
  Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
  Object.defineProperty(input, 'innerText', { configurable: true, get: read });
  Object.defineProperty(input, 'textContent', { configurable: true, get: read });
  return input;
}

/** Answer the page-world bridge as a live one would: the text landed. */
function stubBridgeAsLanded(): void {
  const onMsg = (ev: MessageEvent): void => {
    const m = ev.data as { type?: string; requestId?: string };
    if (m?.type !== 'nexpath:inject-request') return;
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'nexpath:inject-result', requestId: m.requestId, landed: true },
      source: window as unknown as MessageEventSource,
    }));
  };
  window.addEventListener('message', onMsg);
  removeBridge = () => window.removeEventListener('message', onMsg);
}

function makeButton(): ReturnType<typeof vi.fn> {
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Send message');
  const clicked = vi.fn();
  button.addEventListener('click', clicked);
  document.body.appendChild(button);
  return clicked;
}

const SEND = 'button[aria-label="Send message"]';

describe('the settle is a ceiling, not a sleep', () => {
  it('⭐ resolves as soon as the site clears the composer, not after the full settle', async () => {
    vi.useFakeTimers();
    let sent = false;
    makeComposer(() => (sent ? '' : BODY));
    makeButton();
    stubBridgeAsLanded();
    // The site submits on the synthetic Enter, as all three agents do.
    document.querySelector('.tiptap.ProseMirror')!
      .addEventListener('keydown', (ev) => { if ((ev as KeyboardEvent).key === 'Enter') sent = true; });

    let settled = false;
    const done = injectViaSimulatedPaste('.tiptap.ProseMirror', BODY, SEND, {
      useRenderedLandingText: true,
    }).then(() => { settled = true; });

    // Two poll intervals is all a cleared composer needs. Under the flat sleep
    // this was still pending here.
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
    await done;
  });

  it('still waits the FULL settle before the button fallback when Enter does not submit', async () => {
    vi.useFakeTimers();
    makeComposer(() => BODY);            // the text never leaves
    const clicked = makeButton();
    stubBridgeAsLanded();

    const done = injectViaSimulatedPaste('.tiptap.ProseMirror', BODY, SEND, {
      useRenderedLandingText: true,
    });

    await vi.advanceTimersByTimeAsync(700);
    expect(clicked).not.toHaveBeenCalled();     // the ceiling is unchanged
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('⭐ a site that clears in the LAST poll window is not double-submitted', async () => {
    // The two-read rule exists to end the settle EARLY. At the ceiling the
    // shipped rule stands: the flat sleep took ONE reading here and returned if
    // the composer was clear. A site that clears inside the final window yields
    // a single clear read — refusing it would fire the button fallback on a
    // prompt that has already been sent.
    vi.useFakeTimers();
    const clearAt = Date.now() + 780;             // between the 15th and 16th poll
    makeComposer(() => (Date.now() >= clearAt ? '' : BODY));
    const clicked = makeButton();
    stubBridgeAsLanded();

    const done = injectViaSimulatedPaste('.tiptap.ProseMirror', BODY, SEND, {
      useRenderedLandingText: true,
    });
    await vi.advanceTimersByTimeAsync(1_500);
    await done;

    expect(clicked).not.toHaveBeenCalled();
  });

  it('⭐ a SINGLE transient clear does not end the settle — the button fallback still fires', async () => {
    vi.useFakeTimers();
    // Empty on exactly one read, as an editor mid-reconcile reports. Acting on
    // that would skip the button and the prompt would never be sent.
    let reads = 0;
    makeComposer(() => (++reads === 2 ? '' : BODY));
    const clicked = makeButton();
    stubBridgeAsLanded();

    const done = injectViaSimulatedPaste('.tiptap.ProseMirror', BODY, SEND, {
      useRenderedLandingText: true,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await done;

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(reads).toBeGreaterThan(3);          // it kept looking after the blip
  });
});

describe('the kit reports whether it actually delivered', () => {
  it('⭐ returns TRUE when the text was delivered', async () => {
    makeComposer(() => BODY);
    stubBridgeAsLanded();

    const delivered = await injectViaSimulatedPaste('.tiptap.ProseMirror', BODY, undefined, {
      useRenderedLandingText: true,
    });

    expect(delivered).toBe(true);
  });

  it('⭐ returns FALSE when it degraded to the clipboard — the gate no longer has to guess', async () => {
    vi.useFakeTimers();
    makeComposer(() => '');              // nothing ever lands
    // No bridge: the whole chain runs and ends at the clipboard fallback.

    const run = injectViaSimulatedPaste('.tiptap.ProseMirror', BODY, undefined, {
      useRenderedLandingText: true,
    });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await run).toBe(false);
  });

  it('returns FALSE when no composer matched at all', async () => {
    expect(await injectViaSimulatedPaste('.no-such-composer', BODY)).toBe(false);
  });

  it('returns FALSE for blank text, and still leaves the composer untouched', async () => {
    const input = makeComposer(() => 'the user was still typing this');
    expect(await injectViaSimulatedPaste('.tiptap.ProseMirror', '  \n ')).toBe(false);
    expect(input.textContent).toBe('the user was still typing this');
  });
});
