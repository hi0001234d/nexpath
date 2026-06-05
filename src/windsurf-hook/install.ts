/**
 * Install / uninstall the Windsurf Cascade hooks that drive nexpath capture.
 *
 * Writes `~/.codeium/windsurf/hooks.json` with `pre_user_prompt` +
 * `post_cascade_response` entries that invoke `nexpath windsurf-hook <event>`
 * (via absolute `node <cli>`), idempotently. Our entries are identified by the
 * `windsurf-hook` substring in the command — we deliberately add NO marker field,
 * because the live-validated config carries none and we don't want to feed
 * Windsurf's hook parser unknown keys. Any other tools' hooks are preserved.
 *
 * **Layer C untouched** — this only writes a config file that Windsurf reads.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const WINDSURF_HOOK_EVENTS = ['pre_user_prompt', 'post_cascade_response'] as const;
export type WindsurfHookEvent = (typeof WINDSURF_HOOK_EVENTS)[number];

interface HookEntry { command?: string; [k: string]: unknown }

/** Path to Windsurf's user-level hooks file: `~/.codeium/windsurf/hooks.json`. */
export function getWindsurfHooksPath(home: string): string {
  return join(home, '.codeium', 'windsurf', 'hooks.json');
}

/**
 * The hooks.json command for one event: `node "<cliPath>" windsurf-hook <event>`.
 * Absolute node + cli path (forward slashes for Windows safety) so it runs under
 * Windsurf's sanitized hook env — the same shape as the Claude Code hook command.
 */
export function buildWindsurfHookCommand(cliPath: string, event: WindsurfHookEvent): string {
  const abs = resolve(cliPath).replace(/\\/g, '/');
  return `node "${abs}" windsurf-hook ${event}`;
}

/** True if a hook entry is one nexpath wrote (identified by the windsurf-hook command). */
export function isNexpathWindsurfHook(entry: HookEntry): boolean {
  return typeof entry.command === 'string' && entry.command.includes('windsurf-hook');
}

/** Build the two hook entries nexpath owns, for the given cli path. */
export function buildWindsurfHooksConfig(cliPath: string): Record<WindsurfHookEvent, HookEntry[]> {
  return {
    pre_user_prompt: [{ command: buildWindsurfHookCommand(cliPath, 'pre_user_prompt') }],
    post_cascade_response: [{ command: buildWindsurfHookCommand(cliPath, 'post_cascade_response') }],
  };
}

function readJsonSafe(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) return {};
    const txt = readFileSync(filePath, 'utf8').trim();
    if (!txt) return {};
    const v: unknown = JSON.parse(txt);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Write nexpath's Cascade hooks into hooks.json — preserving any other tools'
 * hooks and replacing any prior nexpath entries (idempotent). `cliPath` is the
 * path to the nexpath CLI entry (callers pass `resolve(process.argv[1])`).
 */
export function writeWindsurfHooks(filePath: string, cliPath: string): void {
  const data = readJsonSafe(filePath);
  const hooks = (data.hooks && typeof data.hooks === 'object' ? data.hooks : {}) as Record<string, HookEntry[]>;
  const cfg = buildWindsurfHooksConfig(cliPath);
  for (const event of WINDSURF_HOOK_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? hooks[event].filter((h) => !isNexpathWindsurfHook(h)) : [];
    hooks[event] = [...existing, ...cfg[event]];
  }
  data.hooks = hooks;
  writeJson(filePath, data);
}

/**
 * Remove nexpath's Cascade hooks from hooks.json; preserve everything else.
 * Returns true if any nexpath entry was removed.
 */
export function removeWindsurfHooks(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const data = readJsonSafe(filePath);
  const hooks = data.hooks && typeof data.hooks === 'object' ? (data.hooks as Record<string, HookEntry[]>) : null;
  if (!hooks) return false;
  let removed = false;
  for (const event of WINDSURF_HOOK_EVENTS) {
    if (Array.isArray(hooks[event])) {
      const before = hooks[event].length;
      const kept = hooks[event].filter((h) => !isNexpathWindsurfHook(h));
      if (kept.length !== before) removed = true;
      if (kept.length === 0) delete hooks[event];
      else hooks[event] = kept;
    }
  }
  data.hooks = hooks;
  writeJson(filePath, data);
  return removed;
}
