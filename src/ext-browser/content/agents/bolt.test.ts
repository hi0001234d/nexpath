// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// This agent module now installs the submit-time gate, which needs storage (to
// resolve the switch) and runtime messaging. The polyfill throws on import
// outside a real extension, so it is stubbed exactly as the other agent tests do.
vi.mock('webextension-polyfill', () => ({
  default: {
    // The site key is 'false' so the submit gate stays DISARMED here: these tests
    // cover CAPTURE, and an armed gate would (correctly) cancel the submit before
    // capture runs. The gate's own behaviour is covered in composer-submit-gate.test.ts.
    storage: {
      local: { get: vi.fn().mockResolvedValue({ 'bolt_promptsubmit_advisory': 'false' }) },
      onChanged: { addListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  },
}));
import {
  observeUserMessages,
  observeComposerSubmit,
  observeStopButton,
  observeVersionLabel,
  observeFetchPrompts,
  bootstrap,
  __resetResponseStopDedupForTests,
  __resetPromptCaptureStateForTests,
  __teardownAutoBootstrapForTests,
} from './bolt.js';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Mirrors Bolt's real prompt box (recon 2026-07-04): a TipTap/ProseMirror
// contenteditable (one <p> per line) sharing a container with the
// aria-label="Send message" button.
function makeComposer(text: string): { composer: HTMLElement; button: HTMLElement } {
  const container = document.createElement('div');
  const composer = document.createElement('div');
  composer.className = 'tiptap ProseMirror';
  composer.setAttribute('contenteditable', 'true');
  composer.setAttribute('role', 'textbox');
  for (const lineText of text === '' ? [''] : text.split('\n')) {
    const p = document.createElement('p');
    p.textContent = lineText;
    composer.appendChild(p);
  }
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Send message');
  container.append(composer, button);
  document.body.appendChild(container);
  return { composer, button };
}

// Mirrors the confirmed user-bubble ancestry: a self-end container holding a
// hashed _MarkdownContent_ div with the text inside.
function makeUserBubble(text: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'grid grid-col-1 self-end';
  const md = document.createElement('div');
  md.className = '_MarkdownContent_1iu5k_54';
  const p = document.createElement('p');
  p.textContent = text;
  md.appendChild(p);
  wrap.appendChild(md);
  return wrap;
}

function makeStopButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Stop generation');
  return btn;
}

function pressEnter(target: Element, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }));
}

function dispatchFetchPrompt(promptText: string, agent = 'bolt', origin = window.location.origin): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'nexpath:fetch-prompt', promptText, agent },
      origin,
      source: window,
    }),
  );
}


/**
 * Arm a turn so the completion-label detector counts (capture-kit's `turnActive`
 * gate — historical "Version N at" rows must not fire a response-stop). Leaves
 * the stop button PRESENT so no generating→idle transition fires on its own.
 */
async function armTurnViaStopButton(observers: Array<{ disconnect(): void }>): Promise<void> {
  const btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Stop generation');
  document.body.appendChild(btn);
  observers.push(observeStopButton(document.body));
  document.body.appendChild(document.createElement('i')); // any mutation → checkAndEmit
  await flush();
}

