/**
 * ⭐ RC50/RC56 — duplicate hook registrations must not double-run the flow,
 * and the claim must be ATOMIC (exclusive create): the measured 2–100 ms
 * invocation stagger made a read-modify-write registry a coin-flip.
 */
import { describe, it, expect } from 'vitest';
import {
  checkAndRecordCursorInvocation,
  cursorInvocationMarkerName,
  WINDSURF_INVOCATION_DIRNAME,
} from './invocation-guard.js';

function memFs() {
  const files = new Set<string>();
  const mtimes = new Map<string, number>();
  return {
    files, mtimes,
    deps: (now: number) => ({
      now: () => now,
      mkdirFn: () => {},
      writeExclusiveFn: (p: string) => {
        if (files.has(p)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
        files.add(p); mtimes.set(p, now);
      },
      readdirFn: () => [...files].map((p) => p.split('/').pop()!),
      mtimeMsFn: (p: string) => mtimes.get(p) ?? [...mtimes.values()][0] ?? now,
      removeFn: (p: string) => { for (const f of [...files]) if (f.endsWith(p.split('/').pop()!)) { files.delete(f); mtimes.delete(f); } },
    }),
  };
}

describe('⭐ RC50/RC56 — atomic duplicate-invocation claim', () => {
  it('⭐ first claim wins (false); the SAME key is a duplicate (true) — arbitration is the create itself', () => {
    const fs = memFs();
    expect(checkAndRecordCursorInvocation('/p', 'beforeSubmitPrompt', 'gen-1', fs.deps(1000))).toBe(false);
    expect(checkAndRecordCursorInvocation('/p', 'beforeSubmitPrompt', 'gen-1', fs.deps(1002))).toBe(true);
  });

  it('a different generation is not a duplicate', () => {
    const fs = memFs();
    checkAndRecordCursorInvocation('/p', 'beforeSubmitPrompt', 'gen-1', fs.deps(1000));
    expect(checkAndRecordCursorInvocation('/p', 'beforeSubmitPrompt', 'gen-2', fs.deps(1001))).toBe(false);
  });

  it('⭐ no generation id ⇒ never a duplicate (fail-open)', () => {
    expect(checkAndRecordCursorInvocation('/p', 'e', undefined, memFs().deps(1000))).toBe(false);
  });

  it('non-EEXIST fs errors ⇒ fail-open (run the flow)', () => {
    expect(checkAndRecordCursorInvocation('/p', 'e', 'gen-1', {
      mkdirFn: () => {}, writeExclusiveFn: () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); },
    })).toBe(false);
  });

  it('stale markers are pruned by the winner', () => {
    const fs = memFs();
    checkAndRecordCursorInvocation('/p', 'e', 'old', fs.deps(1000));
    checkAndRecordCursorInvocation('/p', 'e', 'new', fs.deps(1000 + 10 * 60_000 + 1));
    const names = [...fs.files].map((p) => p.split('/').pop()!);
    expect(names).not.toContain(cursorInvocationMarkerName('e', 'old'));
    expect(names).toContain(cursorInvocationMarkerName('e', 'new'));
  });

  it('marker names are fs-safe', () => {
    expect(cursorInvocationMarkerName('beforeSubmitPrompt', 'a/b:c*d')).toBe('beforeSubmitPrompt-a_b_c_d');
  });
});

/**
 * ⭐ RC64 — the guard is reused for WINDSURF (Windows Devin executes both the
 * global and the workspace hooks.json — one submit, two full pipelines, two
 * different enhancements). Markers get their own dir, and short windows are
 * made HONEST: pruning only ever ran on winners, so a stale marker could sit
 * forever and dedupe a legitimate repeat of a fallback (trajectory+hash) key.
 */
describe('⭐ RC64 — custom dir + honest claim window', () => {
  it('dirName routes markers to the windsurf dir (cursor default untouched)', () => {
    const paths: string[] = [];
    const capture = {
      mkdirFn: () => {}, readdirFn: () => [] as string[],
      writeExclusiveFn: (p: string) => { paths.push(p); },
    };
    checkAndRecordCursorInvocation('/p', 'e', 'k', capture);
    checkAndRecordCursorInvocation('/p', 'e', 'k', { ...capture, dirName: WINDSURF_INVOCATION_DIRNAME });
    expect(paths[0]).toContain('cursor-hook-invocations');
    expect(paths[1]).toContain('windsurf-hook-invocations');
  });

  it('⭐ a marker OLDER than the window is stale: reclaimed, NOT a duplicate', () => {
    const fs = memFs();
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(1_000), maxAgeMs: 10_000 })).toBe(false);
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(12_000), maxAgeMs: 10_000 })).toBe(false);
  });

  it('⭐ inside the window the repeat IS a duplicate', () => {
    const fs = memFs();
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(1_000), maxAgeMs: 10_000 })).toBe(false);
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(10_999), maxAgeMs: 10_000 })).toBe(true);
  });

  it('EEXIST again after the stale removal ⇒ a live twin re-claimed ⇒ duplicate', () => {
    const fs = memFs();
    checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(1_000), maxAgeMs: 10 });
    // removeFn is a no-op ⇒ the retry hits EEXIST again, as if a twin re-claimed.
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', {
      ...fs.deps(50_000), maxAgeMs: 10, removeFn: () => {},
    })).toBe(true);
  });
});
