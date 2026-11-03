// V1 vs v1(a) on a prompt set: real `nexpath auto` / `nexpath stop` hooks from the v2 build, plus,
// after each `auto`, exactly what Feature 1 hands to the writer AI and (with a key) the popup text.
//
//   REAL_HOME=$HOME HOME=<empty dir> node testing/v1a-compare/run.mjs <v1|tools> <prompts.json> <out.json> [thinkMs]
// (Node 24.22+, after `npm run build`; see README.md in this folder)
//
// The key is read from the real home the way the hooks read it (env, keychain, ~/.nexpath file,
// Nexpath token) and handed to the hooks through the environment; it is never printed.
// Everything else (database, worker, MemOS, OpenClaw, codebase-memory-mcp) lives under HOME.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = resolve(dirname(fileURLToPath(import.meta.url)), '../..'); // the repo root (uses its dist/)
const [mode, promptsArg, outArg, thinkArg] = process.argv.slice(2);
const promptsFile = resolve(promptsArg);
const outFile = resolve(outArg);
const tools = mode === 'tools';
const thinkMs = Number(thinkArg ?? 4000);
const testHome = process.env.HOME;

// 1. the key, from the real home
let keySource = 'none';
if (process.env.REAL_HOME) {
  process.env.HOME = process.env.REAL_HOME;
  const keys = await import(join(R, 'dist/config/ApiKeyResolver.js'));
  keySource = await keys.getKeySource(process.env.REAL_HOME);
  await keys.resolveOpenAIKey(process.env.REAL_HOME).catch(() => null);
  process.env.HOME = testHome;
}
console.log(`mode ${mode}, key source: ${keySource}`);

const cli = join(R, 'dist/cli/index.js');
const db = join(testHome, '.nexpath', 'prompt-store.db');
const project = join(testHome, 'project');
const { openStore, closeStore } = await import(join(R, 'dist/store/db.js'));
const { setConfig } = await import(join(R, 'dist/store/config.js'));
const ce = await import(join(R, 'dist/context-engineering/index.js'));
const { cliWorkerSources, requestWorker } = await import(join(R, 'dist/context-engineering/worker/worker-client.js'));
const { stopFeature1Worker } = await import(join(R, 'dist/context-engineering/worker/tools-status.js'));
const { workerPaths } = await import(join(R, 'dist/context-engineering/worker/protocol.js'));

const set = JSON.parse(readFileSync(promptsFile, 'utf8'));
for (const [f, body] of Object.entries(set.files)) {
  mkdirSync(dirname(join(project, f)), { recursive: true });
  writeFileSync(join(project, f), body);
}
execFileSync('git', ['init', '-q'], { cwd: project });
{
  const store = await openStore(db);
  setConfig(store, 'feature1_tools', tools ? 'on' : 'off');
  closeStore(store);
}

