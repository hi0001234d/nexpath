// @vitest-environment jsdom
/**
 * The page-world bridge's insertion ORDER — `useDirectInsertFirst`.
 *
 * Both routes the bridge has deliver the same text. They differ in one respect
 * that is invisible from inside the bridge and very visible to the user: the
 * paste route dispatches a `paste` event AT THE SITE, and the insertText route
 * does not.
 *
 * On Chrome that is what raises "<site> wants to — See text and images copied to
 * the clipboard": the site's own paste handler cannot read a synthetic event's
 * clipboardData and falls back to `navigator.clipboard.read()`. So the assertion
 * that actually matters below is a NEGATIVE one — that no paste event is
 * dispatched at all when the direct insert lands.
 *
 * Firefox has never shown that prompt for exactly this reason: it drops a
 * script-constructed ClipboardEvent's clipboardData, so the site's paste handler
 * never runs and the insertion happens through execCommand instead. This flag
 * selects that same route on Chrome, deliberately.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

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

let restoreExec: (() => void) | null = null;

afterEach(() => {
  restoreExec?.();
  restoreExec = null;
  document.body.innerHTML = '';
});

beforeEach(() => {
  document.body.innerHTML = '';
});

/** Replace jsdom's absent/throwing execCommand with a controllable one. */
function stubExecCommand(impl: (command: string, value: string) => boolean): {
  calls: string[];
} {
  const calls: string[] = [];
  const target = document as unknown as { execCommand?: unknown };
  const original = target.execCommand;
  target.execCommand = (command: string, _ui: boolean, value: string): boolean => {
    calls.push(command);
    return impl(command, value);
  };
  restoreExec = () => { target.execCommand = original; };
  return { calls };
}

/**
 * A composer shaped like the real ones: an insertion becomes one block element
 * per line, and `innerText` joins those blocks with newlines the way a browser
 * does (jsdom implements neither on its own).
 */
function makeComposer(): { input: HTMLElement; pastes: string[]; apply: (text: string) => void } {
  const input = document.createElement('div');
  input.className = 'tiptap ProseMirror';
  document.body.appendChild(input);
  Object.defineProperty(input, 'getClientRects', { value: () => [{}] });
  Object.defineProperty(input, 'innerText', {
    configurable: true,
    get: () => Array.from(input.querySelectorAll('p'), (p) => p.textContent ?? '').join('\n'),
  });

  const apply = (text: string): void => {
    input.replaceChildren();
    for (const line of text.split('\n')) {
      const p = document.createElement('p');
      p.textContent = line;
      input.appendChild(p);
    }
  };

  const pastes: string[] = [];
  input.addEventListener('paste', (ev) => {
    const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
    pastes.push(dt ? dt.getData('text/plain') : '');
  });

  return { input, pastes, apply };
}

