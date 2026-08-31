// @vitest-environment jsdom
/**
 * The multi-line landing defect, driven through the REAL inject kit.
 *
 * Team-lead report 2026-08-27: on Bolt and Replit the enhanced prompt took ~20 s
 * to appear and then the user's ORIGINAL prompt was sent instead. Root cause:
 * the landing check read the composer with `textContent`, which runs a
 * multi-line prompt's block elements together with NO separator, so a prompt
 * that had arrived intact was judged missing — burning both landing budgets and
 * degrading to the clipboard fallback, after which the gate released the
 * original.
 *
 * These tests drive `injectViaSimulatedPaste` against a composer shaped like the
 * real ones (one block element per line) and pin BOTH halves of the gate:
 * opted in (Bolt, Replit) the landed text is recognised; left out (Lovable) the
 * shipped behaviour is preserved exactly, byte for byte.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectViaSimulatedPaste } from './inject-kit.js';
import { hasTextLanded, readLandingText } from './landing-check.js';

const MULTILINE = [
  'Scope:',
  '- Export a single invoice to PDF',
  '',
  'Acceptance criteria:',
  '1. The export button appears on the invoice detail page',
].join('\n');

let writeText: ReturnType<typeof vi.fn>;
let removeBridge: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  // jsdom implements neither DataTransfer nor ClipboardEvent.
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

/**
 * Give an element the `innerText` a browser would compute: block children joined
 * by newlines. jsdom does not implement it at all, so without this the reader
 * would silently take its `textContent` fallback and prove nothing.
 */
function withBrowserInnerText(el: HTMLElement): HTMLElement {
  Object.defineProperty(el, 'innerText', {
    configurable: true,
    get: () => Array.from(el.querySelectorAll('p'), (p) => p.textContent ?? '').join('\n'),
  });
  return el;
}

/** A composer that turns a paste into one block element per line. */
function makeBlockComposer(accept: 'all' | 'first-line-only' = 'all'): HTMLElement {
  const input = withBrowserInnerText(document.createElement('div'));
  input.className = 'tiptap ProseMirror';
  document.body.appendChild(input);
  Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
  input.addEventListener('paste', (ev) => {
    const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
    const pasted = dt ? dt.getData('text/plain') : '';
    const lines = accept === 'all' ? pasted.split('\n') : [pasted.split('\n')[0] ?? ''];
    input.replaceChildren();
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      input.appendChild(p);
    }
  });
  return input;
}

/** Answer the page-world bridge the way a page with no live bridge would. */
function stubBridgeAsUnavailable(): void {
  const onMsg = (ev: MessageEvent): void => {
    const m = ev.data as { type?: string; requestId?: string };
    if (m?.type !== 'nexpath:inject-request') return;
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'nexpath:inject-result', requestId: m.requestId, landed: false },
      source: window as unknown as MessageEventSource,
    }));
  };
  window.addEventListener('message', onMsg);
  removeBridge = () => window.removeEventListener('message', onMsg);
}

describe('the defect is in the READ, not in the delivery', () => {
  it('same composer, same landed text: the raw read says no, the rendered read says yes', () => {
    const input = makeBlockComposer();
    for (const line of MULTILINE.split('\n')) {
      const p = document.createElement('p');
      p.textContent = line;
      input.appendChild(p);
    }
    // Every word is present, in order, correct — and the raw read still fails,
    // because nothing separates one block from the next.
    expect(hasTextLanded(input.textContent ?? '', MULTILINE)).toBe(false);
    expect(hasTextLanded(readLandingText(input), MULTILINE)).toBe(true);
  });
});

describe('injectViaSimulatedPaste — useRenderedLandingText', () => {
  it('OPTED IN (Bolt/Replit): a multi-line prompt that landed is recognised, and submitted', async () => {
    vi.useFakeTimers();
    const input = makeBlockComposer();
    const keys: string[] = [];
    input.addEventListener('keydown', (e) => { keys.push((e as KeyboardEvent).key); });
    stubBridgeAsUnavailable();

    const done = injectViaSimulatedPaste('.tiptap.ProseMirror', MULTILINE, undefined, {
      useRenderedLandingText: true,
    });
    await vi.advanceTimersByTimeAsync(4_000);
    await done;

    // The text is in the composer, one block per line...
    expect(input.querySelectorAll('p').length).toBe(MULTILINE.split('\n').length);
    // ...and the kit agreed, so it submitted rather than degrading.
    expect(keys).toContain('Enter');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('LEFT OUT (Lovable): unchanged — the raw read still decides, and still degrades', async () => {
    vi.useFakeTimers();
    const input = makeBlockComposer();
    stubBridgeAsUnavailable();

    // No options at all: exactly how lovable-inject.ts calls this kit today.
    const done = injectViaSimulatedPaste('.tiptap.ProseMirror', MULTILINE);
    await vi.advanceTimersByTimeAsync(30_000);
    await done;

    // Shipped behaviour, preserved on purpose: the text IS in the composer, the
    // raw read cannot see it, and the kit degrades to the clipboard. Lovable is
    // migrated in its own change, not this one.
    expect(input.querySelectorAll('p').length).toBeGreaterThan(1);
    expect(writeText).toHaveBeenCalledWith(MULTILINE);
  });

  it('OPTED IN does not weaken the guard: a partial insert still degrades', async () => {
    vi.useFakeTimers();
    const input = makeBlockComposer('first-line-only');
    stubBridgeAsUnavailable();

    const done = injectViaSimulatedPaste('.tiptap.ProseMirror', MULTILINE, undefined, {
      useRenderedLandingText: true,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await done;

    expect(writeText).toHaveBeenCalledWith(MULTILINE);
  });

  it('OPTED IN still refuses blank text — the composer is left untouched', async () => {
    const input = makeBlockComposer();
    const p = document.createElement('p');
    p.textContent = 'the user was still typing this';
    input.appendChild(p);

    await injectViaSimulatedPaste('.tiptap.ProseMirror', '   \n  ', undefined, {
      useRenderedLandingText: true,
    });

    expect(input.textContent).toBe('the user was still typing this');
    expect(writeText).not.toHaveBeenCalled();
  });
});
