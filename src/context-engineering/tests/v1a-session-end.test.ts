/**
 * v1(a) — session end → OpenClaw gets the session's decisions from our map
 * (architecture.md Path A: "session ends → OpenClaw: save the session's decisions").
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { openStore } from '../../store/db.js';
import { upsertContextMemory } from '../store/historical-map-store.js';
import { SessionEndTracker, sessionDecisionsFromMap, type EndedSession } from '../sources/session-end.js';

afterEach(() => vi.useRealTimers());

describe('SessionEndTracker', () => {
  it('ends a session after the gap, once', async () => {
    vi.useFakeTimers();
    const ended: EndedSession[] = [];
    const tracker = new SessionEndTracker({ gapMs: 1000, onEnd: (s) => void ended.push(s) });
    tracker.noteTurn({ projectRoot: '/repo/a', sessionId: 's1', ts: 100 });
    vi.advanceTimersByTime(900);
    tracker.noteTurn({ projectRoot: '/repo/a', sessionId: 's1', ts: 200 }); // a turn restarts the gap
    vi.advanceTimersByTime(900);
    expect(ended).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(ended).toEqual([{ projectRoot: '/repo/a', sessionId: 's1', startedAt: 100 }]);
    expect(tracker.openSessions()).toBe(0);
  });

  it('a new session in the same project ends the earlier one at once; other projects are separate', () => {
    const ended: EndedSession[] = [];
    const tracker = new SessionEndTracker({ onEnd: (s) => void ended.push(s) });
    tracker.noteTurn({ projectRoot: '/repo/a', sessionId: 's1', ts: 1 });
    tracker.noteTurn({ projectRoot: '/repo/b', sessionId: 's9', ts: 2 });
    tracker.noteTurn({ projectRoot: '/repo/a', sessionId: 's2', ts: 3 });
    expect(ended.map((s) => s.sessionId)).toEqual(['s1']);
    expect(tracker.openSessions()).toBe(2);
  });

  it('endAll ends every open session (shutdown) and never throws', async () => {
    const ended: string[] = [];
    const tracker = new SessionEndTracker({
      onEnd: async (s) => {
        ended.push(s.sessionId);
        if (s.sessionId === 'bad') throw new Error('OpenClaw broke');
      },
    });
    tracker.noteTurn({ projectRoot: '/repo/a', sessionId: 'bad', ts: 1 });
    tracker.noteTurn({ projectRoot: '/repo/b', sessionId: 'ok', ts: 1 });
    await expect(tracker.endAll()).resolves.toBeUndefined();
    expect(ended.sort()).toEqual(['bad', 'ok']);
  });
});

describe('sessionDecisionsFromMap', () => {
  it('takes the current decisions recorded during the session, nothing older, no replaced ones', async () => {
    const store = await openStore(':memory:');
    const now = Date.now();
    const add = (key: string, content: string, extra: Record<string, unknown> = {}) =>
      upsertContextMemory(store, { projectRoot: '/repo/a', kind: 'rule', key, content, locked: false, confidence: 0.8, ...extra } as never);
    add('lock', 'processRetry is the only entry point for retries.', { locked: true });
    add('alert', 'TODO left in processRetry.', { kind: 'pattern_alert' });
    const rows = sessionDecisionsFromMap(store, { projectRoot: '/repo/a', sessionId: 's', startedAt: now });
    expect(rows.decisions).toEqual([{ kind: 'rule', content: 'processRetry is the only entry point for retries.', locked: true }]);
    // a session that started long after these facts were recorded gets none of them
    expect(sessionDecisionsFromMap(store, { projectRoot: '/repo/a', sessionId: 's', startedAt: now + 3_600_000 }).decisions).toEqual([]);
    // another project's facts never cross over
    expect(sessionDecisionsFromMap(store, { projectRoot: '/repo/b', sessionId: 's', startedAt: now }).decisions).toEqual([]);
  });
});
