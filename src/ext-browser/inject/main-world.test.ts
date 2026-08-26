import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Import main-world with the fetch gate's ownership set explicitly.
 *
 * `vi.resetModules()` gives every test a FRESH module registry, so the strategy
 * table must be set on the same fresh instance main-world just imported —
 * mutating a statically-imported copy touches a different object entirely.
 *
 * Bolt and Lovable ship on the COMPOSER mechanism, so the fetch patch does not
 * gate them. The fetch-gate path is still shipped code (it is the right
 * mechanism for a site that neither renders optimistically nor times out), so
 * these tests opt it back on; the final describe pins the shipped default.
 */
async function loadMainWorld(
  fetchGate: 'body_rewrite' | 'composer_intercept' = 'body_rewrite',
): Promise<typeof import('./main-world.js')> {
  const mod = await import('./main-world.js');
  const sub = await import('./submit-substitution.js');
  sub.SITE_SUBSTITUTION_STRATEGY['bolt'] = fetchGate;
  sub.SITE_SUBSTITUTION_STRATEGY['lovable'] = fetchGate;
  return mod;
}

/**
 * main-world.ts patches window.fetch and emits postMessage events.
 * We test the emit helpers in isolation using mocked globals.
 */

describe('main-world emit helpers', () => {
  const postMessageSpy = vi.fn();

  beforeEach(() => {
    postMessageSpy.mockClear();
    vi.stubGlobal('window', {
      postMessage: postMessageSpy,
      fetch: vi.fn(),
      location: { origin: 'https://replit.com' },
      // Real pages always have this; the stub needs it because main-world.ts now
      // also installs the submit-flow listener at module scope.
      addEventListener: vi.fn(),
    });
    vi.resetModules();
  });

  it('emitPromptCaptured posts to location.origin (not *)', async () => {
    const { emitPromptCaptured } = await loadMainWorld();
    emitPromptCaptured('write some code', 'replit');
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'nexpath:prompt-captured', promptText: 'write some code', agent: 'replit' },
      'https://replit.com',
    );
  });

  it('emitResponseStopped posts to location.origin (not *)', async () => {
    const { emitResponseStopped } = await loadMainWorld();
    emitResponseStopped('bolt');
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'nexpath:response-stopped', agent: 'bolt' },
      'https://replit.com',
    );
  });

  it('exposes __nexpath_emit_prompt__ on globalThis', async () => {
    await loadMainWorld();
    expect(typeof (globalThis as Record<string, unknown>)['__nexpath_emit_prompt__']).toBe('function');
  });

  it('exposes __nexpath_emit_stopped__ on globalThis', async () => {
    await loadMainWorld();
    expect(typeof (globalThis as Record<string, unknown>)['__nexpath_emit_stopped__']).toBe('function');
  });

  it('exposes __nexpath_native_fetch__ on globalThis', async () => {
    await loadMainWorld();
    expect(typeof (globalThis as Record<string, unknown>)['__nexpath_native_fetch__']).toBe('function');
  });

  it('patches window.fetch', async () => {
    const originalFetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('window', {
      postMessage: postMessageSpy,
      fetch: originalFetch,
      location: { origin: 'https://replit.com' },
    });
    vi.resetModules();

    await loadMainWorld();
    // After patching, window.fetch should be a different function (the patchedFetch wrapper)
    // but still callable — it should pass through to the native fetch
    expect(window.fetch).not.toBe(originalFetch);
    expect(typeof window.fetch).toBe('function');
  });
});

