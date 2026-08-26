// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectViaSimulatedPaste, clipboardFallback, landingBudgetFor } from './inject-kit.js';

// Parameterization proof for the shared inject kit: works against arbitrary,
// NON-Replit selectors. The full behavior matrix (focus, landed-verification,
// fallback paths) is covered by replit-inject.test.ts, which exercises this same
// code through the real Replit config.
describe('content/agents/inject-kit.ts — injectViaSimulatedPaste', () => {
  let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteTextMock },
      configurable: true,
    });

    // jsdom implements neither DataTransfer nor ClipboardEvent — same minimal stubs
    // as replit-inject.test.ts (see the caveat there: this exercises the function's
    // own logic, not any real editor's paste handling).
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

    // Default execCommand to an inert no-op so the paste-fallback tests are
    // deterministic (jsdom doesn't implement it). The Firefox-path test below
    // overrides this to simulate an editor honoring execCommand('insertText').
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
  });

  it('injects into an element matched by an arbitrary configured selector', async () => {
    const input = document.createElement('div');
    input.id = 'bolt-composer';
    document.body.appendChild(input);
    input.addEventListener('paste', (ev) => {
      const text = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
      input.textContent = text;
    });

    await injectViaSimulatedPaste('#bolt-composer', 'add dark mode');

    expect(input.textContent).toBe('add dark mode');
    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it('auto-submits (dispatches Enter) after the paste lands — "Send to your agent now"', async () => {
    const input = document.createElement('div');
    input.id = 'composer';
    document.body.appendChild(input);
    input.addEventListener('paste', (ev) => {
      input.textContent = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    });
    const keys: string[] = [];
    input.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));

    await injectViaSimulatedPaste('#composer', 'run the tests');

    expect(input.textContent).toBe('run the tests');
    expect(keys).toContain('Enter'); // submitted so the agent acts on it
  });

  it('does NOT submit when the paste failed to land (falls back, no stray Enter)', async () => {
    const input = document.createElement('div');
    input.className = 'editor'; // no paste listener → text never lands
    document.body.appendChild(input);
    const keys: string[] = [];
    input.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));

    await injectViaSimulatedPaste('.editor', 'run the tests');

    expect(keys).not.toContain('Enter');
    expect(clipboardWriteTextMock).toHaveBeenCalledWith('run the tests');
  });

  it('falls back to clipboard when the configured selector matches nothing', async () => {
    await injectViaSimulatedPaste('[data-testid="missing-editor"]', 'add dark mode');
    expect(clipboardWriteTextMock).toHaveBeenCalledWith('add dark mode');
  });

  it('falls back to clipboard when the paste does not visibly land in the matched element', async () => {
    const input = document.createElement('div');
    input.className = 'lovable-editor';
    document.body.appendChild(input); // no paste listener — text never lands

    await injectViaSimulatedPaste('.lovable-editor', 'add dark mode');

    expect(clipboardWriteTextMock).toHaveBeenCalledWith('add dark mode');
  });

  it('Firefox path: synthetic paste is inert, execCommand insertText lands → submits, no clipboard', async () => {
    // Reproduces Firefox: the ClipboardEvent carries no usable clipboardData, so the
    // paste listener sees nothing and the text never lands via paste. The editor DOES
    // honor the trusted execCommand('insertText') that runs as the fallback.
    const input = document.createElement('div');
    input.className = 'ff-editor';
    document.body.appendChild(input);
    input.addEventListener('paste', () => { /* Firefox: clipboardData empty, nothing inserted */ });
    const keys: string[] = [];
    input.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));

    const execMock = vi.fn((cmd: string, _ui?: boolean, value?: string) => {
      if (cmd === 'insertText') { input.textContent = value ?? ''; return true; }
      return false;
    });
    Object.defineProperty(document, 'execCommand', { value: execMock, configurable: true });

    await injectViaSimulatedPaste('.ff-editor', 'ship the release');

    expect(execMock).toHaveBeenCalledWith('insertText', false, 'ship the release');
    expect(input.textContent).toBe('ship the release');
    expect(keys).toContain('Enter');                       // auto-submitted, same as Chrome
    expect(clipboardWriteTextMock).not.toHaveBeenCalled(); // did NOT degrade to clipboard
  });

  it('Chrome path is unchanged: paste lands first try, execCommand is never invoked', async () => {
    const input = document.createElement('div');
    input.id = 'chrome-composer';
    document.body.appendChild(input);
    input.addEventListener('paste', (ev) => {
      input.textContent = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    });
    const execSpy = document.execCommand as unknown as ReturnType<typeof vi.fn>;

    await injectViaSimulatedPaste('#chrome-composer', 'run the tests');

    expect(input.textContent).toBe('run the tests');
    expect(execSpy).not.toHaveBeenCalled(); // Firefox fallback never runs when paste lands
  });

  it('clipboardFallback (exported for hosts with no injector) copies and toasts', async () => {
    await clipboardFallback('option text for an agent without inject-back yet');
    expect(clipboardWriteTextMock).toHaveBeenCalledWith('option text for an agent without inject-back yet');
  });

  // ── prioritised selector list + rendered-element preference (site-drift resilience) ──
  it('accepts a prioritised selector LIST and uses the first selector that matches', async () => {
    const input = document.createElement('div');
    input.className = 'tiptap ProseMirror';
    input.setAttribute('aria-label', 'Ask Lovable to create something');
    document.body.appendChild(input);
    input.addEventListener('paste', (ev) => {
      input.textContent = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    });

    // The original exact-label selector matches nothing (site relabelled it); a later
    // fallback selector does — must inject, NOT fall back to clipboard.
    await injectViaSimulatedPaste(
      [
        '.tiptap.ProseMirror[aria-label="Chat input"]',
        '.tiptap.ProseMirror[aria-label^="Ask Lovable"]',
        '.tiptap.ProseMirror',
      ],
      'run all tests',
    );

    expect(input.textContent).toBe('run all tests');
    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it('prefers the first RENDERED element when a selector matches several nodes', async () => {
    const hidden = document.createElement('div');
    hidden.className = 'tiptap ProseMirror';
    hidden.addEventListener('paste', () => { hidden.textContent = 'WRONG (hidden)'; });
    const visible = document.createElement('div');
    visible.className = 'tiptap ProseMirror';
    visible.addEventListener('paste', (ev) => {
      visible.textContent = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    });
    document.body.append(hidden, visible); // hidden is first in document order

    // jsdom performs no layout, so drive getClientRects explicitly: only `visible` renders.
    hidden.getClientRects = () => [] as unknown as DOMRectList;
    visible.getClientRects = () => [{ width: 200, height: 24 } as DOMRect] as unknown as DOMRectList;

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'ship it');

    expect(visible.textContent).toBe('ship it');
    expect(hidden.textContent).not.toBe('WRONG (hidden)');
    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it('backward-compatible: a bare string selector still resolves to its first match', async () => {
    const input = document.createElement('div');
    input.id = 'legacy-composer';
    document.body.appendChild(input);
    input.addEventListener('paste', (ev) => {
      input.textContent = (ev as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    });

    await injectViaSimulatedPaste('#legacy-composer', 'still works');

    expect(input.textContent).toBe('still works');
    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });
});

describe('slow rich-editor landing (live 2026-08-25: 2.6KB PE body fell to clipboard on a busy page)', () => {
  it('a paste the editor processes AFTER the first check still lands via the poll — no clipboard fallback', async () => {
    const input = document.createElement('div');
    input.className = 'tiptap ProseMirror';
    document.body.appendChild(input);
    Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    // Simulate TipTap: the paste event lands in the model ~300ms later (well
    // past the old fixed 50ms check, inside the new 900ms poll budget).
    input.addEventListener('paste', () => {
      setTimeout(() => { input.textContent = 'THE ENHANCED PROMPT BODY'; }, 300);
    });
    const submits: string[] = [];
    input.addEventListener('keydown', (e) => { submits.push((e as KeyboardEvent).key); });

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'THE ENHANCED PROMPT BODY');

    expect(input.textContent).toContain('THE ENHANCED PROMPT');
    expect(submits).toContain('Enter');       // auto-submit fired
    expect(writeText).not.toHaveBeenCalled(); // NO clipboard fallback
    input.remove();
  });
});

describe('main-world inject bridge (2026-08-25: isolated-world paste is unreadable to rich editors)', () => {
  it('a landed bridge reply short-circuits to submit — no simulated paste, no clipboard', async () => {
    const input = document.createElement('div');
    input.className = 'tiptap ProseMirror';
    document.body.appendChild(input);
    Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const submits: string[] = [];
    input.addEventListener('keydown', (e) => { submits.push((e as KeyboardEvent).key); });
    // Fake the MAIN-world bridge: acknowledge the request as landed.
    const bridge = (ev: MessageEvent): void => {
      const m = ev.data as { type?: string; requestId?: string };
      if (m?.type === 'nexpath:inject-request') {
        input.textContent = 'ENHANCED';
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'nexpath:inject-result', requestId: m.requestId, landed: true },
          source: window as unknown as MessageEventSource,
        }));
      }
    };
    window.addEventListener('message', bridge);

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'ENHANCED BODY TEXT');

    expect(submits).toContain('Enter');       // auto-submit after the bridge landing
    expect(writeText).not.toHaveBeenCalled();
    window.removeEventListener('message', bridge);
    input.remove();
  });

  it('no bridge reply (stale page generation) times out and the existing fallback chain still lands', async () => {
    const input = document.createElement('div');
    input.className = 'tiptap ProseMirror';
    document.body.appendChild(input);
    Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
    input.addEventListener('paste', () => { input.textContent = 'FALLBACK BODY'; });
    const submits: string[] = [];
    input.addEventListener('keydown', (e) => { submits.push((e as KeyboardEvent).key); });

    await injectViaSimulatedPaste('.tiptap.ProseMirror', 'FALLBACK BODY');

    expect(input.textContent).toBe('FALLBACK BODY'); // the old chain still delivered
    expect(submits).toContain('Enter');
    input.remove();
  }, 15000);
});

