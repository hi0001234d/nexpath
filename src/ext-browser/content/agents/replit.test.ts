// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// replit.ts now installs the submit-time gate, which needs storage (to resolve
// the switch) and runtime messaging. The polyfill throws on import outside a real
// extension, so it is stubbed here exactly as the other content-script tests do.
vi.mock('webextension-polyfill', () => ({
  default: {
    // The site key is 'false' so the submit gate stays DISARMED here: these tests
    // cover CAPTURE, and an armed gate would (correctly) cancel the submit before
    // capture runs. The gate's own behaviour is covered in composer-submit-gate.test.ts.
    storage: {
      local: { get: vi.fn().mockResolvedValue({ 'replit_promptsubmit_advisory': 'false' }) },
      onChanged: { addListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  },
}));

import { observeUserMessages, observeSubmitButton, observeWorkedForLabel, observeComposerSubmit, bootstrap, __resetResponseStopDedupForTests, __resetPromptCaptureStateForTests, __teardownAutoBootstrapForTests } from './replit.js';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeUserMessage(text: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-cy', 'user-message');
  const rendered = document.createElement('div');
  rendered.className = 'rendered-markdown';
  rendered.innerHTML = `<p>${text}</p>`;
  el.appendChild(rendered);
  return el;
}

function makeStopButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('data-cy', 'ai-prompt-stop');
  return btn;
}

function makeWorkedForLabel(text = 'Worked for 13 seconds'): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}


/**
 * Arm a turn so the completion-label detector counts (capture-kit's `turnActive`
 * gate — historical "Worked for …" rows must not fire a response-stop). Leaves
 * the stop button PRESENT so no generating→idle transition fires on its own.
 */
async function armTurnViaStopButton(observers: Array<{ disconnect(): void }>): Promise<void> {
  const btn = document.createElement('button');
  btn.setAttribute('data-cy', 'ai-prompt-stop');
  document.body.appendChild(btn);
  observers.push(observeSubmitButton(document.body));
  document.body.appendChild(document.createElement('i')); // any mutation → checkAndEmit
  await flush();
}