function request(detail: Record<string, unknown>): void {
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

const BODY = 'Scope:\n- Export a single invoice\n\nAcceptance:\n1. Button appears';

describe('useDirectInsertFirst — the site never sees a paste when the direct insert lands', () => {
  it('⭐ dispatches NO paste event at all — this is what removes the clipboard prompt', async () => {
    const { input, pastes, apply } = makeComposer();
    const exec = stubExecCommand((_c, value) => { apply(value); return true; });

    const reply = nextResult();
    request({
      requestId: 'first-1', selector: '.tiptap.ProseMirror', text: BODY,
      useRenderedLandingText: true, useDirectInsertFirst: true,
    });

    expect(await reply).toMatchObject({ requestId: 'first-1', landed: true });
    expect(exec.calls).toEqual(['insertText']);
    expect(pastes).toEqual([]);                       // ← the whole point
    expect(input.querySelectorAll('p').length).toBe(BODY.split('\n').length);
  });

  it('falls back to the paste when the editor refuses the command (Replit CM6 was measured doing exactly this)', async () => {
    const { pastes, apply } = makeComposer();
    const exec = stubExecCommand(() => false);        // inserts nothing, like CM6
    // The composer still honours a paste.
    document.querySelector('.tiptap.ProseMirror')!.addEventListener('paste', (ev) => {
      const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
      apply(dt ? dt.getData('text/plain') : '');
    });

    const reply = nextResult();
    request({
      requestId: 'first-2', selector: '.tiptap.ProseMirror', text: BODY,
      useRenderedLandingText: true, useDirectInsertFirst: true,
    });

    expect(await reply).toMatchObject({ requestId: 'first-2', landed: true });
    expect(exec.calls).toEqual(['insertText']);       // tried first...
    expect(pastes).toEqual([BODY]);                   // ...then the paste carried it
  });

  it('reports landed:false when NEITHER route works — the content-side chain still takes over', async () => {
    makeComposer();
    stubExecCommand(() => false);

    const reply = nextResult();
    request({
      requestId: 'first-3', selector: '.tiptap.ProseMirror', text: BODY,
      useRenderedLandingText: true, useDirectInsertFirst: true,
    });

    expect(await reply).toMatchObject({ requestId: 'first-3', landed: false });
  });
});

describe('the flags default OFF — the shipped bridge is byte-identical', () => {
  it('LEFT OUT (Lovable): paste goes FIRST and execCommand is never reached when it lands', async () => {
    const { pastes, apply } = makeComposer();
    const exec = stubExecCommand((_c, value) => { apply(value); return true; });
    document.querySelector('.tiptap.ProseMirror')!.addEventListener('paste', (ev) => {
      const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
      apply(dt ? dt.getData('text/plain') : '');
    });

    // A SINGLE-line body: the shipped raw `textContent` read can see it, so this
    // exercises the shipped order without depending on the landing-check fix.
    const single = 'Add a dark mode toggle';
    const reply = nextResult();
    request({ requestId: 'off-1', selector: '.tiptap.ProseMirror', text: single });

    expect(await reply).toMatchObject({ requestId: 'off-1', landed: true });
    expect(pastes).toEqual([single]);   // paste first, exactly as shipped
    expect(exec.calls).toEqual([]);     // and the retry was never needed
  });

  it('LEFT OUT: still retries through execCommand after a paste that does not land', async () => {
    const { pastes, apply } = makeComposer();
    const exec = stubExecCommand((_c, value) => { apply(value); return true; });
    // No paste listener that applies anything — the paste is recorded but inert.

    const single = 'Add a dark mode toggle';
    const reply = nextResult();
    request({ requestId: 'off-2', selector: '.tiptap.ProseMirror', text: single });

    expect(await reply).toMatchObject({ requestId: 'off-2', landed: true });
    expect(pastes).toEqual([single]);         // paste attempted first...
    expect(exec.calls).toEqual(['insertText']); // ...then the shipped retry
  });
});

describe('useRenderedLandingText reaches the bridge too', () => {
  it('OPTED IN: a multi-line prompt that landed is reported landed', async () => {
    const { apply } = makeComposer();
    stubExecCommand((_c, value) => { apply(value); return true; });

    const reply = nextResult();
    request({
      requestId: 'read-1', selector: '.tiptap.ProseMirror', text: BODY,
      useRenderedLandingText: true, useDirectInsertFirst: true,
    });
    expect(await reply).toMatchObject({ landed: true });
  });

  it('LEFT OUT: the same landed text is reported landed:false — shipped behaviour, preserved', async () => {
    const { apply } = makeComposer();
    stubExecCommand((_c, value) => { apply(value); return true; });

    const reply = nextResult();
    request({
      requestId: 'read-2', selector: '.tiptap.ProseMirror', text: BODY,
      useDirectInsertFirst: true,   // order flipped, but the RAW read still decides
    });
    expect(await reply).toMatchObject({ landed: false });
  });
});

describe('guards that must not weaken', () => {
  it('blank text is refused before anything touches the composer', async () => {
    const { input, pastes, apply } = makeComposer();
    apply('the user was still typing this');
    const exec = stubExecCommand(() => true);

    const reply = nextResult();
    request({
      requestId: 'blank-1', selector: '.tiptap.ProseMirror', text: '   \n  ',
      useRenderedLandingText: true, useDirectInsertFirst: true,
    });

    expect(await reply).toMatchObject({ landed: false });
    expect(exec.calls).toEqual([]);
    expect(pastes).toEqual([]);
    expect(input.textContent).toBe('the user was still typing this');
  });

  it('a missing composer is refused, with both flags on', async () => {
    stubExecCommand(() => true);
    const reply = nextResult();
    request({
      requestId: 'none-1', selector: '.no-such-composer', text: BODY,
      useRenderedLandingText: true, useDirectInsertFirst: true,
    });
    expect(await reply).toMatchObject({ landed: false });
  });
});