describe('fetch capture rules (B4 — Bolt transport, recon-confirmed)', () => {
  const postMessageSpy = vi.fn();

  /**
   * Asserts NO PROMPT WAS CAPTURED — which is what every caller of this actually
   * means. Not "postMessage was never called": main-world.ts also posts the
   * submit-flow readiness request at module load, which has nothing to do with
   * capture, so a blanket never-called assertion would fail for the wrong reason.
   */
  function expectNoCapture(): void {
    const captureTypes = ['nexpath:fetch-prompt', 'nexpath:prompt-captured', 'nexpath:response-stopped'];
    const posted = postMessageSpy.mock.calls
      .map((c) => (c[0] as { type?: unknown } | null)?.type)
      .filter((t): t is string => typeof t === 'string');
    expect(posted.filter((t) => captureTypes.includes(t))).toEqual([]);
  }
  const nativeFetch = vi.fn().mockResolvedValue({ ok: true } as unknown as Response);

  /**
   * Captures the message listeners main-world.ts registers, so a test can drive
   * the switch push and exercise BOTH switch positions of patchedFetch — the
   * only way to prove the disarmed path is unchanged behaviourally rather than
   * by reading the source.
   */
  let listeners: Array<(ev: MessageEvent) => void> = [];

  function stubWindow(hostname: string): void {
    listeners = [];
    const win = {
      postMessage: postMessageSpy,
      fetch: nativeFetch,
      location: { origin: `https://${hostname}`, hostname },
      addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
        if (type === 'message') listeners.push(cb);
      },
    };
    vi.stubGlobal('window', win);
  }

  /** Arm the page-world switch exactly as the content-script bridge would. */
  function armSwitch(): void {
    const win = globalThis.window as unknown as Window;
    for (const cb of [...listeners]) {
      cb({ data: { type: 'nexpath:submit-flow', enabled: true, source: 'default_on', seq: 1 }, source: win } as MessageEvent);
    }
  }

  function postedEvents(): string[] {
    return postMessageSpy.mock.calls
      .map((c) => c[0] as { type?: string; event?: string } | null)
      .filter((m) => m?.type === 'nexpath:submit-flow-event')
      .map((m) => m!.event as string);
  }

  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    postMessageSpy.mockClear();
    nativeFetch.mockClear();
    vi.resetModules();
  });

  describe('extractLastUserMessage', () => {
    it('extracts the newest user message content from an AI-SDK messages body', async () => {
      stubWindow('bolt.new');
      const { extractLastUserMessage } = await loadMainWorld();
      const body = JSON.stringify({
        messages: [
          { role: 'user', content: 'older prompt' },
          { role: 'assistant', content: 'reply' },
          { role: 'user', content: 'what is supervised learning exactly' },
        ],
        projectId: '123',
      });
      expect(extractLastUserMessage(body)).toBe('what is supervised learning exactly');
    });

    it('walks backwards past trailing non-user entries', async () => {
      stubWindow('bolt.new');
      const { extractLastUserMessage } = await loadMainWorld();
      const body = JSON.stringify({
        messages: [
          { role: 'user', content: 'the real prompt' },
          { role: 'assistant', content: 'streaming placeholder' },
        ],
      });
      expect(extractLastUserMessage(body)).toBe('the real prompt');
    });

    it('returns null for non-string content, missing messages, whitespace-only, and invalid JSON', async () => {
      stubWindow('bolt.new');
      const { extractLastUserMessage } = await loadMainWorld();
      expect(extractLastUserMessage(JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'text' }] }] }))).toBeNull();
      expect(extractLastUserMessage(JSON.stringify({ notMessages: true }))).toBeNull();
      expect(extractLastUserMessage(JSON.stringify({ messages: [{ role: 'user', content: '   ' }] }))).toBeNull();
      expect(extractLastUserMessage('not json at all')).toBeNull();
    });
  });

  describe('extractLovableMessage — strict body-shape guard (B5)', () => {
    it('extracts the flat message field when id starts with umsg_', async () => {
      const { extractLovableMessage } = await loadMainWorld();
      expect(extractLovableMessage(JSON.stringify({ id: 'umsg_01kwv', message: 'make it responsive', files: [] })))
        .toBe('make it responsive');
    });

    it('returns null when id is missing or not a umsg_ id (lookalike payloads)', async () => {
      const { extractLovableMessage } = await loadMainWorld();
      expect(extractLovableMessage(JSON.stringify({ message: 'no id at all' }))).toBeNull();
      expect(extractLovableMessage(JSON.stringify({ id: 'amsg_x', message: 'assistant-shaped' }))).toBeNull();
    });

    it('returns null for empty messages and non-JSON bodies', async () => {
      const { extractLovableMessage } = await loadMainWorld();
      expect(extractLovableMessage(JSON.stringify({ id: 'umsg_1', message: '   ' }))).toBeNull();
      expect(extractLovableMessage('not-json{{{')).toBeNull();
    });
  });

  it('captures Lovable POST api.lovable.dev/projects/<id>/chat via the pathEndsWith-pinned rule', async () => {
    stubWindow('lovable.dev');
    await loadMainWorld();

    void window.fetch('https://api.lovable.dev/projects/21239a50-abc/chat', {
      method: 'POST',
      body: JSON.stringify({ id: 'umsg_01kwv', message: 'make the cards responsive' }),
    });
    await flush();

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'nexpath:fetch-prompt', promptText: 'make the cards responsive', agent: 'lovable' },
      'https://lovable.dev',
    );
  });

  it('ignores Lovable sibling endpoints whose pathname does not END in /chat', async () => {
    stubWindow('lovable.dev');
    await loadMainWorld();

    void window.fetch('https://api.lovable.dev/projects/21239a50-abc/chat-history', {
      method: 'POST',
      body: JSON.stringify({ id: 'umsg_01kwv', message: 'should not capture' }),
    });
    void window.fetch('https://api.lovable.dev/projects/21239a50-abc/sandbox/extend-lease', {
      method: 'POST',
      body: JSON.stringify({ id: 'umsg_01kwv', message: 'nor this' }),
    });
    await flush();

    expectNoCapture();
  });

  it('declares a bolt rule for the /api/chat/v2 generation endpoint only', async () => {
    stubWindow('bolt.new');
    const { FETCH_CAPTURE_RULES } = await loadMainWorld();
    const bolt = FETCH_CAPTURE_RULES.find((r) => r.agent === 'bolt');
    expect(bolt).toBeDefined();
    expect(bolt!.urlIncludes).toBe('/api/chat/v2');
  });

  it('ignores Bolt project-persist POSTs to /api/chats/<id> even when they carry a messages history', async () => {
    // Bolt persists the project (full messages array included) to /api/chats/<id>;
    // on a load with unsaved state this replayed the last HISTORICAL prompt and fired
    // a spurious advisory with zero user action (live, 2026-07-06).
    stubWindow('bolt.new');
    await loadMainWorld();

    void window.fetch('https://bolt.new/api/chats/68519367', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'old historical prompt' }] }),
    });
    await flush();

    expect(nativeFetch).toHaveBeenCalled();
    expectNoCapture();
  });

  it('a POST to /api/chat/v2 on bolt.new posts a nexpath:fetch-prompt message', async () => {
    stubWindow('bolt.new');
    await loadMainWorld();

    void window.fetch('https://bolt.new/api/chat/v2', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'build a nav bar' }] }),
    });
    await flush();

    expect(nativeFetch).toHaveBeenCalled();
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'nexpath:fetch-prompt', promptText: 'build a nav bar', agent: 'bolt' },
      'https://bolt.new',
    );
  });

  it('supports Request-object inputs by cloning the body', async () => {
    stubWindow('bolt.new');
    await loadMainWorld();

    const req = new Request('https://bolt.new/api/chat/v2', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'via request object' }] }),
    });
    void window.fetch(req);
    await flush();

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'nexpath:fetch-prompt', promptText: 'via request object' }),
      'https://bolt.new',
    );
  });

  it('ignores GETs, non-matching URLs, and hosts without a rule (replit)', async () => {
    stubWindow('bolt.new');
    await loadMainWorld();

    void window.fetch('https://bolt.new/api/chat/v2', { method: 'GET' });
    void window.fetch('https://bolt.new/api/token-stats', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'not a chat call' }] }),
    });
    await flush();
    expectNoCapture();

    // Replit deliberately has no fetch rule (binary MessagePack WS — recon B3).
    vi.resetModules();
    stubWindow('replit.com');
    await loadMainWorld();
    void window.fetch('https://replit.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'should not capture' }] }),
    });
    await flush();
    expectNoCapture();
  });

  it('never delays or breaks the page request when the body is unparseable', async () => {
    stubWindow('bolt.new');
    await loadMainWorld();

    void window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: 'garbage{{{' });
    await flush();

    expect(nativeFetch).toHaveBeenCalled();
    expectNoCapture();
  });
});

