// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCaptureKit, setComposerSubmitInterceptor, type CaptureKitConfig } from './capture-kit.js';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Deliberately NON-Replit selectors throughout this file: the kit's whole point is
// that the machinery works against whatever selectors an agent config supplies —
// these tests are the proof of that parameterization (Replit-shaped coverage lives
// in replit.test.ts, which exercises the same kit through the real Replit config).
// bootstrap() returns a teardown; every test captures it (into `teardowns`) so
// afterEach disconnects the observers AND clears observeStopButton's poll interval,
// leaving nothing wired to fire against a torn-down document after the test ends.
function makeConfig(overrides: Partial<CaptureKitConfig> = {}): CaptureKitConfig {
  return {
    agent: 'test-agent',
    captureTier: 'mutation-observer',
    bootstrapFlag: '__nexpathTestBootstrapped',
    userMessageSelector: '[data-testid="chat-msg"]',
    extractPromptText: (el) => (el.textContent ?? '').trim(),
    stopButtonSelector: '[data-testid="stop-btn"]',
    ...overrides,
  };
}

/**
 * Arm a turn the way real usage does: a prompt captured through the kit's own
 * funnel. The completion-label detector only counts labels that belong to a turn
 * there is evidence for (see `turnActive` in capture-kit.ts).
 */
async function armTurn(kit: ReturnType<typeof createCaptureKit>, selector = 'chat-msg'): Promise<void> {
  const observer = kit.observeUserMessages(document.body);
  const el = document.createElement('div');
  el.setAttribute('data-testid', selector);
  el.textContent = `armed turn ${Math.random()}`;
  document.body.appendChild(el);
  await flush();
  observer.disconnect();
}

