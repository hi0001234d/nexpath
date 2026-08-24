import { describe, it, expect } from 'vitest';
import { parseAutoHookPayload } from './auto.js';

describe('parseAutoHookPayload', () => {
  it('captures the prompt text and the reported permission mode', () => {
    const raw = JSON.stringify({ prompt: '  build the login form  ', permission_mode: 'plan' });
    expect(parseAutoHookPayload(raw)).toEqual({ promptText: 'build the login form', currentAgentMode: 'plan' });
  });

  it('passes an unrecognised mode value through verbatim (enum is not closed)', () => {
    const raw = JSON.stringify({ prompt: 'x', permission_mode: 'some_future_mode' });
    expect(parseAutoHookPayload(raw).currentAgentMode).toBe('some_future_mode');
  });

  it('leaves the mode undefined when the payload omits permission_mode', () => {
    const parsed = parseAutoHookPayload(JSON.stringify({ prompt: 'x' }));
    expect(parsed.promptText).toBe('x');
    expect(parsed.currentAgentMode).toBeUndefined();
  });

  it('ignores a non-string permission_mode', () => {
    const raw = JSON.stringify({ prompt: 'x', permission_mode: 42 });
    expect(parseAutoHookPayload(raw).currentAgentMode).toBeUndefined();
  });

  it('captures the transcript path when the payload reports it', () => {
    const raw = JSON.stringify({ prompt: 'x', transcript_path: '/home/u/.claude/projects/p/s.jsonl' });
    expect(parseAutoHookPayload(raw).transcriptPath).toBe('/home/u/.claude/projects/p/s.jsonl');
  });

  it('leaves the transcript path undefined when missing, empty, or non-string', () => {
    expect(parseAutoHookPayload(JSON.stringify({ prompt: 'x' })).transcriptPath).toBeUndefined();
    expect(parseAutoHookPayload(JSON.stringify({ prompt: 'x', transcript_path: '' })).transcriptPath).toBeUndefined();
    expect(parseAutoHookPayload(JSON.stringify({ prompt: 'x', transcript_path: 9 })).transcriptPath).toBeUndefined();
  });

  it('returns an empty result for malformed JSON', () => {
    expect(parseAutoHookPayload('not json {')).toEqual({});
  });

  it('returns an empty result for an empty string', () => {
    expect(parseAutoHookPayload('')).toEqual({});
  });
});