describe('patchedFetch — both switch positions (the backward-compatibility proof)', () => {
  const nativeFetch = vi.fn().mockResolvedValue({ ok: true } as unknown as Response);
  let listeners: Array<(ev: MessageEvent) => void> = [];
  /** What the (simulated) content script + service worker answer with. */
  let verdict: { kind: 'allow' } | { kind: 'block'; replacement: string } = { kind: 'allow' };

  function deliver(data: unknown): void {
    const win = globalThis.window as unknown as Window;
    for (const cb of [...listeners]) cb({ data, source: win } as MessageEvent);
  }

  /**
   * Stands in for the content script: relays a decision request to the "service
   * worker" and posts the answer back page-direct, exactly as the real bridge
   * does. Without this the page would legitimately hold until its budget expires.
   */
  const postMessageSpy = vi.fn((msg: unknown) => {
    const m = msg as { type?: string; requestId?: string } | null;
    if (m?.type === 'nexpath:submit-decision-request') {
      queueMicrotask(() => deliver({
        type: 'nexpath:submit-decision-response', requestId: m.requestId, decision: verdict,
      }));
    }
  });

  function stubWindow(hostname: string): void {
    listeners = [];
    vi.stubGlobal('window', {
      postMessage: postMessageSpy,
      fetch: nativeFetch,
      location: { origin: `https://${hostname}`, hostname },
      addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
        if (type === 'message') listeners.push(cb);
      },
    });
  }

  function armSwitch(): void {
    const win = globalThis.window as unknown as Window;
    for (const cb of [...listeners]) {
      cb({ data: { type: 'nexpath:submit-flow', enabled: true, source: 'default_on', seq: 1 }, source: win } as MessageEvent);
    }
  }

  function ringEvents(): string[] {
    return postMessageSpy.mock.calls
      .map((c) => c[0] as { type?: string; event?: string } | null)
      .filter((m) => m?.type === 'nexpath:submit-flow-event')
      .map((m) => m!.event as string);
  }

  const BODY = JSON.stringify({ messages: [{ role: 'user', content: 'add integration tests for checkout' }] });

  beforeEach(() => {
    postMessageSpy.mockClear();
    nativeFetch.mockClear();
    verdict = { kind: 'allow' };
    vi.resetModules();
  });

  describe('switch OFF — today\'s flow, unchanged', () => {
    it('calls the native fetch SYNCHRONOUSLY, before any await can run', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();

      // Deliberately not awaited: on the ungated path the native call must have
      // already happened by the time patchedFetch returns.
      void window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: BODY });
      expect(nativeFetch).toHaveBeenCalledTimes(1);
    });

    it('passes the ORIGINAL arguments through, with the same arity', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      const init = { method: 'POST', body: BODY };

      void window.fetch('https://bolt.new/api/chat/v2', init);
      expect(nativeFetch).toHaveBeenCalledWith('https://bolt.new/api/chat/v2', init);
      expect(nativeFetch.mock.calls[0]).toHaveLength(2);
    });

    it('emits no gated-path ring events at all', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      void window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: BODY });
      await new Promise((r) => setTimeout(r, 0));
      expect(ringEvents()).toEqual([]);
    });
  });

  describe('switch ON — the request is held, then released with the original', () => {
    it('does NOT call the native fetch synchronously any more', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      armSwitch();

      void window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: BODY });
      expect(nativeFetch).not.toHaveBeenCalled(); // held
    });

    it('releases exactly one native call, with the original arguments', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      armSwitch();
      const init = { method: 'POST', body: BODY };

      await window.fetch('https://bolt.new/api/chat/v2', init);
      expect(nativeFetch).toHaveBeenCalledTimes(1);
      expect(nativeFetch).toHaveBeenCalledWith('https://bolt.new/api/chat/v2', init);
    });

    it('emits started → released_allow for the hold', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      armSwitch();

      await window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: BODY });
      expect(ringEvents()).toEqual(['submit_hold_started', 'submit_hold_released_allow']);
    });

    it('still emits the captured prompt, so the existing pipeline is unaffected', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      armSwitch();

      await window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: BODY });
      const captures = postMessageSpy.mock.calls
        .map((c) => c[0] as { type?: string; promptText?: string } | null)
        .filter((m) => m?.type === 'nexpath:fetch-prompt');
      expect(captures).toHaveLength(1);
      expect(captures[0]!.promptText).toBe('add integration tests for checkout');
    });

    it('a NON-matching URL still takes the untouched path even when armed', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      armSwitch();

      void window.fetch('https://bolt.new/api/chats/123', { method: 'POST', body: BODY });
      expect(nativeFetch).toHaveBeenCalledTimes(1); // synchronous — not gated
      await new Promise((r) => setTimeout(r, 0));
      expect(ringEvents()).toEqual([]);
    });

    it('a GET to the same URL is never gated', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      armSwitch();

      void window.fetch('https://bolt.new/api/chat/v2');
      expect(nativeFetch).toHaveBeenCalledTimes(1);
    });

    it('an unparseable body releases the original rather than losing it', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      armSwitch();

      await window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: 'not json' });
      expect(nativeFetch).toHaveBeenCalledTimes(1);
      expect(ringEvents()).toEqual([]); // never entered the hold
    });

    it('a repeated identical submission is claimed once but still sent both times', async () => {
      stubWindow('bolt.new');
      await loadMainWorld();
      armSwitch();

      await window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: BODY });
      await window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body: BODY });

      expect(nativeFetch).toHaveBeenCalledTimes(2);
      expect(ringEvents()).toEqual([
        'submit_hold_started', 'submit_hold_released_allow', 'submit_hold_claim_duplicate',
      ]);
    });
  });
});

