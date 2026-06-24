import { describe, it, expect, vi } from 'vitest';
import { parsePayload, runWindsurfHook } from './handler.js';
import type { SpawnDeps } from './spawn.js';

/**
 * Capture which Layer-C command the handler drives by injecting spawnFn and
 * reading back the argv + stdin payload.
 */
function trap() {
  const calls: Array<{ args: string[]; stdin: string[] }> = [];
  const spawnFn = vi.fn((_bin: string, args: string[]) => {
    const stdin: string[] = [];
    calls.push({ args, stdin });
    return {
      pid: 1, on: vi.fn(), unref: vi.fn(),
      stdin: { write: (s: string) => { stdin.push(s); return true; }, end: vi.fn() },
    } as never;
  });
  const deps: SpawnDeps = { cwd: '/ws', binaryPath: 'nexpath', spawnFn: spawnFn as never };
  return { deps, calls };
}

const PRE = JSON.stringify({
  agent_action_name: 'pre_user_prompt',
  trajectory_id: 't1',
  tool_info: { user_prompt: 'what is 2 + 2.' },
});
const POST = JSON.stringify({
  agent_action_name: 'post_cascade_response',
  trajectory_id: 't1',
  tool_info: { response: '### Planner Response\n\n4' },
});

describe('parsePayload', () => {
  it('parses a valid object', () => {
    expect(parsePayload(PRE)?.tool_info?.user_prompt).toBe('what is 2 + 2.');
  });
  it('returns null on malformed JSON', () => {
    expect(parsePayload('{not json')).toBeNull();
  });
  it('returns null on non-object JSON', () => {
    expect(parsePayload('42')).toBeNull();
  });
});

describe('runWindsurfHook — pre_user_prompt → auto', () => {
  it('drives `auto` with the raw user_prompt', () => {
    const { deps, calls } = trap();
    const r = runWindsurfHook('pre_user_prompt', PRE, deps);
    expect(r.action).toBe('auto');
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['auto', '--project', '/ws']);
    expect(JSON.parse(calls[0].stdin[0])).toEqual({ prompt: 'what is 2 + 2.' });
  });

  it('ignores an empty / whitespace prompt (no spawn)', () => {
    const { deps, calls } = trap();
    const r = runWindsurfHook('pre_user_prompt', JSON.stringify({ tool_info: { user_prompt: '   ' } }), deps);
    expect(r.action).toBe('ignored');
    expect(calls).toHaveLength(0);
  });

  it('ignores a malformed payload (no spawn, never throws)', () => {
    const { deps, calls } = trap();
    expect(runWindsurfHook('pre_user_prompt', '{bad', deps).action).toBe('ignored');
    expect(calls).toHaveLength(0);
  });
});

describe('runWindsurfHook — post_cascade_response → stop', () => {
  it('drives `stop` (response body irrelevant)', () => {
    const { deps, calls } = trap();
    const r = runWindsurfHook('post_cascade_response', POST, deps);
    expect(r.action).toBe('stop');
    expect(calls[0].args).toEqual(['stop']);
    expect(JSON.parse(calls[0].stdin[0])).toMatchObject({ cwd: '/ws', hook_event_name: 'Stop' });
  });

  it('still drives stop even if the response payload is empty (real-world wrinkle)', () => {
    const { deps, calls } = trap();
    const r = runWindsurfHook('post_cascade_response', JSON.stringify({ tool_info: { response: '' } }), deps);
    expect(r.action).toBe('stop');
    expect(calls).toHaveLength(1);
  });
});

describe('runWindsurfHook — unknown event', () => {
  it('is a no-op for an unhandled hook name', () => {
    const { deps, calls } = trap();
    expect(runWindsurfHook('pre_write_code', '{}', deps).action).toBe('ignored');
    expect(calls).toHaveLength(0);
  });
});