describe('content/agents/replit.ts', () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let observers: Array<{ disconnect(): void }>;

  beforeEach(async () => {
    document.body.innerHTML = '';
    // The module's own auto-run bootstrap() (import-time side effect) keeps a
    // long-lived observer alive on document.body for the whole file (disposed once in
    // afterAll below). Clearing innerHTML above is itself a mutation it reacts to —
    // drain that notification against the outgoing spy before installing a fresh one,
    // so it can never land inside a later test's assertion window.
    await flush();
    postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    observers = [];
    // The response-stop dedup (shared across observeSubmitButton and
    // observeWorkedForLabel) is time-based, not identity/text-based like the file's
    // other module-scope dedups — different tests can genuinely run within the same
    // real-world dedup window and spuriously suppress each other without this reset.
    __resetResponseStopDedupForTests();
    // pendingEmptyMessages holds strong Element refs from prior tests' DOM, and
    // lastEmittedText's consecutive-collapse couples tests that reuse a prompt string.
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

  describe('observeUserMessages', () => {
    it('emits nexpath:prompt-captured with the rendered-markdown text when a user-message node is added', async () => {
      observers.push(observeUserMessages(document.body));
      document.body.appendChild(makeUserMessage('build a to do list app'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'build a to do list app', agent: 'replit' },
        window.location.origin,
      );
    });

    it('detects a user-message node nested inside a larger inserted subtree', async () => {
      observers.push(observeUserMessages(document.body));
      const wrapper = document.createElement('div');
      wrapper.appendChild(makeUserMessage('nested message'));
      document.body.appendChild(wrapper);
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'nested message' }),
        window.location.origin,
      );
    });

    it('does not emit for messages already present before the observer starts (prevents page-load/history replay)', async () => {
      // Simulates Replit's chat history already rendered in the DOM before the content
      // script attaches — this must never be replayed through the pipeline, matching
      // the src/ext-vscode chat-history-watcher.ts "primedTargets" guarantee.
      document.body.appendChild(makeUserMessage('old message from history'));
      observers.push(observeUserMessages(document.body));
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('still emits for genuinely new messages added after priming pre-existing history', async () => {
      document.body.appendChild(makeUserMessage('old message from history'));
      observers.push(observeUserMessages(document.body));
      await flush();
      postMessageSpy.mockClear();

      document.body.appendChild(makeUserMessage('brand new message'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'brand new message' }),
        window.location.origin,
      );
    });

    it('does not emit twice for the same node (dedup via WeakSet)', async () => {
      observers.push(observeUserMessages(document.body));
      const el = makeUserMessage('once only');
      document.body.appendChild(el);
      await flush();
      postMessageSpy.mockClear();

      // Re-triggering a mutation elsewhere must not re-emit for the already-seen node.
      document.body.appendChild(document.createElement('div'));
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('ignores an inserted node with no .rendered-markdown text', async () => {
      observers.push(observeUserMessages(document.body));
      const el = document.createElement('div');
      el.setAttribute('data-cy', 'user-message');
      document.body.appendChild(el);
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('ignores nodes unrelated to user-message', async () => {
      observers.push(observeUserMessages(document.body));
      document.body.appendChild(document.createElement('span'));
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('collapses a duplicate capture when the same text arrives via a brand-new DOM node shortly after (Replit loading-shell → hydrated-list swap)', async () => {
      // Confirmed live 2026-07-02: Replit re-creates the message element (new node
      // identity, same text) when its own page finishes loading, right after the
      // original was already captured — the WeakSet above can't catch this since
      // it's genuinely a different element. Simulate that: two separate elements,
      // identical text, inserted moments apart.
      observers.push(observeUserMessages(document.body));
      document.body.appendChild(makeUserMessage('how add a comment to this function'));
      await flush();
      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      document.body.appendChild(makeUserMessage('how add a comment to this function'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
    });

    it('collapses a duplicate re-render no matter how long the gap is (no fixed time window)', async () => {
      // Confirmed live 2026-07-02: a second, separate re-render duplicate was also
      // observed when the "Working" status label first appeared after submit — a
      // different trigger than the page-load swap above, with an unpredictable gap
      // (depends on Replit's own response latency). A fixed time window can't bound
      // this reliably, so the real fix has none — collapse holds regardless of delay.
      vi.useFakeTimers();
      try {
        observers.push(observeUserMessages(document.body));
        document.body.appendChild(makeUserMessage('run the tests'));
        await vi.advanceTimersByTimeAsync(0);
        expect(postMessageSpy).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(60_000);

        document.body.appendChild(makeUserMessage('run the tests'));
        await vi.advanceTimersByTimeAsync(0);

        expect(postMessageSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('still emits an identical text again once a genuinely different message has been captured in between', async () => {
      observers.push(observeUserMessages(document.body));

      document.body.appendChild(makeUserMessage('deploy the app'));
      await flush();
      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      document.body.appendChild(makeUserMessage('something else entirely'));
      await flush();
      expect(postMessageSpy).toHaveBeenCalledTimes(2);

      // The dedup guard only tracks the single most-recently emitted text, so a later,
      // deliberate resend of the original text is not mistaken for a re-render echo.
      document.body.appendChild(makeUserMessage('deploy the app'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('observeUserMessages — reconciliation sweep (shell-first render fix, 2026-07-03)', () => {
    // Root cause of "first prompt captured, every later prompt silently lost": Replit
    // can insert the user-message shell before filling .rendered-markdown, and the old
    // code marked the element seen while its text was still empty — permanently
    // consuming it. These tests cover the sweep that closes both that mode and the
    // missed-mutation mode.

    function makeEmptyShellMessage(): HTMLElement {
      const el = document.createElement('div');
      el.setAttribute('data-cy', 'user-message');
      const rendered = document.createElement('div');
      rendered.className = 'rendered-markdown';
      el.appendChild(rendered);
      return el;
    }

    it('captures a message whose text arrives only after the node was inserted (shell-first render)', async () => {
      vi.useFakeTimers();
      try {
        observers.push(observeUserMessages(document.body));

        const shell = makeEmptyShellMessage();
        document.body.appendChild(shell);
        await vi.advanceTimersByTimeAsync(0);
        expect(postMessageSpy).not.toHaveBeenCalled(); // empty at insert — parked, not consumed

        shell.querySelector('.rendered-markdown')!.innerHTML = '<p>add a delete button</p>';
        await vi.advanceTimersByTimeAsync(1500); // one sweep interval

        expect(postMessageSpy).toHaveBeenCalledWith(
          { type: 'nexpath:prompt-captured', promptText: 'add a delete button', agent: 'replit' },
          window.location.origin,
        );
        expect(postMessageSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('sweep captures a user-message the MutationObserver never saw at all', async () => {
      vi.useFakeTimers();
      const RealMutationObserver = globalThis.MutationObserver;
      try {
        class NoOpObserver {
          observe(): void { /* never calls back, on purpose */ }
          disconnect(): void { /* no-op */ }
        }
        vi.stubGlobal('MutationObserver', NoOpObserver as unknown as typeof MutationObserver);

        const observer = observeUserMessages(document.body);
        observers.push(observer);
        document.body.appendChild(makeUserMessage('missed by the observer'));
        await vi.advanceTimersByTimeAsync(1500);

        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({ promptText: 'missed by the observer' }),
          window.location.origin,
        );
      } finally {
        vi.stubGlobal('MutationObserver', RealMutationObserver);
        vi.useRealTimers();
      }
    });

    it('does not double-emit when both the observer and the sweep see the same message', async () => {
      vi.useFakeTimers();
      try {
        observers.push(observeUserMessages(document.body));
        document.body.appendChild(makeUserMessage('captured once only'));
        await vi.advanceTimersByTimeAsync(0); // observer path emits
        await vi.advanceTimersByTimeAsync(4500); // several sweeps pass over the same DOM

        expect(postMessageSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a shell whose text never arrives ages out and never emits', async () => {
      vi.useFakeTimers();
      try {
        observers.push(observeUserMessages(document.body));

        const shell = makeEmptyShellMessage();
        document.body.appendChild(shell);
        await vi.advanceTimersByTimeAsync(61_000); // past PENDING_EMPTY_MAX_AGE_MS — pruned

        shell.querySelector('.rendered-markdown')!.innerHTML = '<p>too late</p>';
        await vi.advanceTimersByTimeAsync(3000);

        expect(postMessageSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a parked shell removed from the DOM is dropped without emitting', async () => {
      vi.useFakeTimers();
      try {
        observers.push(observeUserMessages(document.body));

        const shell = makeEmptyShellMessage();
        document.body.appendChild(shell);
        await vi.advanceTimersByTimeAsync(0);
        shell.remove();
        shell.querySelector('.rendered-markdown')!.innerHTML = '<p>detached text</p>';
        await vi.advanceTimersByTimeAsync(3000);

        expect(postMessageSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('disconnect() stops the sweep too, not just the MutationObserver', async () => {
      vi.useFakeTimers();
      try {
        const observer = observeUserMessages(document.body);

        const shell = makeEmptyShellMessage();
        document.body.appendChild(shell);
        await vi.advanceTimersByTimeAsync(0);
        observer.disconnect();

        shell.querySelector('.rendered-markdown')!.innerHTML = '<p>after disconnect</p>';
        await vi.advanceTimersByTimeAsync(3000);

        expect(postMessageSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('sweep-captured re-render of the same still-most-recent text collapses via the consecutive dedup', async () => {
      vi.useFakeTimers();
      try {
        observers.push(observeUserMessages(document.body));
        document.body.appendChild(makeUserMessage('re-rendered prompt'));
        await vi.advanceTimersByTimeAsync(0);
        expect(postMessageSpy).toHaveBeenCalledTimes(1);

        // Replit re-creates the node (new identity, same text) — the sweep's
        // reconciliation pass must not re-emit it.
        document.body.appendChild(makeUserMessage('re-rendered prompt'));
        await vi.advanceTimersByTimeAsync(1500);

        expect(postMessageSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('observeUserMessages — render-path fallback (live-typed messages without .rendered-markdown, 2026-07-03)', () => {
    it('captures a user-message with no .rendered-markdown child via its own text content', async () => {
      observers.push(observeUserMessages(document.body));

      const el = document.createElement('div');
      el.setAttribute('data-cy', 'user-message');
      el.textContent = "make it's color beige";
      document.body.appendChild(el);
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: "make it's color beige" }),
        window.location.origin,
      );
    });

    it('a present-but-empty .rendered-markdown still parks (does not fall through to sibling UI text)', async () => {
      vi.useFakeTimers();
      try {
        observers.push(observeUserMessages(document.body));

        const el = document.createElement('div');
        el.setAttribute('data-cy', 'user-message');
        const rendered = document.createElement('div');
        rendered.className = 'rendered-markdown';
        el.appendChild(rendered);
        const timestamp = document.createElement('span');
        timestamp.textContent = 'Just now';
        el.appendChild(timestamp);
        document.body.appendChild(el);
        await vi.advanceTimersByTimeAsync(0);
        expect(postMessageSpy).not.toHaveBeenCalled(); // parked — 'Just now' must never be the prompt

        rendered.innerHTML = '<p>the real prompt text</p>';
        await vi.advanceTimersByTimeAsync(1500);

        expect(postMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({ promptText: 'the real prompt text' }),
          window.location.origin,
        );
        expect(postMessageSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('home-page prompt loss regression — REAL replit config, exact broken flow (live 2026-07-06)', () => {
    // The user typed a prompt in replit.com's HOME agent box: the composer channel
    // captured it and the funnel recorded the text, then the injector rejected the
    // delivery (no project context on the home path). Replit soft-navigated into the
    // auto-created repl WITHOUT a page load, so the SAME kit instance saw the
    // rendered user-message and collapsed it as a duplicate — the prompt was lost
    // and the session never started. The capture-rejected feedback must clear the
    // funnel so the workspace render re-captures it.
    function makeComposer(text: string): { composer: HTMLElement; button: HTMLElement } {
      const container = document.createElement('div');
      const composer = document.createElement('div');
      composer.className = 'cm-content';
      composer.setAttribute('contenteditable', 'true');
      const line = document.createElement('div');
      line.className = 'cm-line';
      line.textContent = text;
      composer.appendChild(line);
      const button = document.createElement('button');
      button.setAttribute('data-cy', 'ai-prompt-submit');
      container.appendChild(composer);
      container.appendChild(button);
      document.body.appendChild(container);
      return { composer, button };
    }

    it('re-captures the prompt from the workspace render after an upstream rejection', async () => {
      // 1. Home page: composer capture → funnel records the text.
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('what is ML');
      composer.querySelector('.cm-line')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'what is ML', agent: 'replit' },
        window.location.origin,
      );

      // 2. Injector rejects delivery (no project context on the home path). The
      //    rejection listener is registered by the module's auto-run bootstrap().
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'nexpath:capture-rejected', promptText: 'what is ML' },
        origin: window.location.origin,
        source: window,
      }));
      await flush();

      // 3. Workspace (same kit instance — soft navigation): the rendered user
      //    message MUST be captured, not collapsed as a duplicate.
      postMessageSpy.mockClear();
      observers.push(observeUserMessages(document.body));
      document.body.appendChild(makeUserMessage('what is ML'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'what is ML', agent: 'replit' },
        window.location.origin,
      );
    });

    it('WITHOUT a rejection the workspace render still collapses as a duplicate (funnel invariant unchanged)', async () => {
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('what is ML');
      composer.querySelector('.cm-line')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      postMessageSpy.mockClear();
      observers.push(observeUserMessages(document.body));
      document.body.appendChild(makeUserMessage('what is ML'));
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('observeComposerSubmit — source-side capture channel (2026-07-03)', () => {
    // Live-typed messages demonstrably don't match the history-confirmed message
    // selectors (sweep re-scanned for minutes without a hit) — this channel reads the
    // composer itself at submit time, independent of any message-render assumption.

    // Mirrors Replit's real prompt-box structure: the chat composer (CodeMirror) and
    // the agent submit button share a container — that adjacency is exactly how the
    // production code disambiguates the composer from Replit's CodeMirror file editors.
    function makeComposer(text: string): { composer: HTMLElement; button: HTMLElement } {
      const container = document.createElement('div');
      const composer = document.createElement('div');
      composer.className = 'cm-content';
      composer.setAttribute('contenteditable', 'true');
      for (const lineText of text === '' ? [''] : text.split('\n')) {
        const line = document.createElement('div');
        line.className = 'cm-line';
        line.textContent = lineText;
        composer.appendChild(line);
      }
      const button = document.createElement('button');
      button.setAttribute('data-cy', 'ai-prompt-submit');
      container.appendChild(composer);
      container.appendChild(button);
      document.body.appendChild(container);
      return { composer, button };
    }

    function pressEnter(target: Element, init: KeyboardEventInit = {}): void {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }));
    }

    it('captures the composer text on Enter inside the composer', () => {
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('build a login page');

      pressEnter(composer.querySelector('.cm-line')!);

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'build a login page', agent: 'replit' },
        window.location.origin,
      );
    });

    it('joins multi-line composer content with newlines', () => {
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('first line\nsecond line');

      pressEnter(composer);

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'first line\nsecond line' }),
        window.location.origin,
      );
    });

    it('does not capture on Shift+Enter (newline, not submit)', () => {
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('still typing');

      pressEnter(composer, { shiftKey: true });

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('does not capture Enter pressed outside the composer', () => {
      observers.push(observeComposerSubmit(document));
      makeComposer('composer text');
      const outside = document.createElement('input');
      document.body.appendChild(outside);

      pressEnter(outside);

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('does NOT capture Enter inside a CodeMirror FILE editor (no adjacent agent button)', () => {
      // Replit's code editors are CodeMirror too — Enter there is a newline in a file,
      // and its contents must never be emitted as a prompt.
      observers.push(observeComposerSubmit(document));
      makeComposer('the real chat composer');

      const editorPane = document.createElement('div');
      const fileEditor = document.createElement('div');
      fileEditor.className = 'cm-content';
      fileEditor.setAttribute('contenteditable', 'true');
      const codeLine = document.createElement('div');
      codeLine.className = 'cm-line';
      codeLine.textContent = 'const secret = process.env.API_KEY;';
      fileEditor.appendChild(codeLine);
      editorPane.appendChild(fileEditor);
      document.body.appendChild(editorPane);

      pressEnter(codeLine);

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('captures the composer text when the submit button is clicked (even via a child element)', () => {
      observers.push(observeComposerSubmit(document));
      const { button } = makeComposer('clicked to send');
      const icon = document.createElement('span');
      button.appendChild(icon);

      icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'clicked to send' }),
        window.location.origin,
      );
    });

    it('never captures the CodeMirror placeholder as a prompt', () => {
      observers.push(observeComposerSubmit(document));
      const { composer } = makeComposer('');
      const line = composer.querySelector('.cm-line')!;
      const placeholder = document.createElement('span');
      placeholder.className = 'cm-placeholder';
      placeholder.textContent = 'Message Agent…';
      line.appendChild(placeholder);

      pressEnter(composer);

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('the rendered-message echo of a composer-captured prompt collapses to one emission', async () => {
      observers.push(observeComposerSubmit(document));
      observers.push(observeUserMessages(document.body));
      const { composer } = makeComposer('same prompt both channels');

      pressEnter(composer);
      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      document.body.appendChild(makeUserMessage('same prompt both channels'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
    });

    it('captures on Enter while the agent is generating (submit button swapped for the stop button)', () => {
      // Real scenario: typing a follow-up prompt mid-generation. Replit replaces
      // data-cy="ai-prompt-submit" with data-cy="ai-prompt-stop" while generating
      // (confirmed live 2026-07-02), so findChatComposer's anchor must fall back to
      // the stop button when no submit button exists in the DOM at all.
      observers.push(observeComposerSubmit(document));
      const container = document.createElement('div');
      const composer = document.createElement('div');
      composer.className = 'cm-content';
      composer.setAttribute('contenteditable', 'true');
      const line = document.createElement('div');
      line.className = 'cm-line';
      line.textContent = 'follow-up while generating';
      composer.appendChild(line);
      const stopBtn = document.createElement('button');
      stopBtn.setAttribute('data-cy', 'ai-prompt-stop');
      container.append(composer, stopBtn);
      document.body.appendChild(container);

      pressEnter(line);

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'follow-up while generating' }),
        window.location.origin,
      );
    });

    it('falls back to the composer element textContent when no .cm-line children exist', () => {
      // readComposerText's lines.length === 0 branch — CodeMirror normally always
      // renders .cm-line children, but the fallback must hold if that structure
      // ever changes (same defensive posture as the rest of the capture channels).
      observers.push(observeComposerSubmit(document));
      const container = document.createElement('div');
      const composer = document.createElement('div');
      composer.className = 'cm-content';
      composer.setAttribute('contenteditable', 'true');
      composer.textContent = 'plain text, no line divs';
      const button = document.createElement('button');
      button.setAttribute('data-cy', 'ai-prompt-submit');
      container.append(composer, button);
      document.body.appendChild(container);

      pressEnter(composer);

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'plain text, no line divs' }),
        window.location.origin,
      );
    });

    it('disconnect() removes exactly the listeners it added', () => {
      // Asserted via listener bookkeeping on an isolated root rather than event
      // dispatch: the module's import-time auto-bootstrap keeps its own document-level
      // composer listener alive for the whole test file, so any DOM-routed event
      // would be captured by that instance regardless of this controller's state.
      const root = document.createElement('div');
      const addSpy = vi.spyOn(root, 'addEventListener');
      const removeSpy = vi.spyOn(root, 'removeEventListener');

      const controller = observeComposerSubmit(root);
      expect(addSpy).toHaveBeenCalledTimes(2);
      controller.disconnect();

      expect(removeSpy.mock.calls).toEqual(addSpy.mock.calls);
    });
  });

  describe('observeSubmitButton', () => {
    // Confirmed live 2026-07-02 (Elements-panel inspection): Replit does NOT toggle a
    // `disabled` attribute on the submit button to signal generation state — that
    // attribute reflects whether the input box is empty. While generating, Replit
    // swaps in a wholly different element, data-cy="ai-prompt-stop". Response-stop is
    // therefore detected by that stop button's presence being removed from the DOM.
    it('emits nexpath:response-stopped when the stop button is removed after being present', async () => {
      const stopBtn = makeStopButton();
      document.body.appendChild(stopBtn);
      observers.push(observeSubmitButton(document.body));

      stopBtn.remove();
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'replit' },
        window.location.origin,
      );
    });

    it('does not emit when the stop button appears (generation starting)', async () => {
      observers.push(observeSubmitButton(document.body));

      document.body.appendChild(makeStopButton());
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('does not emit on removal without a prior stop-button observation (observer attached after generation already ended)', async () => {
      observers.push(observeSubmitButton(document.body));

      // Some unrelated DOM churn must not spuriously fire.
      document.body.appendChild(document.createElement('span'));
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('handles a full generate cycle: stop button appears then disappears', async () => {
      observers.push(observeSubmitButton(document.body));

      const stopBtn = makeStopButton();
      document.body.appendChild(stopBtn);
      await flush();
      expect(postMessageSpy).not.toHaveBeenCalled();

      stopBtn.remove();
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'replit' },
        window.location.origin,
      );
    });

    it('also detects an attribute-based toggle, not just element add/remove (hardened 2026-07-03)', async () => {
      // Confirmed live 2026-07-02 that Replit swaps the whole element for short
      // responses, but response-stop silently stopped firing on longer, multi-action
      // responses in live testing 2026-07-03 — plausibly because some response types
      // toggle the stop button's matching attribute on a persistent element instead of
      // swapping it. The observer now watches attribute mutations too, so this must
      // fire even when the element is never added/removed, only its matching attribute
      // is toggled off.
      const stopBtn = makeStopButton();
      document.body.appendChild(stopBtn);
      observers.push(observeSubmitButton(document.body));

      stopBtn.removeAttribute('data-cy'); // no longer matches STOP_BUTTON_SELECTOR — element stays in the DOM
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'replit' },
        window.location.origin,
      );
    });

    it('the poll independently detects response-stop even when MutationObserver never fires (safety-net proof, 2026-07-03)', async () => {
      // Response-stop still failed to fire on longer, multi-action responses across two
      // separate MutationObserver-config attempts (childList, then childList+attributes)
      // — meaning the real DOM mechanism isn't understood with certainty and a third
      // specific mutation-type guess risks the same result. Stubs MutationObserver to a
      // total no-op (never invokes its callback for any mutation) to prove the polling
      // fallback alone — independent of any mutation-type assumption — still detects the
      // transition once the poll interval elapses.
      vi.useFakeTimers();
      const RealMutationObserver = globalThis.MutationObserver;
      try {
        class NoOpObserver {
          observe(): void { /* never calls back, on purpose */ }
          disconnect(): void { /* no-op */ }
        }
        vi.stubGlobal('MutationObserver', NoOpObserver as unknown as typeof MutationObserver);

        const stopBtn = makeStopButton();
        document.body.appendChild(stopBtn);
        const observer = observeSubmitButton(document.body);
        observers.push(observer);

        stopBtn.remove(); // the stubbed MutationObserver never reacts to this
        await vi.advanceTimersByTimeAsync(1500); // let the poll interval elapse

        expect(postMessageSpy).toHaveBeenCalledWith(
          { type: 'nexpath:response-stopped', agent: 'replit' },
          window.location.origin,
        );
      } finally {
        vi.stubGlobal('MutationObserver', RealMutationObserver);
        vi.useRealTimers();
      }
    });

    it('disconnect() stops the poll too, not just the MutationObserver', async () => {
      vi.useFakeTimers();
      try {
        const stopBtn = makeStopButton();
        document.body.appendChild(stopBtn);
        const observer = observeSubmitButton(document.body);

        observer.disconnect();
        stopBtn.remove();
        await vi.advanceTimersByTimeAsync(3000); // well past one poll interval

        expect(postMessageSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('observeWorkedForLabel — independent second response-stop signal (2026-07-03)', () => {
    // Three separate stop-button-based strategies all failed to reliably fire live —
    // this uses a completely different signal (Replit's own "Worked for X
    // seconds/minutes" completion label), confirmed by direct visual evidence across
    // every live test screenshot this session.
    it('emits nexpath:response-stopped when a "Worked for X seconds" label appears', async () => {
      await armTurnViaStopButton(observers);
      observers.push(observeWorkedForLabel(document.body));

      document.body.appendChild(makeWorkedForLabel('Worked for 13 seconds'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'replit' },
        window.location.origin,
      );
    });

    it('matches "Worked for X minutes" too, not just seconds', async () => {
      await armTurnViaStopButton(observers);
      observers.push(observeWorkedForLabel(document.body));

      document.body.appendChild(makeWorkedForLabel('Worked for 9 minutes'));
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'replit' },
        window.location.origin,
      );
    });

    it('detects the label nested inside a larger inserted subtree', async () => {
      await armTurnViaStopButton(observers);
      observers.push(observeWorkedForLabel(document.body));

      const wrapper = document.createElement('div');
      wrapper.appendChild(makeWorkedForLabel('Worked for 32 seconds'));
      document.body.appendChild(wrapper);
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'replit' },
        window.location.origin,
      );
    });

    it('ignores unrelated text that does not match the pattern', async () => {
      observers.push(observeWorkedForLabel(document.body));

      document.body.appendChild(makeWorkedForLabel('Working on it...'));
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('ignores a large container that merely happens to contain the phrase deep inside unrelated content', async () => {
      observers.push(observeWorkedForLabel(document.body));

      const container = document.createElement('div');
      container.textContent = 'A'.repeat(100) + ' Worked for 5 seconds ' + 'B'.repeat(100);
      document.body.appendChild(container);
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('response-stop dedup across independent detectors (2026-07-03)', () => {
    it('collapses near-simultaneous signals from both observeSubmitButton and observeWorkedForLabel into one emission', async () => {
      const stopBtn = makeStopButton();
      document.body.appendChild(stopBtn);
      observers.push(observeSubmitButton(document.body));
      observers.push(observeWorkedForLabel(document.body));

      stopBtn.remove();
      document.body.appendChild(makeWorkedForLabel('Worked for 13 seconds'));
      await flush();

      const matchingCalls = postMessageSpy.mock.calls.filter(
        (call) => (call[0] as { type?: string }).type === 'nexpath:response-stopped',
      );
      expect(matchingCalls).toHaveLength(1);
    });
  });

  describe('bootstrap', () => {
    beforeEach(() => {
      // The module auto-runs bootstrap() once at import time (top-level side effect),
      // which sets this flag — reset it so each test starts as if freshly injected.
      window.__nexpathReplitBootstrapped = undefined;
    });

    it('logs the capture tier (console.log, not .debug — Verbose is hidden by default in DevTools) and wires up all three observers', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      // beforeEach cleared the flag, so this bootstrap() really wires observers +
      // the poll — capture its teardown so afterEach disposes them (no leak).
      observers.push({ disconnect: bootstrap() });

      expect(logSpy).toHaveBeenCalledWith('[nexpath] capture: mutation-observer');

      document.body.appendChild(makeUserMessage('post-bootstrap message'));
      await flush();
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'post-bootstrap message' }),
        window.location.origin,
      );

      document.body.appendChild(makeWorkedForLabel('Worked for 7 seconds'));
      await flush();
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'replit' },
        window.location.origin,
      );

      logSpy.mockRestore();
    });

    it('is idempotent — a second bootstrap() call in the same page does not re-register observers (stale re-injection guard)', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      observers.push({ disconnect: bootstrap() }); // first call — real setup (capture to dispose)
      observers.push({ disconnect: bootstrap() }); // stale duplicate re-injection (no-op teardown)

      expect(logSpy).toHaveBeenCalledWith('[nexpath] capture: mutation-observer');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('skipped, already bootstrapped'),
      );

      postMessageSpy.mockClear();
      document.body.appendChild(makeUserMessage('should only be captured once'));
      await flush();

      // If the second bootstrap() had wired up a duplicate observer, this message would
      // have been posted twice (once per observer instance).
      const matchingCalls = postMessageSpy.mock.calls.filter(
        (call) => (call[0] as { promptText?: string }).promptText === 'should only be captured once',
      );
      expect(matchingCalls).toHaveLength(1);

      logSpy.mockRestore();
    });
  });
});
