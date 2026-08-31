// @vitest-environment jsdom
/**
 * The page-world bridge's editor-API route — `useEditorApiInsert`.
 *
 * This route exists for the one composer neither other route serves. Measured
 * live on a real Repl (2026-08-27):
 *
 *   execCommand('insertText')          returns false, inserts nothing
 *   paste                              works, but the composer has a SIZE LIMIT
 *   EditorView transaction             55 / 2,500 / 8,000 chars, doc exact, 2-6 ms
 *
 * Two properties below are the ones that matter and are easy to lose in a
 * refactor:
 *
 *   1. It verifies against the editor's DOCUMENT, not the DOM. CodeMirror 6
 *      virtualises — that live composer rendered 27 of ~337 lines for an 8,000
 *      character body — so any DOM-based check reports a long prompt as missing
 *      when it is perfectly present.
 *
 *   2. When the route is unavailable it touches NOTHING. The caller that asks
 *      for it is the one whose composer drops an over-limit paste, so falling
 *      through to the bridge's whole-body paste would select-all and leave the
 *      user's own prompt deleted with nothing in its place.
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

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { restoreExec?.(); restoreExec = null; document.body.innerHTML = ''; });

function stubExecCommand(impl: (command: string, value: string) => boolean): { calls: string[] } {
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

interface FakeViewOptions {
  /** Some builds expose the view under `cmView.view`, others as `cmView` itself. */
  wrapped?: boolean;
  /** Transform what the transaction actually stores (to model a refusal). */
  store?: (insert: string) => string;
  /** Make dispatch throw, as a hostile/incompatible build would. */
  throws?: boolean;
  /**
   * How much of the document the DOM shows. CodeMirror 6 renders only the
   * viewport, so the DOM is routinely a PREFIX of the real document.
   */
  renderChars?: number;
}

