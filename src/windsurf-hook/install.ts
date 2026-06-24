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

/** Every Cascade event nexpath has ever owned — iterated on cleanup/removal. */
export const WINDSURF_HOOK_EVENTS = ['pre_user_prompt', 'post_cascade_response'] as const;
export type WindsurfHookEvent = (typeof WINDSURF_HOOK_EVENTS)[number];

/**
 * Events nexpath WRITES:
 *   - `pre_user_prompt`       → `nexpath auto`  (capture + park advisory)
 *   - `post_cascade_response` → `nexpath stop`  (the terminal popup — PRIMARY
 *      advisory surface, same as Claude Code / Cursor)
 *
 * The popup is the primary surface on Windsurf too. Its selection can't return
 * through the read-only hook, but the extension bridges it: `stop` persists the
 * choice to `session_states.lastInjectedPrompt`, and the extension injects that
 * into Cascade. The in-editor surface (status bar → sidebar) is only the fallback
 * for when the popup couldn't open.
 */
export const WINDSURF_WRITE_EVENTS = ['pre_user_prompt', 'post_cascade_response'] as const;
export type WindsurfWriteEvent = (typeof WINDSURF_WRITE_EVENTS)[number];

interface HookEntry { command?: string; powershell?: string; [k: string]: unknown }

/** Path to Windsurf's user-level hooks file: `~/.codeium/windsurf/hooks.json`. */
export function getWindsurfHooksPath(home: string): string {
  return join(home, '.codeium', 'windsurf', 'hooks.json');
}

/**
 * The macOS/Linux hook command (Cascade runs `command` via **`bash -c`**):
 *   `"<nodePath>" "<cliPath>" windsurf-hook <event>`
 *
 * **Absolute `node` AND cli path**, both forward-slashed. The language server spawns
 * hook commands with a **sanitized PATH** that may not contain `node`, so a bare
 * `node` can ENOENT silently → the hook never runs → capture is 0. Embedding
 * `process.execPath` (the absolute node binary running `nexpath install`) removes
 * that PATH dependency. `nodePath` is injectable for tests.
 */
export function buildWindsurfHookCommand(
  cliPath: string,
  event: WindsurfHookEvent,
  nodePath: string = process.execPath,
): string {
  const node = nodePath.replace(/\\/g, '/');
  const abs = resolve(cliPath).replace(/\\/g, '/');
  return `"${node}" "${abs}" windsurf-hook ${event}`;
}

/**
 * The Windows hook command (Cascade runs `powershell` via **`powershell -Command`**).
 *
 * Two PowerShell facts make the plain `command` field fail on Windows — which is
 * why capture worked on Linux (bash) but was 0 on Devin/Devin Next (Windows):
 *   1. PowerShell will NOT execute an executable given as a *quoted* path unless it
 *      is preceded by the **`&` call operator** — without it the string is just
 *      echoed, never run.
 *   2. `node` may not be on the spawned PowerShell's PATH → absolute node is required.
 *
 * So the Windows variant is `& "<node>" "<cli>" windsurf-hook <event>` with NATIVE
 * paths (back-slashes on Windows — JSON-escaped on write). Cascade falls back to
 * `command` under PowerShell when no `powershell` field is present, hence the prior
 * silent failure; supplying `powershell` fixes it.
 */
export function buildWindsurfHookPowershell(
  cliPath: string,
  event: WindsurfHookEvent,
  nodePath: string = process.execPath,
): string {
  return `& "${nodePath}" "${resolve(cliPath)}" windsurf-hook ${event}`;
}

/**
 * One hook entry carrying BOTH platform commands — `command` (bash, macOS/Linux)
 * and `powershell` (Windows). Providing both is what makes capture work on every OS;
 * the installer/test machine's own paths are baked in.
 */
export function buildWindsurfHookEntry(
  cliPath: string,
  event: WindsurfHookEvent,
  nodePath: string = process.execPath,
): HookEntry {
  return {
    command: buildWindsurfHookCommand(cliPath, event, nodePath),
    powershell: buildWindsurfHookPowershell(cliPath, event, nodePath),
  };
}

/** True if a hook entry is one nexpath wrote (identified by the windsurf-hook command). */
export function isNexpathWindsurfHook(entry: HookEntry): boolean {
  const hasMarker = (v: unknown): boolean => typeof v === 'string' && v.includes('windsurf-hook');
  return hasMarker(entry.command) || hasMarker(entry.powershell);
}

/** Build the hook entries nexpath writes: capture (auto) + popup (stop). */
export function buildWindsurfHooksConfig(cliPath: string): Record<WindsurfWriteEvent, HookEntry[]> {
  return {
    pre_user_prompt:       [buildWindsurfHookEntry(cliPath, 'pre_user_prompt')],
    post_cascade_response: [buildWindsurfHookEntry(cliPath, 'post_cascade_response')],
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
  const cfg = buildWindsurfHooksConfig(cliPath) as Record<string, HookEntry[]>;
  // Iterate ALL events: strip any prior nexpath entries (so a stale
  // post_cascade_response from an older install is dropped), then re-add only
  // the events we write today. Other tools' hooks are preserved; an event left
  // with no entries is removed entirely rather than written as an empty array.
  for (const event of WINDSURF_HOOK_EVENTS) {
    const kept = Array.isArray(hooks[event]) ? hooks[event].filter((h) => !isNexpathWindsurfHook(h)) : [];
    const merged = [...kept, ...(cfg[event] ?? [])];
    if (merged.length === 0) delete hooks[event];
    else hooks[event] = merged;
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