describe('content/agents/bolt.ts', () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let observers: Array<{ disconnect(): void }>;

  beforeEach(async () => {
    document.body.innerHTML = '';
    // The module's import-time auto-bootstrap keeps observers live on document.body for
    // the whole file (disposed once in afterAll) — drain the mutation notification from
    // the innerHTML clear against the outgoing spy before installing a fresh one.
    await flush();
    postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    observers = [];
    __resetResponseStopDedupForTests();
    __resetPromptCaptureStateForTests();
  });

  afterEach(() => {
    observers.forEach((o) => o.disconnect());
    postMessageSpy.mockRestore();
  });

  // Dispose the import-time auto-bootstrap's observers + 1.5s poll interval so nothing
  // fires against a torn-down document after this file finishes (was the source of the
  // post-run "document is not defined" console noise).
  afterAll(() => __teardownAutoBootstrapForTests());

  describe('observeComposerSubmit — TipTap composer', () => {
    it('captures the composer text on Enter, joining <p> lines with newlines', () => {
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('first line\nsecond line');

      pressEnter(composer.querySelector('p')!);

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'first line\nsecond line', agent: 'bolt' },
        window.location.origin,
      );
    });

    it('does not capture on Shift+Enter (newline, not submit)', () => {
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('still typing');

      pressEnter(composer, { shiftKey: true });

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('captures the composer text when the Send message button is clicked', () => {
      observers.push(observeComposerSubmit(document));
      const { button } = makeComposer('clicked to send');

      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'clicked to send' }),
        window.location.origin,
      );
    });

    it('does NOT capture Enter inside a CodeMirror element — on Bolt .cm-content is the FILE editor', () => {
      // The exact inversion of Replit (where .cm-content IS the composer): Bolt's
      // file editor is CodeMirror, and Enter there is a newline in a file whose
      // contents must never be emitted as a prompt.
      observers.push(observeComposerSubmit(document));
      makeComposer('the real chat composer');

      const fileEditor = document.createElement('div');
      fileEditor.className = 'cm-content cm-lineWrapping';
      fileEditor.setAttribute('contenteditable', 'true');
      const codeLine = document.createElement('div');
      codeLine.className = 'cm-line';
      codeLine.textContent = 'const secret = process.env.API_KEY;';
      fileEditor.appendChild(codeLine);
      document.body.appendChild(fileEditor);

      pressEnter(codeLine);

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('an empty composer emits nothing on Enter (TipTap placeholder is CSS-only, not text)', () => {
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('');

      pressEnter(composer);

      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('observeFetchPrompts — transport channel (primary for Bolt)', () => {
    it('emits a captured prompt when main-world posts a matching fetch-prompt message', () => {
      observers.push(observeFetchPrompts(window));

      dispatchFetchPrompt('build a login page');

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'build a login page', agent: 'bolt' },
        window.location.origin,
      );
    });

    it('ignores fetch-prompt messages for a different agent', () => {
      observers.push(observeFetchPrompts(window));

      dispatchFetchPrompt('someone else prompt', 'lovable');

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('the rendered-bubble echo of a fetch-captured prompt collapses to one emission', async () => {
      observers.push(observeFetchPrompts(window));
      observers.push(observeUserMessages(document.body));

      dispatchFetchPrompt('same prompt both channels');
      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      document.body.appendChild(makeUserBubble('same prompt both channels'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('observeUserMessages — bubble observation (tertiary channel)', () => {
    it('captures a newly inserted self-end markdown bubble', async () => {
      observers.push(observeUserMessages(document.body));

      document.body.appendChild(makeUserBubble('a typed prompt'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'a typed prompt', agent: 'bolt' }),
        window.location.origin,
      );
    });

    it('does not capture agent replies (markdown but not self-end)', async () => {
      observers.push(observeUserMessages(document.body));

      const reply = document.createElement('div');
      const md = document.createElement('div');
      md.className = '_MarkdownContent_1iu5k_54';
      md.textContent = 'Here is how machine learning works…';
      reply.appendChild(md);
      document.body.appendChild(reply);
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('response-stop', () => {
    it('emits response-stopped when the Stop generation button leaves the DOM', async () => {
      const stopBtn = makeStopButton();
      document.body.appendChild(stopBtn);
      await flush();

      observers.push(observeStopButton(document.body));
      stopBtn.remove();
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'bolt' },
        window.location.origin,
      );
    });

    it('emits response-stopped when a "Version N at" card appears', async () => {
      await armTurnViaStopButton(observers);
      observers.push(observeVersionLabel(document.body));

      const card = document.createElement('div');
      card.textContent = 'Version 2 at Jul 04 3:44 PM';
      document.body.appendChild(card);
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'bolt' },
        window.location.origin,
      );
    });

    it('ignores long text that merely contains the Version phrase', async () => {
      observers.push(observeVersionLabel(document.body));

      const blob = document.createElement('div');
      blob.textContent = 'A'.repeat(80) + ' Version 3 at Jul 04 4:00 PM ' + 'B'.repeat(80);
      document.body.appendChild(blob);
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('bootstrap', () => {
    it('is idempotent per page via the window flag (stale re-injection guard)', () => {
      // The module's own import already bootstrapped this page.
      expect(window.__nexpathBoltBootstrapped).toBe(true);

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        bootstrap();
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('skipped, already bootstrapped in this page'),
        );
      } finally {
        logSpy.mockRestore();
      }
    });
  });
});

declare global {
  interface Window {
    __nexpathBoltBootstrapped?: boolean;
  }
}