function makeComposer(view?: FakeViewOptions): { input: HTMLElement; pastes: string[]; doc: () => string } {
  const input = document.createElement('div');
  input.className = 'cm-content';
  input.setAttribute('contenteditable', 'true');
  document.body.appendChild(input);
  Object.defineProperty(input, 'getClientRects', { value: () => [{}] });

  const pastes: string[] = [];
  input.addEventListener('paste', (ev) => {
    const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
    pastes.push(dt ? dt.getData('text/plain') : '');
  });

  let doc = '';
  if (view) {
    const editorView = {
      get state() { return { doc: { length: doc.length, toString: () => doc } }; },
      dispatch(spec: { changes: { from: number; to: number; insert: string } }): void {
        if (view.throws) throw new Error('incompatible build');
        doc = view.store ? view.store(spec.changes.insert) : spec.changes.insert;
        // Model virtualisation: the DOM shows only part of the document.
        input.textContent = view.renderChars === undefined ? doc : doc.slice(0, view.renderChars);
      },
    };
    Object.defineProperty(input, 'cmView', {
      configurable: true,
      value: view.wrapped ? { view: editorView } : editorView,
    });
  }

  return { input, pastes, doc: () => doc };
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

const SELECTOR = '.cm-content[contenteditable="true"]';
const BODY = 'Scope:\nExport a single invoice\n\nAcceptance:\nButton appears';

describe('useEditorApiInsert — delivery through the editor\'s own API', () => {
  it('⭐ replaces the document in one transaction, and dispatches NO paste', async () => {
    const { pastes, doc } = makeComposer({ wrapped: true });
    const exec = stubExecCommand(() => true);

    const reply = nextResult();
    request({ requestId: 'api-1', selector: SELECTOR, text: BODY, useEditorApiInsert: true });

    expect(await reply).toMatchObject({ requestId: 'api-1', landed: true });
    expect(doc()).toBe(BODY);        // exact, not whitespace-approximate
    expect(pastes).toEqual([]);      // no paste event at all
    expect(exec.calls).toEqual([]);  // and no execCommand either
  });

  it('accepts a view exposed directly as `cmView` as well as under `cmView.view`', async () => {
    const { doc } = makeComposer({ wrapped: false });
    stubExecCommand(() => true);

    const reply = nextResult();
    request({ requestId: 'api-2', selector: SELECTOR, text: BODY, useEditorApiInsert: true });

    expect(await reply).toMatchObject({ landed: true });
    expect(doc()).toBe(BODY);
  });

  it('⭐ reports landed for a body the DOM only PARTLY renders (CM6 virtualises)', async () => {
    // The live composer rendered 27 of ~337 lines for an 8,000-character body.
    const long = `${BODY}\n`.repeat(200);
    const { input, doc } = makeComposer({ wrapped: true, renderChars: 120 });
    stubExecCommand(() => true);

    const reply = nextResult();
    request({ requestId: 'api-3', selector: SELECTOR, text: long, useEditorApiInsert: true });

    expect(await reply).toMatchObject({ landed: true });
    expect(doc()).toBe(long);
    // Proof the DOM could not have answered this: it holds a fraction of the text.
    expect((input.textContent ?? '').length).toBe(120);
    expect(input.textContent!.length).toBeLessThan(long.length);
  });
});

describe('useEditorApiInsert — when the route is unavailable', () => {
  it('⭐ WITHIN the paste limit: falls through to the shipped paste rather than degrading', async () => {
    // A page that stops exposing an editor view must land where it landed BEFORE
    // this route existed — on the bridge's own paste — not on the clipboard. The
    // paste is exactly as safe here as it always was, because this body fits.
    const { input, pastes, doc } = makeComposer();     // no cmView at all
    input.addEventListener('paste', (ev) => {
      const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
      input.textContent = dt ? dt.getData('text/plain') : '';
    });
    stubExecCommand(() => true);

    const single = 'Add a dark mode toggle';
    const reply = nextResult();
    request({ requestId: 'api-fall-1', selector: SELECTOR, text: single, useEditorApiInsert: true });

    expect(await reply).toMatchObject({ landed: true });
    expect(pastes).toEqual([single]);
    expect(doc()).toBe('');   // and the editor API was never available to use
  });

  it('⭐ OVER the paste limit: reports false and dispatches NO paste (the composer keeps the user\'s prompt)', async () => {
    const { input, pastes } = makeComposer();          // no cmView at all
    input.textContent = 'the user’s own prompt';
    const exec = stubExecCommand(() => true);

    const reply = nextResult();
    request({ requestId: 'api-4', selector: SELECTOR, text: BODY, useEditorApiInsert: true, bodyExceedsPasteLimit: true });

    expect(await reply).toMatchObject({ landed: false });
    expect(pastes).toEqual([]);
    expect(exec.calls).toEqual([]);
    expect(input.textContent).toBe('the user’s own prompt');   // untouched
  });

  it('a dispatch that throws is reported false, and still dispatches no paste', async () => {
    const { pastes } = makeComposer({ wrapped: true, throws: true });
    stubExecCommand(() => true);

    const reply = nextResult();
    request({ requestId: 'api-5', selector: SELECTOR, text: BODY, useEditorApiInsert: true, bodyExceedsPasteLimit: true });

    expect(await reply).toMatchObject({ landed: false });
    expect(pastes).toEqual([]);
  });

  it('a transaction the editor did not fully accept is reported false', async () => {
    const { pastes } = makeComposer({ wrapped: true, store: (t) => t.slice(0, 10) });
    stubExecCommand(() => true);

    const reply = nextResult();
    request({ requestId: 'api-6', selector: SELECTOR, text: BODY, useEditorApiInsert: true, bodyExceedsPasteLimit: true });

    expect(await reply).toMatchObject({ landed: false });
    expect(pastes).toEqual([]);
  });

  it('an unrecognised cmView shape is refused by the guard, not thrown on', async () => {
    const { input, pastes } = makeComposer();
    Object.defineProperty(input, 'cmView', { configurable: true, value: { view: { nope: true } } });
    stubExecCommand(() => true);

    const reply = nextResult();
    request({ requestId: 'api-7', selector: SELECTOR, text: BODY, useEditorApiInsert: true, bodyExceedsPasteLimit: true });

    expect(await reply).toMatchObject({ landed: false });
    expect(pastes).toEqual([]);
  });

  it('blank text is still refused before the editor is even resolved', async () => {
    const { input, pastes, doc } = makeComposer({ wrapped: true });
    input.textContent = 'the user was still typing this';

    const reply = nextResult();
    request({ requestId: 'api-8', selector: SELECTOR, text: '  \n ', useEditorApiInsert: true });

    expect(await reply).toMatchObject({ landed: false });
    expect(doc()).toBe('');
    expect(pastes).toEqual([]);
    expect(input.textContent).toBe('the user was still typing this');
  });
});

describe('the flag defaults OFF — the shipped bridge never looks for an editor view', () => {
  it('LEFT OUT: pastes as shipped even when the composer exposes a view', async () => {
    const { input, pastes, doc } = makeComposer({ wrapped: true });
    // The shipped paste route: apply what is pasted, as a live editor would.
    input.addEventListener('paste', (ev) => {
      const dt = (ev as ClipboardEvent).clipboardData as { getData(f: string): string } | null;
      input.textContent = dt ? dt.getData('text/plain') : '';
    });
    stubExecCommand(() => true);

    const single = 'Add a dark mode toggle';
    const reply = nextResult();
    request({ requestId: 'off-api-1', selector: SELECTOR, text: single });

    expect(await reply).toMatchObject({ landed: true });
    expect(pastes).toEqual([single]);   // the paste route ran
    expect(doc()).toBe('');             // and the editor API was never used
  });
});
