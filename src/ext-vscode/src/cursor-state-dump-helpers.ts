/**
 * Pure / near-pure helpers used by `scripts/dump-cursor-state.ts`.
 *
 * These live in `src/` (and not next to the script) for two reasons:
 *   1. They're typechecked by the sub-package's main `tsconfig.json`
 *      (rootDir = `./src`).
 *   2. They're picked up by vitest for co-located unit testing via the
 *      `cursor-state-dump-helpers.test.ts` sibling.
 *
 * The script in `scripts/dump-cursor-state.ts` imports these helpers and
 * adds the I/O orchestration on top.
 *
 * None of these helpers are referenced by `src/extension.ts`, so the
 * production esbuild bundle does not include them.
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** ItemTable key prefixes the dump should keep — everything else is dropped. */
export const KEEP_ITEMTABLE_PREFIXES = [
  'aiService.',
  'composer.',
  'composerData.',
  'cursorAIService.',
  'cursorAIChatService.',
  'cascade.',
  'workbench.panel.composerChatViewPane.',
  'workbench.panel.aichat.',
  'workbench.backgroundComposer.',
] as const;

/**
 * Return true iff the ItemTable row key should be retained in the dump.
 * Filters out unrelated VS Code state (recents, themes, terminal, etc.).
 */
export function shouldKeepItemTable(
  key: string,
  prefixes: readonly string[] = KEEP_ITEMTABLE_PREFIXES,
): boolean {
  return prefixes.some((p) => key.startsWith(p));
}

/**
 * Redact long string values inside a row's `value` field.
 *
 * Behaviour:
 *   - If the value parses as JSON: recursively replace every string longer
 *     than 8 chars with same-length asterisks. Numbers, booleans, nulls,
 *     and short strings are preserved.
 *   - If the value is not JSON: replace the whole string with asterisks of
 *     the same length.
 *
 * The 8-char threshold preserves common short markers (`user`, `assistant`,
 * `linux`, etc.) while obscuring prompt text, tab IDs, paths, etc.
 */
export function redactValue(value: string): string {
  try {
    const parsed = JSON.parse(value);
    const redacted = JSON.parse(JSON.stringify(parsed), (_k, v) => {
      if (typeof v === 'string' && v.length > 8) return '*'.repeat(v.length);
      return v;
    });
    return JSON.stringify(redacted);
  } catch {
    return '*'.repeat(value.length);
  }
}

export interface CursorConfigRootInputs {
  platform?: NodeJS.Platform;
  home?: string;
  appdata?: string;
}

/**
 * Resolve the OS-specific Cursor configuration root.
 *
 * Linux:    ~/.config/Cursor
 * macOS:    ~/Library/Application Support/Cursor
 * Windows:  %APPDATA%/Cursor (falls back to <home>/AppData/Roaming/Cursor)
 *
 * Inputs are injectable for testability — defaults to the live process
 * environment.
 */
export function cursorConfigRoot(inputs: CursorConfigRootInputs = {}): string {
  const platform = inputs.platform ?? process.platform;
  const home = inputs.home ?? homedir();
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Cursor');
    case 'win32': {
      const appdata =
        inputs.appdata ?? process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
      return join(appdata, 'Cursor');
    }
    default:
      return join(home, '.config', 'Cursor');
  }
}

export interface DiscoveredDb {
  path: string;
  /** Short label for the output filename, e.g. 'global' or 'workspace-<id>'. */
  label: string;
}

export interface DiscoveryFs {
  existsSync: (p: string) => boolean;
  readdirSync: (p: string) => string[];
}

/**
 * Discover every `state.vscdb` under a Cursor config root — both the global
 * one and one per workspace under `User/workspaceStorage/`.
 *
 * Returns labelled entries so each gets a distinct output filename when the
 * dump script writes its fixtures.
 */
export function discoverAllStateVscdb(
  root: string,
  fsHelpers: DiscoveryFs = { existsSync, readdirSync },
): DiscoveredDb[] {
  const found: DiscoveredDb[] = [];
  const globalPath = join(root, 'User', 'globalStorage', 'state.vscdb');
  if (fsHelpers.existsSync(globalPath)) {
    found.push({ path: globalPath, label: 'global' });
  }
  const wsDir = join(root, 'User', 'workspaceStorage');
  if (fsHelpers.existsSync(wsDir)) {
    for (const entry of fsHelpers.readdirSync(wsDir)) {
      const dbPath = join(wsDir, entry, 'state.vscdb');
      if (fsHelpers.existsSync(dbPath)) {
        found.push({ path: dbPath, label: `workspace-${entry}` });
      }
    }
  }
  return found;
}

export interface CliArgs {
  name: string;
  src?: string;
  redact: boolean;
}

export type ParseArgsResult =
  | { ok: true; args: CliArgs }
  | { ok: false; error: string; help?: true };

/**
 * Parse the `dump-cursor-state` CLI arguments without ever calling
 * `process.exit` directly — so unit tests can exercise the error paths.
 *
 * The script entry-point handles `result.ok === false` by printing the
 * error / usage and exiting with the appropriate code.
 */
export function parseArgs(argv: readonly string[]): ParseArgsResult {
  const args: Partial<CliArgs> = { redact: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') {
      const v = argv[++i];
      if (v === undefined) return { ok: false, error: '--name requires a value' };
      args.name = v;
    } else if (a === '--src') {
      const v = argv[++i];
      if (v === undefined) return { ok: false, error: '--src requires a value' };
      args.src = v;
    } else if (a === '--redact') {
      args.redact = true;
    } else if (a === '--help' || a === '-h') {
      return { ok: false, error: '', help: true };
    } else {
      return { ok: false, error: `Unknown argument: ${a}` };
    }
  }
  if (!args.name) {
    return { ok: false, error: 'Missing required --name <fixture-name>' };
  }
  return { ok: true, args: args as CliArgs };
}
