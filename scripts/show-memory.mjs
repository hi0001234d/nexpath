#!/usr/bin/env node
/**
 * Read-only: shows what Feature 1 has saved for a project, for manual testing
 * (testing/manual-multilingual/PROMPTS.md).
 *
 *   node scripts/show-memory.mjs [project folder]     (default: the current folder)
 *
 * Reads a copy of ~/.nexpath/prompt-store.db (never writes it, takes no lock) and lists the project's
 * saved facts (active and replaced), the MemOS summaries among them, and which memory-tool folders and
 * model exist under the home folder.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = resolve(process.argv[2] ?? process.cwd());
const home = homedir();
const dbPath = join(home, '.nexpath', 'prompt-store.db');

const { normalizeProjectId } = await import(join(R, 'dist/context-engineering/core/project-scope.js'));
const projectId = normalizeProjectId(project);

console.log(`Project: ${project}`);
if (!existsSync(dbPath)) {
  console.log('No database yet (~/.nexpath/prompt-store.db).');
} else {
  const initSqlJs = createRequire(import.meta.url)(join(R, 'node_modules/sql.js'));
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(dbPath)); // a copy in memory; never saved
  const rows = db.exec(
    'SELECT id, kind, locked, confidence, active, superseded_by, evidence, content FROM context_memory WHERE project_root = ? ORDER BY id',
    [projectId],
  )[0]?.values ?? [];
  const active = rows.filter((r) => r[4] === 1 && r[5] === null);
  const replaced = rows.filter((r) => !(r[4] === 1 && r[5] === null));
  const line = (r) => {
    const fromMemos = String(r[6] ?? '').includes('"memos"') ? ' [MemOS summary]' : '';
    return `  #${r[0]} ${r[1]}${r[2] === 1 ? ' 🔒 locked' : ''} (${Number(r[3]).toFixed(2)})${fromMemos}\n     ${r[7]}`;
  };
  console.log(`\nActive facts (${active.length}):`);
  console.log(active.length ? active.map(line).join('\n') : '  (none)');
  console.log(`\nReplaced facts (${replaced.length}):`);
  console.log(replaced.length ? replaced.map((r) => `${line(r)}\n     → replaced by #${r[5] ?? '-'}`).join('\n') : '  (none)');
  db.close();
}

const folders = [
  ['MemOS memories', join(home, '.nexpath', 'memos')],
  ['OpenClaw (Nexpath profile)', join(home, '.nexpath', 'openclaw')],
  ['Code index', join(home, '.nexpath', 'codebase-memory')],
  ['Memory model', join(home, '.cache', 'memos', 'models', 'Xenova', 'all-MiniLM-L6-v2')],
  ["User's own OpenClaw (never touched)", join(home, '.openclaw')],
];
console.log('\nFolders:');
for (const [label, dir] of folders) {
  const n = existsSync(dir) ? readdirSync(dir).length : 0;
  console.log(`  ${existsSync(dir) ? '✓' : '✗'} ${label.padEnd(38)} ${dir}${existsSync(dir) ? ` (${n} item${n === 1 ? '' : 's'})` : ''}`);
}