const env = { ...process.env, HOME: testHome };
delete env.DISPLAY;
delete env.WAYLAND_DISPLAY;
delete env.NEXPATH_DESKTOP_SESSION;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hookAuto = (prompt) =>
  spawnSync(process.execPath, [cli, 'auto', '--project', project, prompt], { cwd: project, env, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
const hookStop = (reply) =>
  spawnSync(process.execPath, [cli, 'stop'], {
    cwd: project, env, encoding: 'utf8', timeout: 120_000,
    input: JSON.stringify({ session_id: 'claude-session', cwd: project, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: reply }),
  });

async function withStore(fn) {
  const store = await openStore(db);
  try { return await fn(store); } finally { closeStore(store); }
}
const q = (store, sql) => store.db.exec(sql)[0]?.values ?? [];
async function newSession() {
  await withStore((store) => {
    for (const [root, json] of q(store, 'SELECT project_root, state_json FROM session_states')) {
      const s = JSON.parse(json);
      s.lastPromptAt = Date.now() - 31 * 60_000;
      store.db.run('UPDATE session_states SET state_json = ? WHERE project_root = ?', [JSON.stringify(s), root]);
    }
  });
}
// Simulates the map's retention cleanup ("old rows removed"): every row recorded so far is gone.
const wipeMap = () => withStore((store) => { const n = q(store, 'SELECT COUNT(*) FROM context_memory')[0][0]; store.db.run('DELETE FROM context_memory'); return n; });
const maxId = (table) => withStore((store) => Number(q(store, `SELECT COALESCE(MAX(id), 0) FROM ${table}`)[0]?.[0] ?? 0));
const popupSince = (id) => withStore((store) =>
  q(store, `SELECT result_json FROM pending_prompt_enhancements WHERE id > ${id} ORDER BY id DESC LIMIT 1`).map((r) => {
    try { return JSON.parse(r[0])?.currentBody?.text ?? ''; } catch { return ''; }
  })[0] ?? '');
const whatF1HandsToWriter = (prompt, opensNewSession) => withStore(async (store) => {
  // Same session id the hook uses, so "each fact once per session" applies here too. A prompt
  // that opens a new session has nothing shown yet (the hook creates that session first).
  const state = q(store, 'SELECT state_json FROM session_states')[0];
  const sessionId = state && !opensNewSession ? JSON.parse(state[0]).sessionId : undefined;
  const t0 = performance.now();
  const r = await ce.preparePromptEnhancementWithSections(prompt, { workspacePath: project, store, sessionId }, {
    recordDelivery: false, skipLlmRewrite: true, ...(tools ? { sources: cliWorkerSources().drivers } : {}),
  });
  return { ms: Math.round(performance.now() - t0), r };
});
const sourceOf = (f) => (f.id > 0 ? 'map' : f.kind === 'memos_recall' ? 'memos' : f.kind === 'openclaw_recall' ? 'openclaw' : 'code');

const rows = [];
let phase = '';
for (const p of set.prompts) {
  if (p.phase && p.phase !== phase) { phase = p.phase; console.log(`\n── ${phase}`); }
  if (p.newSession) {
    await newSession();
    if (tools) await sleep(Math.max(thinkMs, 30_000)); // a new session comes after a long gap
  }
  if (p.wipeMap) console.log(`   (map cleanup: ${await wipeMap()} rows removed)`);
  // What Feature 1 hands to the writer, seen exactly as the hook sees it: before this prompt's
  // popup marks anything as shown.
  const { ms: f1Ms, r } = await whatF1HandsToWriter(p.prompt, Boolean(p.newSession));
  const beforePending = await maxId('pending_prompt_enhancements');
  const t0 = Date.now();
  const a = hookAuto(p.prompt);
  const autoMs = Date.now() - t0;
  const popup = keySource !== 'none' ? await popupSince(beforePending) : '';
  const facts = r.isEnhanced ? r.facts ?? [] : [];

  let status = 'INFO';
  const found = [];
  const problems = [];
  if (p.expect === 'context') {
    for (const group of p.shows) {
      const by = [...new Set(facts.filter((f) => group.some((s) => f.content.toLowerCase().includes(s.toLowerCase()))).map(sourceOf))];
      found.push({ need: group[0], by, inPopup: popup ? group.some((s) => popup.toLowerCase().includes(s.toLowerCase())) : null });
      if (by.length === 0) problems.push(`missing "${group[0]}"`);
    }
    for (const old of p.notShows ?? []) {
      const by = [...new Set(facts.filter((f) => f.content.toLowerCase().includes(old.toLowerCase())).map(sourceOf))];
      if (by.length) problems.push(`OLD value "${old}" from ${by.join('+')}`);
    }
    status = problems.some((x) => x.startsWith('OLD')) ? 'OLD' : problems.length ? 'MISS' : 'FOUND';
  } else if (p.expect === 'no-context') {
    if (facts.length) problems.push(`memory used: ${facts.map((f) => `[${sourceOf(f)}] ${f.content}`).join(' / ').slice(0, 140)}`);
    status = problems.length ? 'NOISE' : 'CLEAN';
  }
  const t1 = Date.now();
  const s = hookStop(p.reply);
  const stopMs = Date.now() - t1;
  rows.push({
    id: p.id, prompt: p.prompt, expect: p.expect, status, found, problems, autoMs, f1Ms, stopMs, autoExit: a.status, stopExit: s.status,
    facts: facts.map((f) => ({ source: sourceOf(f), kind: f.kind, locked: f.locked, content: f.content })), popup,
  });
  const where = found.map((x) => `${x.need}←${x.by.join('+') || '—'}${x.inPopup === null ? '' : x.inPopup ? ' (popup ✓)' : ' (popup ✗)'}`).join(', ');
  console.log(`${status.padEnd(5)} #${String(p.id).padStart(2)} auto ${autoMs}ms f1 ${f1Ms}ms  ${where}${problems.length && status !== 'MISS' ? '  ↳ ' + problems.join('; ') : ''}`);
  await sleep(thinkMs);
}

const extra = { keySource };
if (tools) {
  try { extra.workerStatus = await requestWorker(workerPaths(join(testHome, '.nexpath')).socket, { type: 'status' }, 3000); } catch (e) { extra.workerStatus = String(e); }
  try { if (extra.workerStatus?.pid) extra.workerRssMb = Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(extra.workerStatus.pid)], { encoding: 'utf8' }).trim()) / 1024); } catch {}
  extra.stopped = await stopFeature1Worker(join(testHome, '.nexpath'));
  await sleep(15_000);
  const agents = join(testHome, '.nexpath/openclaw/agents');
  extra.openclawFiles = {};
  if (existsSync(agents)) for (const ag of readdirSync(agents)) {
    const m = join(agents, ag, 'workspace', 'memory');
    if (existsSync(m)) for (const f of readdirSync(m)) extra.openclawFiles[`${ag}/${f}`] = readFileSync(join(m, f), 'utf8');
  }
}
extra.mapRows = await withStore((store) => q(store, 'SELECT kind, locked, content FROM context_memory ORDER BY id'));
const count = (k) => rows.filter((x) => x.status === k).length;
const summary = { mode, keySource, found: count('FOUND'), miss: count('MISS'), old: count('OLD'), clean: count('CLEAN'), noise: count('NOISE') };
writeFileSync(outFile, JSON.stringify({ summary, rows, extra }, null, 2));
console.log('\n' + JSON.stringify(summary));
