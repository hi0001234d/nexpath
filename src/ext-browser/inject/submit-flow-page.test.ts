import { describe, it, expect } from 'vitest';
import {
  setupSubmitFlowPage,
  SUBMIT_FLOW_PUSH_TYPE,
  SUBMIT_FLOW_REQUEST_TYPE,
  SUBMIT_FLOW_STATE_TYPE,
} from './submit-flow-page.js';

/**
 * A minimal stand-in for the page's `window`, injected per test.
 *
 * Deliberately NOT the shared jsdom window: `setupSubmitFlowPage` registers a
 * listener and has no teardown (it lives for the page's lifetime in production),
 * so reusing one global window leaks every previous test's listener into the next
 * and makes the read-back counts meaningless. A fresh fake per test is both
 * isolated and exact about the `ev.source !== win` identity check.
 */
function makeWin(opts: { postThrows?: boolean } = {}) {
  const listeners: Array<(ev: MessageEvent) => void> = [];
  const posts: Array<Record<string, unknown>> = [];
  const win = {
    location: { origin: 'https://bolt.new' },
    addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
      if (type === 'message') listeners.push(cb);
    },
    postMessage(msg: unknown): void {
      if (opts.postThrows === true) throw new Error('opaque origin');
      posts.push(msg as Record<string, unknown>);
    },
  } as unknown as Window;

  /** Deliver a message event; `source` defaults to this window (i.e. "ours"). */
  const deliver = (data: unknown, source: unknown = win): void => {
    for (const cb of [...listeners]) cb({ data, source } as MessageEvent);
  };
  const postsOfType = (type: string): Array<Record<string, unknown>> =>
    posts.filter((m) => m !== null && typeof m === 'object' && m['type'] === type);

  return { win, posts, deliver, postsOfType };
}

const push = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: SUBMIT_FLOW_PUSH_TYPE, enabled: true, source: 'default_on', seq: 1, ...over,
});