describe('the milestone promise: only the modified prompt reaches the agent', () => {
  const nativeFetch = vi.fn().mockResolvedValue({ ok: true } as unknown as Response);
  let listeners: Array<(ev: MessageEvent) => void> = [];
  let verdict: { kind: 'allow' } | { kind: 'block'; replacement: string } = { kind: 'allow' };

  function deliver(data: unknown): void {
    const win = globalThis.window as unknown as Window;
    for (const cb of [...listeners]) cb({ data, source: win } as MessageEvent);
  }

  const postMessageSpy = vi.fn((msg: unknown) => {
    const m = msg as { type?: string; requestId?: string } | null;
    if (m?.type === 'nexpath:submit-decision-request') {
      queueMicrotask(() => deliver({
        type: 'nexpath:submit-decision-response', requestId: m.requestId, decision: verdict,
      }));
    }
  });

  function stubWindow(hostname: string): void {
    listeners = [];
    vi.stubGlobal('window', {
      postMessage: postMessageSpy,
      fetch: nativeFetch,
      location: { origin: `https://${hostname}`, hostname },
      addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
        if (type === 'message') listeners.push(cb);
      },
    });
  }

  function arm(): void {
    const win = globalThis.window as unknown as Window;
    for (const cb of [...listeners]) {
      cb({ data: { type: 'nexpath:submit-flow', enabled: true, source: 'default_on', seq: 1 }, source: win } as MessageEvent);
    }
  }

  const REPLACEMENT = 'add unit tests for the checkout total, then deploy';

  beforeEach(() => {
    postMessageSpy.mockClear();
    nativeFetch.mockClear();
    verdict = { kind: 'allow' };
    vi.resetModules();
  });

  it('BOLT: sends ONE request carrying the replacement, and never the original', async () => {
    stubWindow('bolt.new');
    await loadMainWorld();
    arm();
    verdict = { kind: 'block', replacement: REPLACEMENT };

    const body = JSON.stringify({ messages: [{ role: 'user', content: 'just ship it' }] });
    await window.fetch('https://bolt.new/api/chat/v2', { method: 'POST', body });

    expect(nativeFetch).toHaveBeenCalledTimes(1);
    const sentBody = (nativeFetch.mock.calls[0]![1] as RequestInit).body as string;
    const sent = JSON.parse(sentBody) as { messages: Array<{ content: string }> };
    expect(sent.messages.at(-1)!.content).toBe(REPLACEMENT);
    expect(sentBody).not.toContain('just ship it');
  });

  it('LOVABLE: rewrites the message field, one request only', async () => {
    stubWindow('lovable.dev');
    await loadMainWorld();
    arm();
    verdict = { kind: 'block', replacement: REPLACEMENT };

    const body = JSON.stringify({ id: 'umsg_9', message: 'just ship it', view: 'preview' });
    await window.fetch('https://api.lovable.dev/projects/abc/chat', { method: 'POST', body });

    expect(nativeFetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((nativeFetch.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(sent['message']).toBe(REPLACEMENT);
    expect(sent['view']).toBe('preview');
  });

  it('emits submit_hold_blocked, not released_allow', async () => {
    stubWindow('bolt.new');
    await loadMainWorld();
    arm();
    verdict = { kind: 'block', replacement: REPLACEMENT };

    await window.fetch('https://bolt.new/api/chat/v2', {
      method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'ship it' }] }),
    });
    const events = postMessageSpy.mock.calls
      .map((c) => c[0] as { type?: string; event?: string } | null)
      .filter((m) => m?.type === 'nexpath:submit-flow-event').map((m) => m!.event);
    expect(events).toEqual(['submit_hold_started', 'submit_hold_blocked']);
  });

  it('the replacement\'s OWN submit is recognised as an echo and never re-gated', async () => {
    stubWindow('bolt.new');
    await loadMainWorld();
    arm();
    verdict = { kind: 'block', replacement: REPLACEMENT };

    await window.fetch('https://bolt.new/api/chat/v2', {
      method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'ship it' }] }),
    });

    // The site re-submits the replacement text (or the user does):
    await window.fetch('https://bolt.new/api/chat/v2', {
      method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: REPLACEMENT }] }),
    });

    const events = postMessageSpy.mock.calls
      .map((c) => c[0] as { type?: string; event?: string } | null)
      .filter((m) => m?.type === 'nexpath:submit-flow-event').map((m) => m!.event);
    expect(events).toEqual(['submit_hold_started', 'submit_hold_blocked', 'submit_hold_echo_skip']);
    expect(nativeFetch).toHaveBeenCalledTimes(2);
  });

  it('a block whose body cannot be rewritten falls back to the ORIGINAL, never nothing', async () => {
    stubWindow('bolt.new');
    await loadMainWorld();
    arm();
    verdict = { kind: 'block', replacement: REPLACEMENT };

    // A body the extractor accepts is required to reach the gate at all, so use
    // a Request-less shape the rewriter cannot handle: body only on the Request.
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'ship it' }] });
    const req = new Request('https://bolt.new/api/chat/v2', { method: 'POST', body });
    await window.fetch(req);

    expect(nativeFetch).toHaveBeenCalledTimes(1);
    const events = postMessageSpy.mock.calls
      .map((c) => c[0] as { type?: string; event?: string } | null)
      .filter((m) => m?.type === 'nexpath:submit-flow-event').map((m) => m!.event);
    // Either it rewrote the Request cleanly, or it fell back — both send exactly
    // once, and neither loses the prompt.
    expect(events[0]).toBe('submit_hold_started');
    expect(['submit_hold_blocked', 'submit_hold_substitution_failed']).toContain(events[1]);
  });
});

