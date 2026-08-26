import { describe, it, expect, vi } from 'vitest';
import {
  createDecisionChannel,
  SUBMIT_DECISION_REQUEST_TYPE,
  SUBMIT_DECISION_RESPONSE_TYPE,
} from './submit-decision-channel.js';

function makeWin(opts: { postThrows?: boolean; noListener?: boolean } = {}) {
  const listeners: Array<(ev: MessageEvent) => void> = [];
  const posts: Array<Record<string, unknown>> = [];
  const win = {
    location: { origin: 'https://bolt.new' },
    addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
      if (opts.noListener === true) throw new Error('no listeners here');
      if (type === 'message') listeners.push(cb);
    },
    postMessage(msg: unknown): void {
      if (opts.postThrows === true) throw new Error('opaque origin');
      posts.push(msg as Record<string, unknown>);
    },
  } as unknown as Window;

  const deliver = (data: unknown, source: unknown = win): void => {
    for (const cb of [...listeners]) cb({ data, source } as MessageEvent);
  };
  const requests = (): Array<Record<string, unknown>> =>
    posts.filter((m) => m['type'] === SUBMIT_DECISION_REQUEST_TYPE);
  return { win, posts, deliver, requests };
}

const CTX = { prompt: 'add tests for the checkout flow', submitId: 's1' };

