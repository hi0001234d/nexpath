#!/usr/bin/env node
/**
 * scripts/dump-cursor-state.ts — capture verified `state.vscdb` fixtures
 * from a real machine for extractor regression testing.
 *
 * Pure helpers (filtering, redaction, arg parsing, path resolution,
 * discovery) live in `src/cursor-state-dump-helpers.ts` so they're
 * typechecked and unit-tested. This file owns only the I/O orchestration:
 * copy-to-staging-dir, SQLite read via better-sqlite3, and writing
 * fixture JSON files.
 *
 * Run after Cursor has been used (especially after real prompts have been
 * sent) so the fixtures contain the actual chat data. See the JSDoc in
 * each `src/extractors/*.ts` file for current schema-finding status.
 *
 * Usage:
 *   npx tsx scripts/dump-cursor-state.ts --name <fixture-name> [--redact] [--src <path>]
 */

import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { platform as osPlatform, tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cursorConfigRoot,
  discoverAllStateVscdb,
  parseArgs,
  redactValue,
  shouldKeepItemTable,
  type DiscoveredDb,
} from '../src/cursor-state-dump-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DumpedRow {
  table: 'ItemTable' | 'cursorDiskKV';
  key: string;
  value: string;
}

interface DumpedDb {
  capturedAt: string;
  sourcePath: string;
  platform: string;
  redacted: boolean;
  /** Names of all tables present (useful for schema-fingerprint diagnostics). */
  tables: string[];
  /** Rows kept after filtering. */
  rows: DumpedRow[];
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/dump-cursor-state.ts --name <fixture-name> [--src <path>] [--redact]

Options:
  --name <s>     Fixture name prefix (no extension). REQUIRED.
                 One output file per discovered state.vscdb, suffixed with
                 the source kind (global / workspace-<id>).
  --src <path>   Path to a single state.vscdb. If omitted, all state.vscdb
                 files under the OS's Cursor config tree are dumped.
  --redact       Replace string values longer than 8 chars with same-length
                 placeholders. Use this if dumps may contain sensitive content.

Output:
  src/ext-vscode/test-fixtures/state-vscdb-samples/<name>-<suffix>.json
`);
}

/**
 * better-sqlite3 is WAL-aware: it reads the main DB and the sibling -wal/-shm
 * transparently. We copy all three siblings to a tmp dir so we never touch
 * the file Cursor is actively writing to.
 */
async function readDbAsSnapshot(path: string): Promise<DumpedDb> {
  const stagingDir = join(
    tmpdir(),
    `nexpath-dump-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mkdir(stagingDir, { recursive: true });
  const stagedMain = join(stagingDir, basename(path));
  await copyFile(path, stagedMain);
  for (const suffix of ['-wal', '-shm'] as const) {
    const sibling = path + suffix;
    if (existsSync(sibling)) {
      await copyFile(sibling, stagedMain + suffix);
    }
  }

  const mod = (await import('better-sqlite3')) as unknown as {
    default: new (path: string, options?: { readonly?: boolean }) => {
      prepare(sql: string): {
        all(...params: unknown[]): Array<Record<string, unknown>>;
      };
      pragma(pragma: string): unknown;
      close(): void;
    };
  };
  const Database = mod.default;
  const db = new Database(stagedMain, { readonly: true });
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // not WAL — fine
  }

  const dump: DumpedDb = {
    capturedAt: new Date().toISOString(),
    sourcePath: path,
    platform: osPlatform(),
    redacted: false,
    tables: [],
    rows: [],
  };

  const tables = (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as Array<{ name: string }>
  ).map((r) => r.name);
  dump.tables = tables;

  if (tables.includes('ItemTable')) {
    const rows = db
      .prepare('SELECT key, value FROM ItemTable')
      .all() as Array<{ key: string; value: string }>;
    for (const r of rows) {
      if (!shouldKeepItemTable(r.key)) continue;
      dump.rows.push({ table: 'ItemTable', key: r.key, value: r.value });
    }
  }
  if (tables.includes('cursorDiskKV')) {
    const rows = db
      .prepare('SELECT key, value FROM cursorDiskKV')
      .all() as Array<{ key: string; value: string }>;
    for (const r of rows) {
      dump.rows.push({ table: 'cursorDiskKV', key: r.key, value: r.value });
    }
  }

  db.close();
  return dump;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    if (parsed.help) {
      printUsage();
      process.exit(0);
    }
    console.error(parsed.error);
    printUsage();
    process.exit(1);
  }
  const args = parsed.args;

  const targets: DiscoveredDb[] = args.src
    ? [{ path: args.src, label: 'src' }]
    : discoverAllStateVscdb(cursorConfigRoot());

  if (targets.length === 0) {
    console.error(`No state.vscdb files found under: ${cursorConfigRoot()}`);
    console.error('Pass --src <path> for a single file.');
    process.exit(2);
  }

  console.log(`Discovered ${targets.length} state.vscdb file(s):`);
  for (const t of targets) console.log(`  - [${t.label}] ${t.path}`);
  console.log('');

  const subPackageRoot = resolve(__dirname, '..');
  const outDir = join(subPackageRoot, 'test-fixtures', 'state-vscdb-samples');
  await mkdir(outDir, { recursive: true });

  for (const t of targets) {
    try {
      const dump = await readDbAsSnapshot(t.path);
      if (args.redact) {
        dump.redacted = true;
        for (const row of dump.rows) {
          row.value = redactValue(row.value);
        }
      }
      const outPath = join(outDir, `${args.name}-${t.label}.json`);
      await writeFile(outPath, JSON.stringify(dump, null, 2) + '\n', 'utf8');
      console.log(
        `[${t.label}] ${dump.rows.length} rows kept (${dump.tables.join(
          ', ',
        )}) → ${outPath}`,
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(`[${t.label}] ERROR: ${e.message}`);
    }
  }

  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the JSON files for sensitive content before committing.');
  console.log('  2. Re-run with --redact if needed.');
  console.log('  3. Reference these fixtures from extractor regression tests.');
}

main().catch((err: unknown) => {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
