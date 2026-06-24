import { describe, it, expect, vi } from 'vitest';
import { runSetupInTerminal, type RunInTerminalDeps, type TerminalLike } from './terminal-runner.js';

function fakeTerminal(): TerminalLike & { sent: string[]; shown: number } {
  return {
    sent: [],
    shown: 0,
    show() { this.shown++; },
    sendText(t: string) { this.sent.push(t); },
    dispose() {},
  };
}

/** Sentinel that becomes available after `afterPolls` reads. */
function sentinelAfter(value: string | null, afterPolls: number) {
  let reads = 0;
  return () => {
    reads++;
    return reads > afterPolls ? value : null;
  };
}

function baseDeps(over: Partial<RunInTerminalDeps> = {}): { deps: RunInTerminalDeps; term: ReturnType<typeof fakeTerminal>; cleared: { n: number } } {
  const term = fakeTerminal();
  const cleared = { n: 0 };
  let t = 0;
  const deps: RunInTerminalDeps = {
    createTerminal: () => term,
    readSentinel: () => null,
    clearSentinel: () => { cleared.n++; },
    now: () => (t += 100),
    sleep: vi.fn(async () => {}),
    ...over,
  };
  return { deps, term, cleared };
}

describe('runSetupInTerminal', () => {
  it('clears stale sentinel, shows the terminal, and sends the command', async () => {
    const { deps, term, cleared } = baseDeps({ readSentinel: sentinelAfter('OK', 1) });
    const r = await runSetupInTerminal('node runner', deps, { pollMs: 1 });
    expect(cleared.n).toBe(1);
    expect(term.shown).toBe(1);
    expect(term.sent).toEqual(['node runner']);
    expect(r.ok).toBe(true);
    expect(r.detail).toBe('OK');
  });

  it('resolves failure with the sentinel detail on FAIL', async () => {
    const { deps } = baseDeps({ readSentinel: sentinelAfter('FAIL:npm install', 2) });
    const r = await runSetupInTerminal('cmd', deps, { pollMs: 1 });
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('FAIL:npm install');
    expect(r.timedOut).toBe(false);
  });

  it('times out when the sentinel never appears', async () => {
    let t = 0;
    const { deps } = baseDeps({
      readSentinel: () => null,
      now: () => (t += 1000),
    });
    const r = await runSetupInTerminal('cmd', deps, { timeoutMs: 3000, pollMs: 1 });
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.detail).toBe('timeout');
  });
});