describe('the SHIPPED strategy: the fetch patch does not gate composer-intercept sites', () => {
  // Live evidence moved Bolt and Lovable to the composer mechanism. Exactly one
  // gate may own a site — if the fetch patch also held the request, a single
  // submission would be decided twice.
  const nativeFetch = vi.fn().mockResolvedValue({ ok: true } as unknown as Response);
  const postMessageSpy = vi.fn();
  let listeners: Array<(ev: MessageEvent) => void> = [];

  function stubWindow(hostname: string): void {
    listeners = [];
    vi.stubGlobal('window', {
      postMessage: postMessageSpy,
      fetch: nativeFetch,
      location: { origin: `https://${hostname}`, hostname },
      addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
        if (type === 'message') listeners.push(cb);
      },
    });
  }

  function arm(): void {
    const win = globalThis.window as unknown as Window;
    for (const cb of [...listeners]) {
      cb({ data: { type: 'nexpath:submit-flow', enabled: true, source: 'default_on', seq: 1 }, source: win } as MessageEvent);
    }
  }

  beforeEach(() => {
    postMessageSpy.mockClear();
    nativeFetch.mockClear();
    vi.resetModules();
  });

  for (const [host, body] of [
    ['bolt.new', JSON.stringify({ messages: [{ role: 'user', content: 'ship it now' }] })],
    ['lovable.dev', JSON.stringify({ id: 'umsg_1', message: 'ship it now' })],
  ] as Array<[string, string]>) {
    it(`${host}: an ARMED submit still calls the native fetch synchronously (not held)`, async () => {
      stubWindow(host);
      await loadMainWorld('composer_intercept');
      arm();

      const url = host === 'bolt.new'
        ? 'https://bolt.new/api/chat/v2'
        : 'https://api.lovable.dev/projects/abc/chat';
      void window.fetch(url, { method: 'POST', body });

      // Synchronous ⇒ never entered the hold.
      expect(nativeFetch).toHaveBeenCalledTimes(1);
      await new Promise((r) => setTimeout(r, 0));
      const gated = postMessageSpy.mock.calls
        .map((c) => c[0] as { type?: string } | null)
        .filter((m) => m?.type === 'nexpath:submit-flow-event');
      expect(gated).toEqual([]);
    });
  }

  it('still captures the prompt, so the pipeline is unaffected', async () => {
    stubWindow('bolt.new');
    await loadMainWorld('composer_intercept');
    arm();
    void window.fetch('https://bolt.new/api/chat/v2', {
      method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'ship it now' }] }),
    });
    await new Promise((r) => setTimeout(r, 0));
    const captures = postMessageSpy.mock.calls
      .map((c) => c[0] as { type?: string } | null)
      .filter((m) => m?.type === 'nexpath:fetch-prompt');
    expect(captures).toHaveLength(1);
  });
});
