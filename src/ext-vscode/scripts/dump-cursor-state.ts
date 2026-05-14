#!/usr/bin/env node
/**
 * scripts/dump-cursor-state.ts — capture a verified `state.vscdb` fixture
 * from a real machine for extractor regression testing.
 *
 * Run this on any machine where Cursor (or Windsurf) is installed, against
 * a chosen Cursor version. It:
 *   1. Locates the Cursor `state.vscdb` for the OS the script is running on
 *      (or accepts an explicit `--src` override).
 *   2. Opens the SQLite ItemTable with sql.js.
 *   3. Writes a JSON snapshot of all chat-related keys (and only those keys
 *      — filenames, recents, theme settings, etc. are filtered out) to
 *      `src/ext-vscode/test-fixtures/state-vscdb-samples/<name>.json`.
 *
 * The fixture file is suitable for committing to the repo (no personal data
 * leaks of unrelated VS Code state) and can be replayed against extractors
 * in unit tests to verify the per-version decoders.
 *
 * Usage:
 *   npx tsx src/ext-vscode/scripts/dump-cursor-state.ts \
 *     --name cursor-v2025-q2-real \
 *     [--src /path/to/state.vscdb]
 *
 * NOTE: even after filtering to chat keys, the values may contain prompt
 * text the user typed. Review the JSON output before committing and redact
 * any sensitive content. The `--redact` flag (below) replaces all prompt
 * text with a fixed string of the same length.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, platform as osPlatform } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM-friendly equivalent of __dirname (sub-package uses "type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Prefixes of ItemTable keys that should be captured. Everything else is dropped. */
const KEEP_KEY_PREFIXES = [
  'aiService.',
  'composerData.',
  'cursorAIChatService.',
  'cursorAIService.',
  'cascade.',
];

interface CliArgs {
  name: string;
  src?: string;
  redact: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { redact: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') args.name = argv[++i];
    else if (a === '--src') args.src = argv[++i];
    else if (a === '--redact') args.redact = true;
    else if (a === '--help' || a === '-h') {
      printUsageAndExit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printUsageAndExit(1);
    }
  }
  if (!args.name) {
    console.error('Missing required --name <fixture-name>');
    printUsageAndExit(1);
  }
  return args as CliArgs;
}

function printUsageAndExit(code: number): never {
  console.log(`Usage:
  npx tsx scripts/dump-cursor-state.ts --name <fixture-name> [--src <path>] [--redact]

Options:
  --name <s>     Fixture file name (no extension). REQUIRED.
                 Convention: cursor-v<YEAR>-q<Q>-real / windsurf-real.
  --src <path>   Path to state.vscdb. If omitted, default OS path is used.
  --redact       Replace prompt text with same-length placeholder strings.
                 Use this if the dump may contain sensitive content.

Output:
  src/ext-vscode/test-fixtures/state-vscdb-samples/<name>.json
`);
  process.exit(code);
}

function defaultCursorStatePath(): string {
  const home = homedir();
  switch (osPlatform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    case 'win32':
      return join(process.env.APPDATA ?? home, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    default:
      return join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
}

interface SqlJsModuleShape {
  default: () => Promise<{
    Database: new (data: Uint8Array) => {
      exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
      close(): void;
    };
  }>;
}

async function readItemTable(dbBytes: Buffer): Promise<Array<{ key: string; value: string }>> {
  const mod = (await import('sql.js')) as unknown as SqlJsModuleShape;
  const SQL = await mod.default();
  const db = new SQL.Database(new Uint8Array(dbBytes));
  try {
    const result = db.exec('SELECT key, value FROM ItemTable');
    const rows: Array<{ key: string; value: string }> = [];
    for (const r of result) {
      for (const v of r.values) {
        rows.push({ key: String(v[0]), value: String(v[1]) });
      }
    }
    return rows;
  } finally {
    db.close();
  }
}

function shouldKeep(key: string): boolean {
  return KEEP_KEY_PREFIXES.some((p) => key.startsWith(p));
}

function redactValue(value: string): string {
  // Best-effort: try to parse and replace any string field longer than 8 chars.
  try {
    const parsed = JSON.parse(value);
    const redacted = JSON.parse(JSON.stringify(parsed), (_k, v) => {
      if (typeof v === 'string' && v.length > 8) return '*'.repeat(v.length);
      return v;
    });
    return JSON.stringify(redacted);
  } catch {
    // not JSON — redact in bulk
    return '*'.repeat(value.length);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const srcPath = args.src ?? defaultCursorStatePath();

  if (!existsSync(srcPath)) {
    console.error(`state.vscdb not found at: ${srcPath}`);
    console.error('Pass --src <path> to override.');
    process.exit(2);
  }

  console.log(`Reading: ${srcPath}`);
  const bytes = await readFile(srcPath);
  const rows = await readItemTable(bytes);
  console.log(`Found ${rows.length} total ItemTable rows.`);

  const kept = rows.filter((r) => shouldKeep(r.key));
  console.log(`Keeping ${kept.length} chat-related rows (key prefixes: ${KEEP_KEY_PREFIXES.join(', ')}).`);

  const finalRows = args.redact
    ? kept.map((r) => ({ key: r.key, value: redactValue(r.value) }))
    : kept;

  if (args.redact) {
    console.log('Redacted all string values longer than 8 chars.');
  }

  const fixture = {
    capturedAt: new Date().toISOString(),
    sourcePath: srcPath,
    platform: osPlatform(),
    redacted: args.redact,
    rows: finalRows,
  };

  const repoRoot = resolve(__dirname, '..', '..', '..', '..');
  const outDir = join(
    repoRoot,
    'src',
    'ext-vscode',
    'test-fixtures',
    'state-vscdb-samples',
  );
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${args.name}.json`);
  await writeFile(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');

  console.log(`Wrote: ${outPath}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the JSON for any sensitive content before committing.');
  console.log('  2. Re-run with --redact if needed.');
  console.log('  3. Reference this fixture from the relevant extractor test.');
}

main().catch((err: unknown) => {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