describe('auto-submit button fallback (Firefox/Bolt live 2026-08-25: Enter ignored, text sat in the composer)', () => {
  it('clicks the agent submit button when the composer still holds the text after the settle', async () => {
    vi.useFakeTimers();
    try {
      const input = document.createElement('div');
      input.className = 'tiptap ProseMirror';
      document.body.appendChild(input);
      Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
      input.addEventListener('paste', (ev) => {
        const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
        input.textContent = dt ? dt.getData('text/plain') : '';
      });
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Send message');
      const clicked = vi.fn();
      button.addEventListener('click', clicked);
      document.body.appendChild(button);

      const done = injectViaSimulatedPaste('.tiptap.ProseMirror', 'submit fallback text', 'button[aria-label="Send message"]');
      await vi.advanceTimersByTimeAsync(3000); // bridge timeout + landing polls + settle
      await done;

      expect(input.textContent).toContain('submit fallback text'); // Enter did NOT clear it (no page handler)
      expect(clicked).toHaveBeenCalledTimes(1);                    // so the button carried the send
      input.remove(); button.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT click the button when the Enter submit already cleared the composer', async () => {
    vi.useFakeTimers();
    try {
      const input = document.createElement('div');
      input.className = 'tiptap ProseMirror';
      document.body.appendChild(input);
      Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
      input.addEventListener('paste', (ev) => {
        const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
        input.textContent = dt ? dt.getData('text/plain') : '';
      });
      input.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter') input.textContent = ''; // a page that submits on Enter
      });
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Send message');
      const clicked = vi.fn();
      button.addEventListener('click', clicked);
      document.body.appendChild(button);

      const done = injectViaSimulatedPaste('.tiptap.ProseMirror', 'enter works here', 'button[aria-label="Send message"]');
      await vi.advanceTimersByTimeAsync(3000);
      await done;

      expect(clicked).not.toHaveBeenCalled(); // no double-submit
      input.remove(); button.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('empty inject text is refused outright (it used to wipe the composer and press Send)', () => {
  it('leaves the composer untouched, presses nothing, clicks nothing', async () => {
    const input = document.createElement('div');
    input.className = 'tiptap ProseMirror';
    input.textContent = "USER'S OWN IN-PROGRESS PROMPT";
    document.body.appendChild(input);
    Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
    const keys: string[] = [];
    input.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Send message');
    const clicked = vi.fn();
    button.addEventListener('click', clicked);
    document.body.appendChild(button);

    await injectViaSimulatedPaste('.tiptap.ProseMirror', '   ', 'button[aria-label="Send message"]');

    expect(input.textContent).toBe("USER'S OWN IN-PROGRESS PROMPT"); // not wiped
    expect(keys).toEqual([]);                                        // no Enter
    expect(clicked).not.toHaveBeenCalled();                          // no send
    input.remove(); button.remove();
  });
});

describe('landingBudgetFor — the clipboard-fallback regression', () => {
  // Live 2026-08-26 (Bolt AND Replit): 2,179- and 2,465-char enhanced prompts
  // fell to the clipboard at a flat 900ms even though the text WAS in the
  // composer moments later. Telling a user to paste text that already arrived
  // is the worst possible outcome.
  it('gives a real enhanced prompt materially more time than 900ms', () => {
    expect(landingBudgetFor('x'.repeat(2465))).toBeGreaterThan(900);
    expect(landingBudgetFor('x'.repeat(2179))).toBeGreaterThan(900);
  });

  it('scales with the body — a longer prompt waits longer', () => {
    expect(landingBudgetFor('x'.repeat(4000))).toBeGreaterThan(landingBudgetFor('x'.repeat(1000)));
  });

  it('keeps a floor so a one-line option stays snappy', () => {
    expect(landingBudgetFor('add tests')).toBe(1_200);
    expect(landingBudgetFor('')).toBe(1_200);
  });

  it('keeps a ceiling so a pathological editor cannot stall the flow', () => {
    expect(landingBudgetFor('x'.repeat(500_000))).toBe(6_000);
  });
});