describe('content/agents/capture-kit.ts', () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let observers: Array<{ disconnect(): void }>;
  let teardowns: Array<() => void>;

  beforeEach(async () => {
    document.body.innerHTML = '';
    await flush();
    postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    observers = [];
    teardowns = [];
  });

  afterEach(() => {
    observers.forEach((o) => o.disconnect());
    teardowns.forEach((t) => t());
    postMessageSpy.mockRestore();
  });

  describe('observeRenderedMessages flag (Lovable re-render fix, live 2026-07-06)', () => {
    // Each unique bootstrapFlag makes bootstrap()'s idempotency guard independent.
    it('bootstrap() WIRES the rendered-message observer by default (Bolt/Replit behavior unchanged)', async () => {
      const kit = createCaptureKit(makeConfig({
        bootstrapFlag: '__nexpathObsDefault', userMessageSelector: '[data-testid="m"]',
      }));
      teardowns.push(kit.bootstrap());
      await flush();

      // A user message inserted after bootstrap must be captured (observer live).
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'm');
      el.textContent = 'a fresh prompt';
      document.body.appendChild(el);
      await flush();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'nexpath:prompt-captured', promptText: 'a fresh prompt' }),
        window.location.origin,
      );
    });

    it('bootstrap() does NOT wire the rendered-message observer when observeRenderedMessages:false', async () => {
      const kit = createCaptureKit(makeConfig({
        bootstrapFlag: '__nexpathObsOff', observeRenderedMessages: false,
        userMessageSelector: '[data-testid="m2"]',
      }));
      teardowns.push(kit.bootstrap());
      await flush();

      // An inserted (re-rendered) message must NOT be captured — this is the flood
      // Lovable hit: re-created history nodes re-captured every sweep.
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'm2');
      el.textContent = 'a re-rendered history message';
      document.body.appendChild(el);
      await flush();

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('with the observer off, composer + fetch of the SAME prompt still collapse to ONE emit', async () => {
      const kit = createCaptureKit(makeConfig({
        bootstrapFlag: '__nexpathObsOff2', observeRenderedMessages: false,
        userMessageSelector: '[data-testid="m3"]',
        composer: {
          composerSelector: '.tiptap.ProseMirror',
          submitButtonSelector: 'button[aria-label="Send message"]',
          readComposerText: (el) => Array.from(el.querySelectorAll('p'), (p) => p.textContent ?? '').join('\n').trim(),
        },
        listenForFetchPrompts: true,
      }));
      observers.push(kit.observeComposerSubmit(document));
      observers.push(kit.observeFetchPrompts(window));

      const container = document.createElement('div');
      const composer = document.createElement('div');
      composer.className = 'tiptap ProseMirror';
      composer.setAttribute('contenteditable', 'true');
      const para = document.createElement('p');
      para.textContent = 'ship it now';
      composer.appendChild(para);
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Send message');
      container.append(composer, btn);
      document.body.appendChild(container);

      // Composer submit, then the page's fetch of the same text.
      para.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'nexpath:fetch-prompt', promptText: 'ship it now', agent: 'test-agent' },
        origin: window.location.origin, source: window,
      }));

      const captured = postMessageSpy.mock.calls.filter(
        (c) => (c[0] as { type?: string })?.type === 'nexpath:prompt-captured',
      );
      expect(captured).toHaveLength(1);
    });

    it('composer + fetch of the same prompt with DIFFERENT whitespace still collapse to ONE emit (F1, live 2026-08-29)', async () => {
      // The live double-bill: the composer read joins paragraphs with '\n' while
      // the page's fetch body carries the same words with different line breaks —
      // exact-match dedup let both through and the pipeline billed the turn twice.
      const kit = createCaptureKit(makeConfig({
        bootstrapFlag: '__nexpathObsOff3', observeRenderedMessages: false,
        userMessageSelector: '[data-testid="m4"]',
        composer: {
          composerSelector: '.tiptap.ProseMirror',
          submitButtonSelector: 'button[aria-label="Send message"]',
          readComposerText: (el) => Array.from(el.querySelectorAll('p'), (p) => p.textContent ?? '').join('\n').trim(),
        },
        listenForFetchPrompts: true,
      }));
      observers.push(kit.observeComposerSubmit(document));
      observers.push(kit.observeFetchPrompts(window));

      const container = document.createElement('div');
      const composer = document.createElement('div');
      composer.className = 'tiptap ProseMirror';
      composer.setAttribute('contenteditable', 'true');
      const p1 = document.createElement('p');
      p1.textContent = 'My original request:';
      const p2 = document.createElement('p');
      p2.textContent = 'ship it now';
      composer.append(p1, p2);
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Send message');
      container.append(composer, btn);
      document.body.appendChild(container);

      // Composer reads 'My original request:\nship it now'; the fetch body carries
      // the same words re-serialized with a blank line and a trailing newline.
      p1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'nexpath:fetch-prompt', promptText: 'My original request:\n\nship it now\n', agent: 'test-agent' },
        origin: window.location.origin, source: window,
      }));

      const captured = postMessageSpy.mock.calls.filter(
        (c) => (c[0] as { type?: string })?.type === 'nexpath:prompt-captured',
      );
      expect(captured).toHaveLength(1);
    });
  });

  it('carries the configured agent id in prompt-captured messages', async () => {
    const kit = createCaptureKit(makeConfig({ agent: 'bolt', userMessageSelector: '[data-testid="bolt-msg"]' }));
    observers.push(kit.observeUserMessages(document.body));

    const el = document.createElement('div');
    el.setAttribute('data-testid', 'bolt-msg');
    el.textContent = 'build a landing page';
    document.body.appendChild(el);
    await flush();

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'nexpath:prompt-captured', promptText: 'build a landing page', agent: 'bolt' },
      window.location.origin,
    );
  });

  it('captures via a fully custom message selector and extractPromptText', async () => {
    const kit = createCaptureKit(
      makeConfig({
        userMessageSelector: 'article.user-turn',
        extractPromptText: (el) => (el.querySelector('.body')?.textContent ?? '').trim(),
      }),
    );
    observers.push(kit.observeUserMessages(document.body));

    const el = document.createElement('article');
    el.className = 'user-turn';
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = 'the actual prompt';
    el.appendChild(body);
    const meta = document.createElement('span');
    meta.textContent = 'Just now';
    el.appendChild(meta);
    document.body.appendChild(el);
    await flush();

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ promptText: 'the actual prompt' }),
      window.location.origin,
    );
  });

  it('two kit instances have independent consecutive-text dedup state', async () => {
    const kitA = createCaptureKit(makeConfig({ agent: 'agent-a', userMessageSelector: '[data-testid="a-msg"]' }));
    const kitB = createCaptureKit(makeConfig({ agent: 'agent-b', userMessageSelector: '[data-testid="b-msg"]' }));
    observers.push(kitA.observeUserMessages(document.body), kitB.observeUserMessages(document.body));

    for (const testid of ['a-msg', 'b-msg']) {
      const el = document.createElement('div');
      el.setAttribute('data-testid', testid);
      el.textContent = 'same text on both agents';
      document.body.appendChild(el);
    }
    await flush();

    // If dedup state were module-level (as it was pre-extraction), the second
    // agent's identical text would be swallowed by the first agent's guard.
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'agent-a' }),
      window.location.origin,
    );
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'agent-b' }),
      window.location.origin,
    );
  });

  it('two kit instances have independent response-stop time dedup', async () => {
    const kitA = createCaptureKit(makeConfig({ agent: 'agent-a', stopButtonSelector: '[data-testid="a-stop"]' }));
    const kitB = createCaptureKit(makeConfig({ agent: 'agent-b', stopButtonSelector: '[data-testid="b-stop"]' }));

    const stopA = document.createElement('button');
    stopA.setAttribute('data-testid', 'a-stop');
    const stopB = document.createElement('button');
    stopB.setAttribute('data-testid', 'b-stop');
    document.body.append(stopA, stopB);
    await flush();

    observers.push(kitA.observeStopButton(document.body), kitB.observeStopButton(document.body));
    stopA.remove();
    stopB.remove();
    await flush();

    const stoppedAgents = postMessageSpy.mock.calls
      .map(([msg]) => msg as { type: string; agent: string })
      .filter((msg) => msg.type === 'nexpath:response-stopped')
      .map((msg) => msg.agent);
    expect(stoppedAgents).toContain('agent-a');
    expect(stoppedAgents).toContain('agent-b');
  });

  it('completion label detection uses the configured pattern and log line', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const kit = createCaptureKit(
        makeConfig({
          agent: 'lovable',
          completionLabel: {
            pattern: /\bFinished in\s+\d/,
            maxTextLength: 60,
            log: '[nexpath] response-stop detected (custom label)',
          },
        }),
      );
      observers.push(kit.observeCompletionLabel(document.body));
      // A label only counts for a turn we have evidence for — arm one the way a
      // real submit does (see the turnActive gate in capture-kit.ts).
      await armTurn(kit);

      const label = document.createElement('span');
      label.textContent = 'Finished in 12 seconds';
      document.body.appendChild(label);
      await flush();

      expect(logSpy).toHaveBeenCalledWith('[nexpath] response-stop detected (custom label)');
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:response-stopped', agent: 'lovable' },
        window.location.origin,
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it('observeComposerSubmit throws when the config has no composer section', () => {
    const kit = createCaptureKit(makeConfig());
    expect(() => kit.observeComposerSubmit(document)).toThrow(/composer config/);
  });

  it('observeCompletionLabel throws when the config has no completionLabel section', () => {
    const kit = createCaptureKit(makeConfig());
    expect(() => kit.observeCompletionLabel(document.body)).toThrow(/completionLabel config/);
  });

  it('composer capture works against fully custom composer/submit selectors', () => {
    const kit = createCaptureKit(
      makeConfig({
        agent: 'bolt',
        stopButtonSelector: '[data-testid="kit-cc-stop"]',
        composer: {
          composerSelector: '[data-testid="kit-cc-editor"]',
          submitButtonSelector: '[data-testid="kit-cc-send"]',
          readComposerText: (input) => (input.textContent ?? '').trim(),
        },
      }),
    );
    observers.push(kit.observeComposerSubmit(document));

    const container = document.createElement('div');
    const editor = document.createElement('div');
    editor.setAttribute('data-testid', 'kit-cc-editor');
    editor.textContent = 'ship it';
    const send = document.createElement('button');
    send.setAttribute('data-testid', 'kit-cc-send');
    container.append(editor, send);
    document.body.appendChild(container);

    send.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'nexpath:prompt-captured', promptText: 'ship it', agent: 'bolt' },
      window.location.origin,
    );
  });

  describe('the submit-time gate hook', () => {
    function wireComposer(intercept: (ev: Event) => boolean): HTMLElement {
      setComposerSubmitInterceptor((ev) => intercept(ev));
      const kit = createCaptureKit(
        makeConfig({
          agent: 'bolt',
          stopButtonSelector: '[data-testid="kit-gate-stop"]',
          composer: {
            composerSelector: '[data-testid="kit-gate-editor"]',
            submitButtonSelector: '[data-testid="kit-gate-send"]',
            readComposerText: (input) => (input.textContent ?? '').trim(),
          },
        }),
      );
      observers.push(kit.observeComposerSubmit(document));

      const container = document.createElement('div');
      const editor = document.createElement('div');
      editor.setAttribute('data-testid', 'kit-gate-editor');
      editor.textContent = 'ship it to production';
      const send = document.createElement('button');
      send.setAttribute('data-testid', 'kit-gate-send');
      container.append(editor, send);
      document.body.appendChild(container);
      return send;
    }

    afterEach(() => { setComposerSubmitInterceptor(() => false); });

    it('CAPTURES THE PROMPT EVEN WHEN THE GATE TAKES OVER — the pipeline must never be starved', () => {
      // The gate cancels the submission, so the site never issues its request and
      // the composer read is the ONLY channel that will see this prompt. If capture
      // is skipped, no enhancement is ever prepared and the popup cannot appear.
      const send = wireComposer(() => true);
      send.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'ship it to production', agent: 'bolt' },
        window.location.origin,
      );
    });

    it('captures BEFORE handing the event to the gate', () => {
      const order: string[] = [];
      const send = wireComposer(() => { order.push('gate'); return true; });
      postMessageSpy.mockImplementation(() => { order.push('capture'); });
      send.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(order).toEqual(['capture', 'gate']);
    });

    it('captures on the ENTER path too, even when the gate takes over', () => {
      const send = wireComposer(() => true);
      const editor = document.querySelector<HTMLElement>('[data-testid="kit-gate-editor"]')!;
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'ship it to production' }),
        window.location.origin,
      );
      expect(send).toBeTruthy();
    });

    it('captures normally when the gate declines', () => {
      const send = wireComposer(() => false);
      send.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'ship it to production' }),
        window.location.origin,
      );
    });

    it('a gate that THROWS cannot stop capture', () => {
      const send = wireComposer(() => { throw new Error('gate exploded'); });
      expect(() => send.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'ship it to production' }),
        window.location.origin,
      );
    });
  });

  describe('observeCaptureRejections — undelivered prompts must be re-capturable', () => {
    function dispatchRejection(promptText: string): void {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'nexpath:capture-rejected', promptText },
          origin: window.location.origin,
          source: window,
        }),
      );
    }

    function dispatchFetchPromptFor(agent: string, promptText: string): void {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'nexpath:fetch-prompt', promptText, agent },
          origin: window.location.origin,
          source: window,
        }),
      );
    }

    it('a rejected prompt is cleared from the funnel so the SAME text can be re-captured (the lost landing-prompt bug, live 2026-07-06)', () => {
      const kit = createCaptureKit(makeConfig({ agent: 'bolt' }));
      observers.push(kit.observeFetchPrompts(window));
      observers.push(kit.observeCaptureRejections(window));

      // Landing page: composer channel captures → funnel records the text.
      dispatchFetchPromptFor('bolt', 'make me an invoice website');
      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      // Injector had no project context → rejected the delivery.
      dispatchRejection('make me an invoice website');

      // Project page (same kit instance — Bolt soft-navigates): the /api/chat/v2
      // re-send of the exact same text MUST emit again, not collapse as a dup.
      postMessageSpy.mockClear();
      dispatchFetchPromptFor('bolt', 'make me an invoice website');
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'make me an invoice website', agent: 'bolt' },
        window.location.origin,
      );
    });

    it('ignores a capture-rejected message from a foreign origin (funnel record stays intact)', () => {
      const kit = createCaptureKit(makeConfig({ agent: 'bolt' }));
      observers.push(kit.observeFetchPrompts(window));
      observers.push(kit.observeCaptureRejections(window));

      dispatchFetchPromptFor('bolt', 'prompt one');
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'nexpath:capture-rejected', promptText: 'prompt one' },
          origin: 'https://evil.example.com',
          source: window,
        }),
      );

      postMessageSpy.mockClear();
      dispatchFetchPromptFor('bolt', 'prompt one');
      expect(postMessageSpy).not.toHaveBeenCalled(); // still deduped — foreign rejection had no effect
    });

    it('a rejection for a DIFFERENT text leaves the funnel record intact (identical re-send still collapses)', () => {
      const kit = createCaptureKit(makeConfig({ agent: 'bolt' }));
      observers.push(kit.observeFetchPrompts(window));
      observers.push(kit.observeCaptureRejections(window));

      dispatchFetchPromptFor('bolt', 'prompt one');
      dispatchRejection('a totally different prompt');

      postMessageSpy.mockClear();
      dispatchFetchPromptFor('bolt', 'prompt one');
      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('observeFetchPrompts — transport channel', () => {
    function dispatchFetchPrompt(promptText: string, agent: string, origin = window.location.origin): void {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'nexpath:fetch-prompt', promptText, agent },
          origin,
          source: window,
        }),
      );
    }

    it('routes a matching fetch-prompt through the funnel with this kit agent id', () => {
      const kit = createCaptureKit(makeConfig({ agent: 'bolt' }));
      observers.push(kit.observeFetchPrompts(window));

      dispatchFetchPrompt('deploy the app', 'bolt');

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'nexpath:prompt-captured', promptText: 'deploy the app', agent: 'bolt' },
        window.location.origin,
      );
    });

    it('ignores fetch-prompts addressed to a different agent', () => {
      const kit = createCaptureKit(makeConfig({ agent: 'bolt' }));
      observers.push(kit.observeFetchPrompts(window));

      dispatchFetchPrompt('someone else', 'lovable');

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('ignores messages from a foreign origin', () => {
      const kit = createCaptureKit(makeConfig({ agent: 'bolt' }));
      observers.push(kit.observeFetchPrompts(window));

      dispatchFetchPrompt('injected from elsewhere', 'bolt', 'https://evil.example');

      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('shares the consecutive-identical collapse with the other channels', async () => {
      const kit = createCaptureKit(
        makeConfig({ agent: 'bolt', userMessageSelector: '[data-testid="kit-fp-msg"]' }),
      );
      observers.push(kit.observeFetchPrompts(window), kit.observeUserMessages(document.body));

      dispatchFetchPrompt('one prompt', 'bolt');
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'kit-fp-msg');
      el.textContent = 'one prompt';
      document.body.appendChild(el);
      await flush();

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('bootstrap guards on the configured window flag and only wires configured channels', async () => {
    const flag = '__nexpathKitBootstrapTest';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // Minimal config: no composer, no completionLabel — bootstrap must not throw
      // for channels the agent didn't configure.
      const kit = createCaptureKit(
        makeConfig({
          bootstrapFlag: flag,
          userMessageSelector: '[data-testid="kit-bs-msg"]',
          stopButtonSelector: '[data-testid="kit-bs-stop"]',
        }),
      );
      teardowns.push(kit.bootstrap());
      expect((window as unknown as Record<string, boolean>)[flag]).toBe(true);
      expect(logSpy).toHaveBeenCalledWith('[nexpath] capture: mutation-observer');

      // Second bootstrap (stale re-injection) is a logged no-op.
      logSpy.mockClear();
      teardowns.push(kit.bootstrap());
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('skipped, already bootstrapped in this page'),
      );

      // The configured message channel is live after bootstrap.
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'kit-bs-msg');
      el.textContent = 'post-bootstrap capture';
      document.body.appendChild(el);
      await flush();
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ promptText: 'post-bootstrap capture' }),
        window.location.origin,
      );
    } finally {
      logSpy.mockRestore();
      delete (window as unknown as Record<string, boolean | undefined>)[flag];
    }
  });

  it('the teardown bootstrap() returns disconnects the channels and clears the guard', async () => {
    const flag = '__nexpathKitTeardownTest';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const kit = createCaptureKit(makeConfig({
        bootstrapFlag: flag, userMessageSelector: '[data-testid="teardown-msg"]',
      }));

      const teardown = kit.bootstrap();
      expect((window as unknown as Record<string, boolean>)[flag]).toBe(true);

      // Tear down — must disconnect the rendered-message observer AND (the reason
      // this exists) leave nothing that reacts to the DOM after this point. This is
      // what removes the post-test "document is not defined" observer/poll firing.
      teardown();
      expect((window as unknown as Record<string, boolean | undefined>)[flag]).toBe(false);

      // A message inserted AFTER teardown must NOT be captured — the observer is gone.
      postMessageSpy.mockClear();
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'teardown-msg');
      el.textContent = 'inserted after teardown';
      document.body.appendChild(el);
      await flush();
      expect(postMessageSpy).not.toHaveBeenCalled();

      // Guard cleared ⇒ a fresh bootstrap() legitimately re-wires (not a stale no-op).
      logSpy.mockClear();
      teardowns.push(kit.bootstrap());
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('skipped, already bootstrapped in this page'),
      );
    } finally {
      logSpy.mockRestore();
      delete (window as unknown as Record<string, boolean | undefined>)[flag];
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phantom response-stop (live 2026-08-25/26: a PE popup opened on a freshly
// loaded Bolt project with NO prompt sent). The completion-label detector
// matches text that also exists throughout the transcript's history, and
// content scripts attach at document_idle — so hydration / scroll-back /
// virtualised re-inserts of OLD rows fired a response-stop with no turn behind
// it. These pin the `turnActive` gate.
// ─────────────────────────────────────────────────────────────────────────────
describe('completion label requires an ACTIVE turn (phantom response-stop fix)', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  const obs: Array<{ disconnect(): void }> = [];

  beforeEach(async () => {
    document.body.innerHTML = '';
    await flush();
    spy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  });
  afterEach(() => {
    obs.forEach((o) => o.disconnect());
    obs.length = 0;
    spy.mockRestore();
  });

  const labelConfig = {
    agent: 'bolt',
    completionLabel: {
      pattern: /\bVersion \d+ at\b/,
      maxTextLength: 50,
      log: '[nexpath] response-stop detected (Version card appeared)',
    },
  } as Partial<CaptureKitConfig>;

  function addLabel(text = 'Version 3 at 10:42'): void {
    const el = document.createElement('span');
    el.textContent = text;
    document.body.appendChild(el);
  }
  const stops = (): unknown[] =>
    spy.mock.calls.map((c) => c[0]).filter((m) => (m as { type?: string })?.type === 'nexpath:response-stopped');

  it('a historical label on a freshly loaded page emits NOTHING', async () => {
    const kit = createCaptureKit(makeConfig(labelConfig));
    obs.push(kit.observeCompletionLabel(document.body));

    addLabel();                      // transcript history rendering after document_idle
    addLabel('Version 2 at 09:15');
    await flush();

    expect(stops()).toHaveLength(0);
  });

  it('a label AFTER a captured prompt emits the stop', async () => {
    const kit = createCaptureKit(makeConfig(labelConfig));
    obs.push(kit.observeCompletionLabel(document.body));
    await armTurn(kit);

    addLabel();
    await flush();

    expect(stops()).toHaveLength(1);
  });

  it('the stop button being present arms the label detector (turns whose prompt we never captured)', async () => {
    const kit = createCaptureKit(makeConfig(labelConfig));
    const btn = document.createElement('div');
    btn.setAttribute('data-testid', 'stop-btn');
    document.body.appendChild(btn);
    obs.push(kit.observeStopButton(document.body));      // observes "generating"
    obs.push(kit.observeCompletionLabel(document.body));
    document.body.appendChild(document.createElement('i')); // any mutation → checkAndEmit
    await flush();

    addLabel();
    await flush();

    expect(stops().length).toBeGreaterThanOrEqual(1);
  });

  it('after a stop is emitted, later labels do NOT re-fire until a new turn arms one', async () => {
    const kit = createCaptureKit(makeConfig(labelConfig));
    obs.push(kit.observeCompletionLabel(document.body));
    await armTurn(kit);
    addLabel();
    await flush();
    const afterFirst = stops().length;
    expect(afterFirst).toBe(1);

    addLabel('Version 9 at 11:11');   // e.g. the user scrolls back later
    await flush();

    expect(stops()).toHaveLength(afterFirst); // the turn is over — no new stop
  });
});
