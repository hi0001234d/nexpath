#!/usr/bin/env node
/**
 * scripts/dev-probe.cjs — manual-testing probe tool for nexpath.
 *
 * .cjs extension forces CommonJS so it works regardless of the parent
 * package.json having "type": "module". Designed to be a one-stop shop
 * for the manual testing rounds (Round 2-4) so each test cell is one
 * command, no shell-quoting issues, no relative-path gotchas.
 *
 * Usage from anywhere:
 *   node /home/emptyops/Documents/Vedanshi/NexPathMain/reviewduel/nexpath/scripts/dev-probe.cjs <subcommand> [args]
 *
 * Or from the repo root:
 *   node scripts/dev-probe.cjs <subcommand> [args]
 *
 * Subcommands:
 *   store schema           Show columns of the prompts table
 *   store recent [N]       Show N most recent prompts (default 10)
 *   store today            Show prompts captured today
 *   store search <text>    Search prompt_text for a substring
 *   store stats            Count by agent + by day
 *
 *   cursor workspaces      List all Cursor workspaces with their state.vscdb path + row count
 *   cursor probe [ws-id]   Probe one workspace (omit ws-id to probe all)
 *   cursor extract [ws-id] Run our cursor extractors against live data; show decoded events
 *
 *   trigger ping           Verify nexpath CLI is reachable + Layer C is up
 *   trigger auto <prompt>  Manually invoke `nexpath auto` to bypass the watcher and test the capture path directly
 *
 *   config show            Show prompt_capture_enabled + other flags from the store's config table
 *   exthost-log [N]        Tail Cursor's exthost.log for the last N nexpath-tagged lines (default 30)
 *
 *   help                   Print this help
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const STORE_DB = path.join(os.homedir(), '.nexpath', 'prompt-store.db');
const CURSOR_WS_DIR = path.join(os.homedir(), '.config', 'Cursor', 'User', 'workspaceStorage');

// Load better-sqlite3 from the sub-package's node_modules (always available
// after `npm install` in src/ext-vscode/). Absolute path so we don't depend
// on cwd or relative resolution.
const BETTER_SQLITE3 = path.join(REPO_ROOT, 'src', 'ext-vscode', 'node_modules', 'better-sqlite3');
let Database;
try {
  Database = require(BETTER_SQLITE3);
} catch (e) {
  console.error('Could not load better-sqlite3 from:', BETTER_SQLITE3);
  console.error('Fix: cd', path.join(REPO_ROOT, 'src/ext-vscode'), '&& npm install');
  process.exit(2);
}

// ───────────────────────── helpers ─────────────────────────

function openStore(readonly = true) {
  if (!fs.existsSync(STORE_DB)) {
    console.error('Store DB not found at:', STORE_DB);
    console.error('Has any prompt been captured yet? Try: node dist/cli/index.js install');
    process.exit(3);
  }
  return new Database(STORE_DB, { readonly });
}

function fmtTs(t) {
  if (t == null) return '?';
  // captured_at is INTEGER ms in this schema
  if (typeof t === 'number' || /^\d+$/.test(String(t))) {
    return new Date(Number(t)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }
  return String(t);
}

function printRow(r, maxText = 100) {
  const text = String(r.prompt_text || '').slice(0, maxText);
  const at = fmtTs(r.captured_at ?? r.created_at ?? r.timestamp);
  const agent = r.agent || r.agent_id || '?';
  const project = r.project_root || r.project_id || r.project_path || '-';
  console.log(
    '  id=' + r.id,
    '| at=' + at,
    '| agent=' + agent,
    '| project=' + (typeof project === 'string' ? project.slice(-40) : project),
    '| text=' + JSON.stringify(text),
  );
}

function stagedRead(dbPath) {
  // Copy main + WAL + SHM to /tmp, checkpoint, query. Mirrors the
  // production watcher's defaultReadItemTable strategy so we read the
  // same data the watcher sees.
  const stagingDir = path.join(os.tmpdir(), 'dev-probe-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(stagingDir, { recursive: true });
  const stagedMain = path.join(stagingDir, path.basename(dbPath));
  fs.copyFileSync(dbPath, stagedMain);
  for (const suffix of ['-wal', '-shm']) {
    const sibling = dbPath + suffix;
    if (fs.existsSync(sibling)) fs.copyFileSync(sibling, stagedMain + suffix);
  }
  const db = new Database(stagedMain, { readonly: true });
  try {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
    const cleanup = () => {
      try { db.close(); } catch {}
      try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    };
    return { db, cleanup };
  } catch (e) {
    try { db.close(); } catch {}
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw e;
  }
}

function fingerprint(keys) {
  const map = {
    'cursor-v2024-q4': ['aiService.'],
    'cursor-v2025-q1': ['composer.composerData'],
    'cursor-v2025-q2': ['cursorAIChatService.chatHistory.'],
    'windsurf':        ['cascade.'],
  };
  let best = { id: null, count: 0, matchedKeys: [] };
  for (const [id, prefixes] of Object.entries(map)) {
    const matched = keys.filter(k => prefixes.some(p => k.startsWith(p)));
    if (matched.length > best.count) best = { id, count: matched.length, matchedKeys: matched };
  }
  return best.count > 0 ? best : null;
}

// ───────────────────────── subcommands ─────────────────────────

function storeSchema() {
  const db = openStore();
  console.log('Tables:');
  for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    console.log(' ', t.name);
  }
  console.log('\nColumns of "prompts":');
  for (const c of db.prepare('PRAGMA table_info(prompts)').all()) {
    console.log(' ', c.name, '(' + c.type + ')');
  }
  db.close();
}

function storeRecent(count) {
  const n = parseInt(count, 10) || 10;
  const db = openStore();
  const rows = db.prepare('SELECT * FROM prompts ORDER BY id DESC LIMIT ?').all(n);
  console.log(`Most recent ${rows.length} prompts:`);
  for (const r of rows) printRow(r);
  db.close();
}

function storeToday() {
  const db = openStore();
  // captured_at is INTEGER ms — compute "today" boundary in ms
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = db.prepare(
    'SELECT * FROM prompts WHERE captured_at >= ? AND captured_at <= ? ORDER BY id DESC'
  ).all(startOfDay.getTime(), now);
  console.log(`Prompts captured today (${startOfDay.toISOString().slice(0,10)}): ${rows.length}`);
  for (const r of rows) printRow(r);
  db.close();
}

function storeSearch(pattern) {
  if (!pattern) { console.error('Usage: store search <text>'); process.exit(1); }
  const db = openStore();
  const rows = db.prepare('SELECT * FROM prompts WHERE prompt_text LIKE ? ORDER BY id DESC LIMIT 20').all('%' + pattern + '%');
  console.log(`Matches for "${pattern}": ${rows.length}`);
  for (const r of rows) printRow(r);
  db.close();
}

function storeStats() {
  const db = openStore();
  console.log('By agent:');
  for (const r of db.prepare("SELECT agent, COUNT(*) AS n FROM prompts GROUP BY agent ORDER BY n DESC").all()) {
    console.log(' ', (r.agent || '(null)').padEnd(20), r.n);
  }
  console.log('\nBy day (last 14):');
  // captured_at is INTEGER ms — group via Date math on results
  const cutoff = Date.now() - 14 * 86400 * 1000;
  const rows = db.prepare('SELECT captured_at FROM prompts WHERE captured_at >= ? ORDER BY captured_at DESC').all(cutoff);
  const byDay = {};
  for (const r of rows) {
    const d = new Date(Number(r.captured_at)).toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + 1;
  }
  for (const day of Object.keys(byDay).sort().reverse()) {
    console.log(' ', day, byDay[day]);
  }
  db.close();
}

function cursorWorkspaces() {
  if (!fs.existsSync(CURSOR_WS_DIR)) {
    console.error('Cursor workspaceStorage dir not found:', CURSOR_WS_DIR);
    process.exit(3);
  }
  console.log('Cursor workspaces with state.vscdb:');
  for (const ws of fs.readdirSync(CURSOR_WS_DIR)) {
    const dbPath = path.join(CURSOR_WS_DIR, ws, 'state.vscdb');
    if (!fs.existsSync(dbPath)) continue;
    try {
      const { db, cleanup } = stagedRead(dbPath);
      try {
        const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").all().length;
        const n = has ? db.prepare('SELECT COUNT(*) AS n FROM ItemTable').get().n : 0;
        console.log(' ', ws.padEnd(45), 'rows=' + n);
      } finally { cleanup(); }
    } catch (e) {
      console.log(' ', ws.padEnd(45), 'ERR:', e.message);
    }
  }
}

function cursorProbe(wsId) {
  const targets = [];
  if (wsId) {
    const dbPath = path.join(CURSOR_WS_DIR, wsId, 'state.vscdb');
    if (!fs.existsSync(dbPath)) { console.error('Not found:', dbPath); process.exit(3); }
    targets.push({ ws: wsId, dbPath });
  } else {
    for (const ws of fs.readdirSync(CURSOR_WS_DIR)) {
      const dbPath = path.join(CURSOR_WS_DIR, ws, 'state.vscdb');
      if (fs.existsSync(dbPath)) targets.push({ ws, dbPath });
    }
  }

  for (const { ws, dbPath } of targets) {
    console.log('\n=== Workspace:', ws, '===');
    try {
      const { db, cleanup } = stagedRead(dbPath);
      try {
        const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").all().length;
        if (!has) { console.log('  (no ItemTable)'); continue; }
        const rows = db.prepare('SELECT key, value FROM ItemTable').all();
        const keys = rows.map(r => r.key);
        const fp = fingerprint(keys);
        console.log('  ItemTable rows:', rows.length);
        console.log('  fingerprint:', fp ? `${fp.id} (matched ${fp.count} key${fp.count===1?'':'s'})` : 'UNKNOWN');
        if (fp) console.log('  matched keys:', fp.matchedKeys.slice(0, 5).join(', '));
        console.log('  first 8 keys:', keys.slice(0, 8).join(', '));
      } finally { cleanup(); }
    } catch (e) {
      console.log('  ERR:', e.message);
    }
  }
}

function cursorExtract(wsId) {
  // Use the actual production extractors from the sub-package source
  // via tsx-equivalent (just require the compiled .ts via Node 22's
  // experimental TS support... NO, our .ts files don't compile cleanly
  // without tsc, so use the hand-rolled decoder inline below).
  //
  // For each row that the cursor-v2024-q4 prefix owns, parse the JSON
  // value and pull out prompts. This mirrors what the extractor does but
  // implemented in CJS for this probe tool.

  const targets = [];
  if (wsId) {
    const dbPath = path.join(CURSOR_WS_DIR, wsId, 'state.vscdb');
    if (!fs.existsSync(dbPath)) { console.error('Not found:', dbPath); process.exit(3); }
    targets.push({ ws: wsId, dbPath });
  } else {
    for (const ws of fs.readdirSync(CURSOR_WS_DIR)) {
      const dbPath = path.join(CURSOR_WS_DIR, ws, 'state.vscdb');
      if (fs.existsSync(dbPath)) targets.push({ ws, dbPath });
    }
  }

  for (const { ws, dbPath } of targets) {
    console.log('\n=== Workspace:', ws, '===');
    try {
      const { db, cleanup } = stagedRead(dbPath);
      try {
        const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").all().length;
        if (!has) { console.log('  (no ItemTable)'); continue; }
        const rows = db.prepare('SELECT key, value FROM ItemTable').all();
        let total = 0;

        // cursor-v2024-q4: aiService.prompts is a JSON-encoded array of {text, ...}
        for (const r of rows) {
          if (r.key !== 'aiService.prompts') continue;
          try {
            const arr = JSON.parse(r.value);
            if (!Array.isArray(arr)) continue;
            console.log('  aiService.prompts:', arr.length, 'entries');
            for (let i = 0; i < Math.min(arr.length, 5); i++) {
              const e = arr[i];
              const text = e && (e.text || e.prompt || e.content);
              if (text) {
                console.log('    [' + i + ']', JSON.stringify(String(text).slice(0, 100)));
                total++;
              }
            }
          } catch (e) {
            console.log('  aiService.prompts: parse err:', e.message);
          }
        }

        // cursor-v2025-q1: composer.composerData (metadata only on 3.4.20)
        for (const r of rows) {
          if (r.key !== 'composer.composerData') continue;
          try {
            const obj = JSON.parse(r.value);
            console.log('  composer.composerData fields:', Object.keys(obj || {}).slice(0, 10).join(', '));
          } catch {}
        }

        if (total === 0) console.log('  (no prompts decoded — workspace has no Ask-mode AI history yet)');
      } finally { cleanup(); }
    } catch (e) {
      console.log('  ERR:', e.message);
    }
  }
}

function triggerPing() {
  const { spawnSync } = require('child_process');
  console.log('PATH:', process.env.PATH);
  console.log('\nChecking nexpath CLI...');
  const r1 = spawnSync('nexpath', ['--version'], { encoding: 'utf8' });
  if (r1.error) {
    console.error('  nexpath not on PATH — run: cd', REPO_ROOT, '&& npm link');
  } else {
    console.log('  nexpath version:', r1.stdout.trim());
  }
  console.log('\nChecking Layer C status...');
  const r2 = spawnSync('node', [path.join(REPO_ROOT, 'dist', 'cli', 'index.js'), 'status'], { encoding: 'utf8' });
  if (r2.stdout) console.log(r2.stdout.split('\n').filter(l => !l.startsWith('◇')).slice(0, 12).join('\n'));
}

function triggerAuto(promptText) {
  if (!promptText) { console.error('Usage: trigger auto "<prompt text>"'); process.exit(1); }
  const { spawnSync } = require('child_process');
  const sessionId = `dev-probe|${Date.now()}`;
  const cliPath = path.join(REPO_ROOT, 'dist', 'cli', 'index.js');
  console.log('Invoking: nexpath auto with session_id=' + sessionId);
  const r = spawnSync('node', [cliPath, 'auto', promptText, '--session-id', sessionId], {
    encoding: 'utf8',
    timeout: 15000,
    cwd: REPO_ROOT,
  });
  if (r.error) { console.error('Spawn err:', r.error.message); process.exit(2); }
  console.log('Exit:', r.status);
  if (r.stdout) console.log('stdout:', r.stdout.split('\n').filter(l => !l.startsWith('◇')).join('\n'));
  if (r.stderr) console.log('stderr:', r.stderr);
  // Now check the store
  console.log('\nLast 3 prompts in store after this call:');
  const db = openStore();
  for (const r of db.prepare('SELECT * FROM prompts ORDER BY id DESC LIMIT 3').all()) printRow(r);
  db.close();
}

function configShow() {
  const db = openStore();
  console.log('Config table:');
  const rows = db.prepare('SELECT * FROM config').all();
  if (rows.length === 0) { console.log('  (empty)'); }
  else for (const r of rows) console.log(' ', r);
  db.close();
}

function exthostLog(nArg) {
  const n = parseInt(nArg, 10) || 30;
  const logsDir = path.join(os.homedir(), '.config', 'Cursor', 'logs');
  if (!fs.existsSync(logsDir)) { console.error('No Cursor logs dir:', logsDir); process.exit(3); }
  // Find newest log session dir
  const sessions = fs.readdirSync(logsDir).filter(d => /^\d/.test(d)).sort().reverse();
  if (!sessions.length) { console.error('No log sessions found'); process.exit(3); }
  const latest = path.join(logsDir, sessions[0]);
  const candidates = [
    path.join(latest, 'window1', 'exthost', 'exthost.log'),
    path.join(latest, 'window1', 'renderer.log'),
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    console.log('=== ' + f + ' (lines containing "nexpath", last ' + n + ') ===');
    const lines = fs.readFileSync(f, 'utf8').split('\n').filter(l => /nexpath/i.test(l));
    console.log(lines.slice(-n).join('\n') || '  (no nexpath lines)');
    console.log('');
  }
}

// ───────────────────────── dispatch ─────────────────────────

function usage() {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 30).filter(l => l.startsWith(' *')).map(l => l.replace(/^ \* ?/, '')).join('\n'));
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const sub = argv[1];

try {
  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') return usage();
  if (cmd === 'store' && sub === 'schema')   return storeSchema();
  if (cmd === 'store' && sub === 'recent')   return storeRecent(argv[2]);
  if (cmd === 'store' && sub === 'today')    return storeToday();
  if (cmd === 'store' && sub === 'search')   return storeSearch(argv[2]);
  if (cmd === 'store' && sub === 'stats')    return storeStats();
  if (cmd === 'cursor' && sub === 'workspaces') return cursorWorkspaces();
  if (cmd === 'cursor' && sub === 'probe')      return cursorProbe(argv[2]);
  if (cmd === 'cursor' && sub === 'extract')    return cursorExtract(argv[2]);
  if (cmd === 'trigger' && sub === 'ping')      return triggerPing();
  if (cmd === 'trigger' && sub === 'auto')      return triggerAuto(argv.slice(2).join(' '));
  if (cmd === 'config'  && sub === 'show')      return configShow();
  if (cmd === 'exthost-log')                    return exthostLog(sub);
  console.error('Unknown subcommand:', cmd, sub || '');
  usage();
  process.exit(1);
} catch (e) {
  console.error('Error:', e.stack || e.message);
  process.exit(1);
}
