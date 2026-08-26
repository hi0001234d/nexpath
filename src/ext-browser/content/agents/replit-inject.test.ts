// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectPromptText } from './replit-inject.js';

describe('replit-inject.ts — injectPromptText', () => {
  let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

  function makeInput(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'cm-content';
    el.setAttribute('contenteditable', 'true');
    document.body.appendChild(el);
    return el;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteTextMock },
      configurable: true,
    });

    // jsdom does not implement DataTransfer at all — this is a real gap in the test
    // environment (not a test bug), consistent with the rest of this session's finding
    // that real-browser paste/editor behaviour can't be fully verified outside Chrome.
    // Minimal stub lets us exercise this function's own logic (landed vs not-landed
    // detection, fallback triggering) — it does NOT prove Replit's real CodeMirror
    // instance accepts a synthetic paste the same way; that still needs a live test.
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

  it('falls back to clipboard immediately when the input element is not found', async () => {
    await injectPromptText('write a test');
    expect(clipboardWriteTextMock).toHaveBeenCalledWith('write a test');
  });

  it('dispatches a paste event and does not fall back when the editor updates its content', async () => {
    const input = makeInput();
    // Simulates CodeMirror's real paste handling — extracts clipboardData, writes to DOM.
    input.addEventListener('paste', (ev) => {
      const text = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
      input.textContent = text;
    });

    await injectPromptText('write a test');

    expect(input.textContent).toBe('write a test');
    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it('falls back to clipboard when the paste event does not visibly update the input', async () => {
    makeInput(); // no paste listener attached — nothing changes textContent, matching an editor that ignores the synthetic event

    await injectPromptText('write a test');

    expect(clipboardWriteTextMock).toHaveBeenCalledWith('write a test');
  });

  it('focuses the input before dispatching the paste event', async () => {
    const input = makeInput();
    const focusSpy = vi.spyOn(input, 'focus');
    input.addEventListener('paste', (ev) => {
      const text = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
      input.textContent = text;
    });

    await injectPromptText('hello');

    expect(focusSpy).toHaveBeenCalled();
  });

  describe('Replit\'s paste SIZE LIMIT (measured live 2026-08-26)', () => {
    // On a real Replit project: 1,500 characters landed in full, while 2,200 and
    // 4,000 landed NOTHING — silently, no error. Real enhanced prompts are
    // 2.1-2.5k, so every one was being discarded. Chunked delivery was verified
    // on that same composer: 800 -> 1,600 -> 2,400 accumulated exactly.
    function capturePastes(input: HTMLElement): string[] {
      const seen: string[] = [];
      input.addEventListener('paste', (ev) => {
        const text = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
        seen.push(text);
        // Emulate the composer: first paste replaces, later ones append.
        const sel = window.getSelection();
        const collapsed = sel?.isCollapsed === true;
        input.textContent = collapsed ? (input.textContent ?? '') + text : text;
      });
      return seen;
    }

    it('splits an oversized body into sub-limit pieces', async () => {
      const input = makeInput();
      const pastes = capturePastes(input);
      const body = 'y'.repeat(2400);

      await injectPromptText(body);

      expect(pastes.length).toBeGreaterThan(1);
      for (const piece of pastes) expect(piece.length).toBeLessThanOrEqual(800);
      expect(pastes.join('')).toBe(body);
    });

    it('reassembles to exactly the original text in the composer', async () => {
      const input = makeInput();
      capturePastes(input);
      const body = 'z'.repeat(2123);   // the tester's real body size

      await injectPromptText(body);

      expect(input.textContent).toBe(body);
    });

    it('sends a small body as ONE paste — no needless splitting', async () => {
      const input = makeInput();
      const pastes = capturePastes(input);

      await injectPromptText('deploy it now');

      expect(pastes).toEqual(['deploy it now']);
    });
  });
});
