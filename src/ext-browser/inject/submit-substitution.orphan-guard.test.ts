import { describe, it, expect, vi } from 'vitest';
import { makeOrphanGuard, RESTORE_COMPOSER_SELECTOR } from './submit-substitution.js';

function abortedSignal(): AbortSignal {
  const c = new AbortController();
  c.abort();
  return c.signal;
}

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function deps(overrides: Partial<Parameters<typeof makeOrphanGuard>[0]> = {}) {
  return {
    signal: liveSignal() as AbortSignal | null,
    agent: 'lovable',
    prompt: 'Review the built page against the plan and list gaps.',
    insertText: vi.fn().mockReturnValue(true),
    emit: vi.fn(),
    ...overrides,
  };
}

describe('makeOrphanGuard — F4: a hold the page abandoned must not lose the prompt', () => {
  it('passes the send through untouched while the page still wants the request', () => {
    const d = deps();
    const { guard } = makeOrphanGuard(d);
    const send = vi.fn().mockReturnValue('response');

    expect(guard(send)()).toBe('response');
    expect(send).toHaveBeenCalledOnce();
    expect(d.insertText).not.toHaveBeenCalled();
    expect(d.emit).not.toHaveBeenCalled();
  });

  it('passes through when the page gave no signal at all (nothing to observe)', () => {
    const d = deps({ signal: null });
    const { guard } = makeOrphanGuard(d);
    const send = vi.fn().mockReturnValue('ok');
    expect(guard(send)()).toBe('ok');
  });

  it('on an aborted signal: restores the prompt into the composer, never calls send, throws AbortError', () => {
    const d = deps({ signal: abortedSignal() });
    const { guard } = makeOrphanGuard(d);
    const send = vi.fn();

    expect(() => guard(send)()).toThrowError(/abandoned the held request/);
    expect(send).not.toHaveBeenCalled();
    expect(d.insertText).toHaveBeenCalledWith(
      RESTORE_COMPOSER_SELECTOR['lovable'], d.prompt,
    );
    // The thrown error is a real AbortError, so page semantics stay identical
    // to the abort the page itself initiated.
    try { guard(send)(); } catch (e) { expect((e as DOMException).name).toBe('AbortError'); }
  });

  it('restores AT MOST ONCE even when the gate fallback chain calls both wrapped sends', () => {
    const d = deps({ signal: abortedSignal() });
    const { guard } = makeOrphanGuard(d);
    const send = guard(vi.fn());
    const sendReplacement = guard(vi.fn());

    expect(() => sendReplacement()).toThrow();
    expect(() => send()).toThrow();
    expect(d.insertText).toHaveBeenCalledOnce();
    expect(d.emit).toHaveBeenCalledOnce();
  });

  it('emits counts only — never the prompt text (L11 posture for the ring)', () => {
    const d = deps({ signal: abortedSignal() });
    const { guard } = makeOrphanGuard(d);
    try { guard(vi.fn())(); } catch { /* expected */ }

    const [event, data] = d.emit.mock.calls[0]!;
    expect(event).toBe('submit_hold_orphaned');
    expect(data).toEqual({ agent: 'lovable', restored: true, chars: d.prompt.length });
    expect(JSON.stringify(data)).not.toContain('Review the built page');
  });

  it('an agent with no restore selector still surfaces the orphan (restored:false), and an insertText crash cannot escape', () => {
    const d = deps({
      signal: abortedSignal(),
      agent: 'bolt',
      insertText: vi.fn(() => { throw new Error('DOM gone'); }),
    });
    const { guard } = makeOrphanGuard(d);
    try { guard(vi.fn())(); } catch { /* expected */ }

    expect(d.emit).toHaveBeenCalledWith('submit_hold_orphaned',
      expect.objectContaining({ restored: false }));
  });
});
