/**
 * Windsurf Cascade-hook handler.
 *
 * Maps a Windsurf Cascade hook firing to the nexpath Layer-C CLI contract:
 *   - `pre_user_prompt`        → `nexpath auto` with the raw `tool_info.user_prompt`
 *   - `post_cascade_response`  → `nexpath stop`  (renders Layer C's native popup)
 *
 * Any other event / malformed payload / empty prompt is a no-op so a hook never
 * blocks or breaks Cascade. Layer C is untouched — see ./spawn.ts.
 *
 * Live-validated payload shape (windsurfVersion 2.3.9, 2026-06-04):
 *   {"agent_action_name":"pre_user_prompt","trajectory_id":"…","execution_id":"…",
 *    "model_name":"SWE-1.6 Slow","tool_info":{"user_prompt":"what is 2 + 2."}}
 */
import { spawnAuto, spawnStop, type SpawnDeps } from './spawn.js';

export type WindsurfHookEvent = 'pre_user_prompt' | 'post_cascade_response';

export interface WindsurfHookPayload {
  agent_action_name?: string;
  trajectory_id?: string;
  execution_id?: string;
  model_name?: string;
  tool_info?: { user_prompt?: string; response?: string };
}

export interface RunResult {
  action: 'auto' | 'stop' | 'ignored';
  reason?: string;
}

/** Parse the hook's stdin JSON; returns null on malformed / non-object input. */
export function parsePayload(raw: string): WindsurfHookPayload | null {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as WindsurfHookPayload) : null;
  } catch {
    return null;
  }
}

/**
 * Drive Layer C from a Windsurf hook firing.
 *
 * `event` is the hook the command was registered under (authoritative — it comes
 * from the hooks.json key, not the payload, so a malformed payload can't misroute).
 */
export function runWindsurfHook(event: string, raw: string, deps: SpawnDeps): RunResult {
  if (event === 'pre_user_prompt') {
    const prompt = parsePayload(raw)?.tool_info?.user_prompt;
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return { action: 'ignored', reason: 'no user_prompt in payload' };
    }
    spawnAuto(prompt, deps);
    return { action: 'auto' };
  }

  if (event === 'post_cascade_response') {
    // stop needs only cwd; the response body is irrelevant to rendering the advisory.
    spawnStop(deps);
    return { action: 'stop' };
  }

  return { action: 'ignored', reason: `unhandled event: ${event}` };
}
