// @vitest-environment jsdom
/**
 * The MAIN-world inject bridge (the listener half of the 2026-08-25 fix): the
 * content script posts nexpath:inject-request; this module — in the page's own
 * world — performs the insertion and replies with a typed landed/failed
 * result. Tested with the REAL module under jsdom (its fetch patch and emit
 * helpers load fine there); jsdom's postMessage carries source=null, so
 * requests are dispatched as source-carrying MessageEvents the way the
 * companion inject-kit tests do.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom lacks DataTransfer/ClipboardEvent (same stubs as inject-kit.test.ts).
beforeAll(async () => {
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
  await import('./main-world.js'); // registers the bridge listener
});

function request(detail: object): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'nexpath:inject-request', ...detail },
    source: window as unknown as MessageEventSource,
  }));
}

function nextResult(): Promise<{ requestId: string; landed: boolean }> {
  return new Promise((resolve) => {
    const onMsg = (ev: MessageEvent): void => {
      const m = ev.data as { type?: string; requestId?: string; landed?: boolean };
      if (m?.type !== 'nexpath:inject-result') return;
      window.removeEventListener('message', onMsg);
      resolve(m as { requestId: string; landed: boolean });
    };
    window.addEventListener('message', onMsg);
  });
}

describe('main-world inject bridge listener', () => {
  it('lands text in an editor that accepts the paste event, and replies landed:true', async () => {
    const editor = document.createElement('div');
    editor.className = 'tiptap ProseMirror';
    document.body.appendChild(editor);
    Object.defineProperty(editor, 'getClientRects', { value: () => [{}] });
    editor.addEventListener('paste', (ev) => {
      const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
      editor.textContent = dt ? dt.getData('text/plain') : '';
    });

    const reply = nextResult();
    request({ requestId: 'req-1', selector: '.tiptap.ProseMirror', text: 'THE ENHANCED BODY TEXT HERE' });
    const result = await reply;

    expect(result).toMatchObject({ requestId: 'req-1', landed: true });
    expect(editor.textContent).toBe('THE ENHANCED BODY TEXT HERE');
    editor.remove();
  });

  it('replies landed:false when no element matches the selector (the content-side fallback chain takes over)', async () => {
    const reply = nextResult();
    request({ requestId: 'req-2', selector: '.does-not-exist-anywhere', text: 'x' });
    expect(await reply).toMatchObject({ requestId: 'req-2', landed: false });
  });

  it('ignores malformed requests entirely — no reply, no throw', async () => {
    let replied = false;
    const onMsg = (ev: MessageEvent): void => {
      if ((ev.data as { type?: string })?.type === 'nexpath:inject-result') replied = true;
    };
    window.addEventListener('message', onMsg);
    request({ requestId: 42, selector: '.x', text: 'x' });          // bad requestId type
    request({ requestId: 'req-3', selector: null, text: 'x' });     // bad selector
    window.dispatchEvent(new MessageEvent('message', {              // wrong source
      data: { type: 'nexpath:inject-request', requestId: 'req-4', selector: '.x', text: 'x' },
      source: null,
    }));
    await new Promise((r) => setTimeout(r, 20));
    window.removeEventListener('message', onMsg);
    expect(replied).toBe(false);
  });

  it('replies landed:false when the editor ignores both paste and execCommand', async () => {
    const deaf = document.createElement('div');
    deaf.className = 'deaf-editor';
    document.body.appendChild(deaf);
    Object.defineProperty(deaf, 'getClientRects', { value: () => [{}] });
    // No paste listener; jsdom's execCommand is a no-op → nothing ever lands.
    const reply = nextResult();
    request({ requestId: 'req-5', selector: '.deaf-editor', text: 'never lands' });
    expect(await reply).toMatchObject({ requestId: 'req-5', landed: false });
    deaf.remove();
  });
});