describe('setupSubmitFlowPage — the MAIN-world switch holder', () => {
  it('starts DISARMED — an unresolved switch must never hold a request', () => {
    const { win } = makeWin();
    const handle = setupSubmitFlowPage(win);
    expect(handle.isArmed()).toBe(false);
    expect(handle.state()).toEqual({ armed: false, source: 'unresolved', seq: -1 });
  });

  it('announces readiness on load, so a push that already happened is re-sent', () => {
    const { win, postsOfType } = makeWin();
    setupSubmitFlowPage(win);
    expect(postsOfType(SUBMIT_FLOW_REQUEST_TYPE)).toHaveLength(1);
  });

  it('arms on a well-formed push and records the resolver reason', () => {
    const { win, deliver } = makeWin();
    const handle = setupSubmitFlowPage(win);
    deliver(push({ enabled: true, source: 'default_on', seq: 1 }));
    expect(handle.isArmed()).toBe(true);
    expect(handle.state()).toEqual({ armed: true, source: 'default_on', seq: 1 });
  });

  it('disarms on a later push that says false (a live storage flip)', () => {
    const { win, deliver } = makeWin();
    const handle = setupSubmitFlowPage(win);
    deliver(push({ enabled: true, seq: 1 }));
    deliver(push({ enabled: false, source: 'site_off', seq: 2 }));
    expect(handle.isArmed()).toBe(false);
    expect(handle.state().source).toBe('site_off');
  });

  it('echoes a read-back carrying what it NOW BELIEVES (A9)', () => {
    const { win, deliver, postsOfType } = makeWin();
    setupSubmitFlowPage(win);
    deliver(push({ enabled: true, source: 'override_on', seq: 4 }));
    expect(postsOfType(SUBMIT_FLOW_STATE_TYPE)).toEqual([
      { type: SUBMIT_FLOW_STATE_TYPE, armed: true, source: 'override_on', seq: 4 },
    ]);
  });

  describe('stale-guard', () => {
    it('ignores a push whose seq is not newer — a late async read cannot undo a newer value', () => {
      const { win, deliver } = makeWin();
      const handle = setupSubmitFlowPage(win);
      deliver(push({ enabled: false, source: 'site_off', seq: 5 }));
      deliver(push({ enabled: true, source: 'default_on', seq: 2 })); // slow earlier read
      expect(handle.isArmed()).toBe(false);
      expect(handle.state().seq).toBe(5);
    });

    it('ignores a repeat of the same seq, and does not re-echo', () => {
      const { win, deliver, postsOfType } = makeWin();
      const handle = setupSubmitFlowPage(win);
      deliver(push({ enabled: true, seq: 1 }));
      deliver(push({ enabled: false, source: 'site_off', seq: 1 }));
      expect(handle.isArmed()).toBe(true);
      expect(postsOfType(SUBMIT_FLOW_STATE_TYPE)).toHaveLength(1);
    });
  });

  describe('input hardening — a malformed push leaves the state alone', () => {
    function armed() {
      const h = makeWin();
      const handle = setupSubmitFlowPage(h.win);
      h.deliver(push({ enabled: true, seq: 1 }));
      return { ...h, handle };
    }

    it('a non-boolean `enabled` is rejected, not coerced', () => {
      const { handle, deliver } = armed();
      deliver(push({ enabled: 'false', seq: 2 }));
      expect(handle.isArmed()).toBe(true);
      expect(handle.state().seq).toBe(1);
    });

    it('a missing seq is rejected', () => {
      const { handle, deliver } = armed();
      const { seq: _drop, ...noSeq } = push({ enabled: false });
      deliver(noSeq);
      expect(handle.isArmed()).toBe(true);
    });

    it('a message of another type is ignored', () => {
      const { handle, deliver } = armed();
      deliver({ type: 'nexpath:prompt-captured', enabled: false, seq: 9 });
      expect(handle.isArmed()).toBe(true);
    });

    it('null data is ignored', () => {
      const { handle, deliver } = armed();
      deliver(null);
      expect(handle.isArmed()).toBe(true);
    });

    it('a string payload is ignored (no property access on a primitive)', () => {
      const { handle, deliver } = armed();
      expect(() => deliver('nexpath:submit-flow')).not.toThrow();
      expect(handle.isArmed()).toBe(true);
    });

    it('a push from another window (an iframe) is ignored', () => {
      const { win, deliver } = makeWin();
      const handle = setupSubmitFlowPage(win);
      deliver(push({ enabled: true, seq: 1 }), { other: 'window' });
      expect(handle.isArmed()).toBe(false);
    });

    it('a non-string source label degrades to "unknown" rather than rejecting the value', () => {
      const { win, deliver } = makeWin();
      const handle = setupSubmitFlowPage(win);
      deliver(push({ enabled: true, source: 42, seq: 1 }));
      expect(handle.state()).toEqual({ armed: true, source: 'unknown', seq: 1 });
    });
  });

  describe('it can never throw at module scope', () => {
    // main-world.ts calls this at module scope, so a throw would abort the rest of
    // that file — including the globalThis helpers the agent modules import. Found
    // by a real failure: an existing test's window stub had no addEventListener and
    // took all 20 of that file's tests down with it.
    it('survives a window with no addEventListener, and stays disarmed', () => {
      const win = {
        location: { origin: 'https://bolt.new' },
        postMessage: () => {},
      } as unknown as Window;
      let handle: ReturnType<typeof setupSubmitFlowPage> | null = null;
      expect(() => { handle = setupSubmitFlowPage(win); }).not.toThrow();
      expect(handle!.isArmed()).toBe(false);
    });

    it('survives a window with no postMessage either', () => {
      const win = {
        location: { origin: 'https://bolt.new' },
        addEventListener: () => {},
      } as unknown as Window;
      expect(() => setupSubmitFlowPage(win)).not.toThrow();
    });
  });

  it('a postMessage that throws (opaque origin) never escapes to the page', () => {
    const { win, deliver } = makeWin({ postThrows: true });
    let handle: ReturnType<typeof setupSubmitFlowPage> | null = null;
    expect(() => { handle = setupSubmitFlowPage(win); }).not.toThrow();
    expect(() => deliver(push({ enabled: true, seq: 1 }))).not.toThrow();
    // State still updated; only the diagnostic echo failed.
    expect(handle!.isArmed()).toBe(true);
  });
});