describe('createDecisionChannel — page side of the verdict round-trip', () => {
  it('posts a correlated request and resolves when the matching answer arrives', async () => {
    const { win, deliver, requests } = makeWin();
    const ch = createDecisionChannel(win);

    const p = ch.request(CTX);
    expect(requests()).toHaveLength(1);
    const req = requests()[0]!;
    expect(req).toMatchObject({ prompt: CTX.prompt, submitId: 's1' });
    expect(typeof req['requestId']).toBe('string');

    deliver({ type: SUBMIT_DECISION_RESPONSE_TYPE, requestId: req['requestId'], decision: { kind: 'allow' } });
    expect(await p).toEqual({ kind: 'allow' });
  });

  it('carries a block verdict through with its replacement', async () => {
    const { win, deliver, requests } = makeWin();
    const ch = createDecisionChannel(win);
    const p = ch.request(CTX);
    deliver({
      type: SUBMIT_DECISION_RESPONSE_TYPE,
      requestId: requests()[0]!['requestId'],
      decision: { kind: 'block', replacement: 'the improved prompt' },
    });
    expect(await p).toEqual({ kind: 'block', replacement: 'the improved prompt' });
  });

  describe('correlation', () => {
    it('answers only the request whose id matches', async () => {
      const { win, deliver, requests } = makeWin();
      const ch = createDecisionChannel(win);
      const a = ch.request({ prompt: 'first prompt text', submitId: 'a' });
      const b = ch.request({ prompt: 'second prompt text', submitId: 'b' });
      expect(ch.pending()).toBe(2);

      const idB = requests()[1]!['requestId'];
      deliver({ type: SUBMIT_DECISION_RESPONSE_TYPE, requestId: idB, decision: { kind: 'block', replacement: 'B wins' } });

      expect(await b).toEqual({ kind: 'block', replacement: 'B wins' });
      expect(ch.pending()).toBe(1); // a is still waiting

      deliver({ type: SUBMIT_DECISION_RESPONSE_TYPE, requestId: requests()[0]!['requestId'], decision: { kind: 'allow' } });
      expect(await a).toEqual({ kind: 'allow' });
    });

    it('gives two submissions of the SAME text distinct request ids', () => {
      const { win, requests } = makeWin();
      const ch = createDecisionChannel(win);
      void ch.request(CTX);
      void ch.request(CTX);
      expect(requests()[0]!['requestId']).not.toBe(requests()[1]!['requestId']);
    });

    it('ignores an answer for an unknown id (a late reply to an expired hold)', async () => {
      const { win, deliver } = makeWin();
      const ch = createDecisionChannel(win);
      expect(() => deliver({ type: SUBMIT_DECISION_RESPONSE_TYPE, requestId: 'ghost', decision: { kind: 'allow' } }))
        .not.toThrow();
      expect(ch.pending()).toBe(0);
    });

    it('does not leak a waiter after it settles', async () => {
      const { win, deliver, requests } = makeWin();
      const ch = createDecisionChannel(win);
      const p = ch.request(CTX);
      deliver({ type: SUBMIT_DECISION_RESPONSE_TYPE, requestId: requests()[0]!['requestId'], decision: { kind: 'allow' } });
      await p;
      expect(ch.pending()).toBe(0);
    });

    it('registers ONE listener regardless of how many requests are made', () => {
      const add = vi.fn();
      const win = {
        location: { origin: 'https://bolt.new' },
        addEventListener: add,
        postMessage: () => {},
      } as unknown as Window;
      const ch = createDecisionChannel(win);
      void ch.request(CTX); void ch.request(CTX); void ch.request(CTX);
      expect(add).toHaveBeenCalledTimes(1);
    });
  });

  describe('a malformed verdict is an ALLOW, never a block', () => {
    const cases: Array<[string, unknown]> = [
      ['a block with no replacement', { kind: 'block' }],
      ['a block with an empty replacement', { kind: 'block', replacement: '' }],
      ['a block with a non-string replacement', { kind: 'block', replacement: 42 }],
      ['an unknown kind', { kind: 'maybe' }],
      ['null', null],
      ['a string', 'block'],
      ['undefined', undefined],
    ];
    for (const [name, decision] of cases) {
      it(`${name} → allow`, async () => {
        const { win, deliver, requests } = makeWin();
        const ch = createDecisionChannel(win);
        const p = ch.request(CTX);
        deliver({ type: SUBMIT_DECISION_RESPONSE_TYPE, requestId: requests()[0]!['requestId'], decision });
        expect(await p).toEqual({ kind: 'allow' });
      });
    }
  });

  describe('hostile / foreign input', () => {
    it('ignores a response from another window', async () => {
      const { win, deliver, requests } = makeWin();
      const ch = createDecisionChannel(win);
      void ch.request(CTX);
      deliver(
        { type: SUBMIT_DECISION_RESPONSE_TYPE, requestId: requests()[0]!['requestId'], decision: { kind: 'allow' } },
        { some: 'iframe' },
      );
      expect(ch.pending()).toBe(1); // still waiting
    });

    it('ignores messages of other types and malformed envelopes', async () => {
      const { win, deliver } = makeWin();
      const ch = createDecisionChannel(win);
      void ch.request(CTX);
      deliver({ type: 'nexpath:something-else' });
      deliver(null);
      deliver('a string');
      deliver({ type: SUBMIT_DECISION_RESPONSE_TYPE }); // no requestId
      expect(ch.pending()).toBe(1);
    });
  });

  describe('a channel that cannot work must not withhold the prompt', () => {
    it('resolves ALLOW immediately when the request cannot even be posted', async () => {
      const { win } = makeWin({ postThrows: true });
      const ch = createDecisionChannel(win);
      expect(await ch.request(CTX)).toEqual({ kind: 'allow' });
      expect(ch.pending()).toBe(0);
    });

    it('constructing with an unusable window does not throw', () => {
      const { win } = makeWin({ noListener: true });
      expect(() => createDecisionChannel(win)).not.toThrow();
    });
  });

  it('has NO timeout of its own — the hold budget is the only ceiling', async () => {
    // If this module grew its own timer there would be two competing ceilings,
    // and the shorter one would silently win. Proven by leaving a request
    // outstanding across real time and asserting it is still pending.
    const { win } = makeWin();
    const ch = createDecisionChannel(win);
    void ch.request(CTX);
    await new Promise((r) => setTimeout(r, 30));
    expect(ch.pending()).toBe(1);
  });
});
