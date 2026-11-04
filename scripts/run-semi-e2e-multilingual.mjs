#!/usr/bin/env node
/**
 * Feature 1 — Semi-E2E TC-E2E-17 … TC-E2E-28: multilingual memory (V2 #7) and the uninstall delete.
 * TC-E2E-1 … 16 are in scripts/run-all-semi-e2e.ts; together they are the 28 semi-e2e tests.
 *
 *   npm run build && node scripts/run-semi-e2e-multilingual.mjs
 *
 * Real built CLI hooks (`nexpath auto` / `nexpath stop`, the JSON Claude Code sends), the real worker
 * with MemOS, codebase-memory-mcp, OpenClaw (when installed) and the real local model, real install
 * and uninstall. Everything runs in a fresh temp HOME (this script re-starts itself with one).
 *
 * Safety: the OS keychain is shared by the whole machine, so this script only READS the key (handed to
 * the hooks through the environment, never printed) and runs uninstall through `uninstallAction` with
 * "keep the credential" answered — never `nexpath uninstall --yes`. Install / uninstall use agent paths
 * inside the temp HOME and a no-op for `claude mcp …`, so the real agent configs are never touched.
 * TC-E2E-24 (summaries in the user's language) needs the key; without one it is reported as SKIP.
 *
 * Sentences come from src/context-engineering/tests/fixtures/multilingual-memory.json: results are
 * measured on AI-written sample sentences.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);

// ── 0. Re-start in a fresh temp HOME ──────────────────────────────────────────
if (!process.env.__NEXPATH_ML_E2E_HOME) {
  if (!existsSync(join(R, 'dist/cli/index.js'))) {
    console.error('Run `npm run build` first.');
    process.exit(1);
  }
  const home = mkdtempSync(join(tmpdir(), 'nexpath-ml-e2e-'));
  const r = spawnSync(process.execPath, [SELF], {
    stdio: 'inherit',
    env: { ...process.env, HOME: home, USERPROFILE: home, REAL_HOME: process.env.HOME, __NEXPATH_ML_E2E_HOME: home },
  });
  if (process.env.KEEP_E2E_HOME !== '1') rmSync(home, { recursive: true, force: true });
  else console.log(`(temp home kept: ${home})`);
  process.exit(r.status ?? 1);
}

const HOME = process.env.HOME;
if (HOME !== process.env.__NEXPATH_ML_E2E_HOME || !HOME.startsWith(tmpdir() + sep)) {
  console.error('Refusing to run outside the temp HOME.');
  process.exit(1);
}
const REAL_HOME = process.env.REAL_HOME;
delete process.env.NEXPATH_SKIP_MODEL_DOWNLOAD;
delete process.env.DISPLAY;
delete process.env.WAYLAND_DISPLAY;
delete process.env.NEXPATH_DESKTOP_SESSION;

// ── Report ────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
const check = (cond, label, detail) => {
  if (cond) {
    passed++;
    console.log(`    ✅ [PASS] ${label}`);
  } else {
    failed++;
    console.error(`    ❌ [FAIL] ${label}${detail ? `\n       Detail: ${detail}` : ''}`);
    process.exitCode = 1;
  }
};
const skip = (label, why) => {
  skipped++;
  console.log(`    ⏭️  [SKIP] ${label} (${why})`);
};
const title = (n, text) => console.log(`\n[${n - 16}/12] TC-E2E-${n}: ${text}`);
/** A process with no network, running as the same user (so the worker's socket name is the same). */
const NO_NETWORK = ['unshare', '-n', `--map-user=${process.getuid()}`, `--map-group=${process.getgid()}`];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quietly = async (fn) => {
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.map(String).join(' '));
  try {
    return { value: await fn(), output: lines.join('\n') };
  } finally {
    console.log = log;
  }
};

// ── Built modules (HOME is the temp home from here on) ────────────────────────
const dist = (p) => import(join(R, 'dist', p));
const { installAction, uninstallAction, resolveAgentPaths } = await dist('cli/commands/install.js');
const { openStore, closeStore } = await dist('store/db.js');
const ce = await dist('context-engineering/index.js');
const { cliWorkerSources, requestWorker } = await dist('context-engineering/worker/worker-client.js');
const { stopFeature1Worker } = await dist('context-engineering/worker/tools-status.js');
const { workerPaths } = await dist('context-engineering/worker/protocol.js');
const { memoryModelDir, memoryToolDataDirs } = await dist('context-engineering/sources/memory-model.js');
const { bundledModelsDir } = await dist('context-engineering/sources/meaning-driver.js');
const { bundledOpenClawEntry } = await dist('context-engineering/sources/openclaw-driver.js');
const BUNDLED_MODEL = bundledModelsDir();
const keychain = await import(join(R, 'node_modules/cross-keychain/dist/index.js'));

const fixture = JSON.parse(readFileSync(join(R, 'src/context-engineering/tests/fixtures/multilingual-memory.json'), 'utf8'));
const item = (id) => fixture.items.find((i) => i.id === id);

// The key, read from the real home the way the hooks read it (never printed).
const hasKeychainKey = async () => (await keychain.getPassword('nexpath', 'openai_api_key').catch(() => null)) !== null;
const keyBefore = await hasKeychainKey();
let keySource = 'none';
if (REAL_HOME) {
  process.env.HOME = REAL_HOME;
  const keys = await dist('config/ApiKeyResolver.js');
  keySource = await keys.getKeySource(REAL_HOME);
  await keys.resolveOpenAIKey(REAL_HOME).catch(() => null);
  process.env.HOME = HOME;
}
const realNexpath = REAL_HOME ? join(REAL_HOME, '.nexpath') : undefined;
// The real home's Nexpath data (the user's own hooks keep writing there, so only existence is compared).
const realDataExists = () => (REAL_HOME ? [join(realNexpath, 'prompt-store.db'), join(realNexpath, 'memos'), join(REAL_HOME, '.cache', 'memos', 'models')].map(existsSync).join(',') : 'none');
const realDataBefore = realDataExists();

const nexpathHome = join(HOME, '.nexpath');
const dbPath = join(nexpathHome, 'prompt-store.db');
const cli = join(R, 'dist/cli/index.js');
const env = { ...process.env, HOME };
const projectDir = (name) => {
  const dir = join(HOME, 'projects', name);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: dir });
  }
  return dir;
};
const hookAuto = (project, prompt, prefix = []) => {
  const [cmd, ...args] = [...prefix, process.execPath, cli, 'auto', '--project', project, prompt];
  return spawnSync(cmd, args, { cwd: project, env, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
};
const hookStop = (project, reply) =>
  spawnSync(process.execPath, [cli, 'stop'], {
    cwd: project, env, encoding: 'utf8', timeout: 120_000,
    input: JSON.stringify({ session_id: 'claude-session', cwd: project, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: reply }),
  });
/** One real turn: the prompt through `nexpath auto`, the reply through `nexpath stop`. */
const turn = async (project, prompt, reply = 'Noted.') => {
  const a = hookAuto(project, prompt);
  const s = hookStop(project, reply);
  await sleep(1500);
  return a.status === 0 && s.status === 0;
};
const withStore = async (fn) => {
  const store = await openStore(dbPath);
  try {
    return await fn(store);
  } finally {
    closeStore(store);
  }
};
const mapRows = (project) => withStore((store) => ce.getActiveContextMemory(store, ce.normalizeProjectId(project)));
/**
 * What Feature 1 hands to the writer for this prompt (same pipeline and sources as the hook), as the
 * first prompt of a fresh session: without a session id, facts shown in ANY earlier session of the
 * project would count as "already shown" and be held back.
 */
let checkSession = 0;
const shown = (project, prompt) =>
  withStore(async (store) => {
    const sessionId = `e2e-check-${++checkSession}`;
    const r = await ce.preparePromptEnhancementWithSections(prompt, { workspacePath: project, store, sessionId }, {
      recordDelivery: false, skipLlmRewrite: true, sources: cliWorkerSources().drivers,
    });
    return r.isEnhanced ? r.facts ?? [] : [];
  });
const has = (facts, text) => facts.some((f) => f.content.includes(text));
const socket = workerPaths(nexpathHome).socket;
const workerStatus = () => requestWorker(socket, { type: 'status' }, 20_000).catch(() => undefined);
/**
 * Starts the worker the way the popup pipeline does (the hook starts it only when Feature 1 runs for
 * a popup). With `offline`, from a process that has no network, so the worker has none either.
 */
const startWorker = (offline = false) => {
  const client = join(R, 'dist/context-engineering/worker/worker-client.js');
  const code = `const m = await import(${JSON.stringify('file://' + client)}); for (const d of m.cliWorkerSources().drivers) await d.available(); await new Promise((r) => setTimeout(r, 1000));`;
  const cmd = [...(offline ? [...NO_NETWORK] : []), process.execPath, '--input-type=module', '-e', code];
  return spawnSync(cmd[0], cmd.slice(1), { env, encoding: 'utf8', timeout: 60_000 }).status;
};
const waitForSources = async (names, ms = 90_000) => {
  const until = Date.now() + ms;
  let status;
  while (Date.now() < until) {
    status = await workerStatus();
    const ok = names.every((n) => status?.sources?.some((s) => s.name === n && s.available));
    if (ok) return status;
    await sleep(2000);
  }
  return status;
};

console.log('='.repeat(80));
console.log('🧪 NEXPATH FEATURE 1 — SEMI-E2E TC-E2E-17 … 28 (multilingual memory + uninstall delete)');
console.log('   measured on AI-written sample sentences (multilingual-memory.json)');
console.log(`   key: ${keySource}  ·  home: temp  ·  Node ${process.version}`);
console.log('='.repeat(80));

const paths = resolveAgentPaths(HOME, HOME, HOME);
const FORMS = ['en', 'hi', 'hi-latn', 'gu', 'gu-latn'];
const GOAL = ['en-US-slang', 'es-419', 'pt-BR', 'pcm', 'sw-sheng', 'sw', 'ha', 'am'];

try {
  // ── TC-E2E-17 ───────────────────────────────────────────────────────────────
  title(17, 'Install: the memory model and OpenClaw come with Nexpath (or the model is fetched once)');
  let loads = 0;
  const { output: installOut } = await quietly(async () => {
    const { prefetchMemoryModel } = await dist('context-engineering/sources/memory-model.js');
    return installAction({ yes: true }, {
      paths, isWin: false, execFn: () => {}, skipClipboardCheck: true, dbPath,
      storeApiKeyFn: async () => ({ source: 'keychain' }), // never write a credential (the real one stays as it is)
      prefetchMemoryModelFn: () => { loads++; return prefetchMemoryModel(); },
    });
  });
  check(loads === 1, `model step ran once (${loads})`);
  if (BUNDLED_MODEL) {
    check(installOut.includes('Memory model included with Nexpath'), 'install says the model is included (no download)');
    check(existsSync(join(BUNDLED_MODEL, 'Xenova', 'all-MiniLM-L6-v2', 'onnx', 'model_quantized.onnx')), 'model inside the package (dist/models)');
    check(!existsSync(memoryModelDir(HOME)), 'nothing downloaded into ~/.cache/memos/models');
  } else {
    check(installOut.includes('Downloading the memory model (24 MB)'), 'install says "Downloading the memory model (24 MB)…"');
    check(existsSync(join(memoryModelDir(HOME), 'onnx', 'model_quantized.onnx')), 'model in ~/.cache/memos/models/Xenova/all-MiniLM-L6-v2');
  }
  const ocEntry = bundledOpenClawEntry();
  check(Boolean(ocEntry), `OpenClaw came with Nexpath (${ocEntry ? ocEntry.replace(R, '<repo>') : 'missing'})`);
  const toolsOn = await withStore((store) => store.db.exec("SELECT value FROM config WHERE key = 'feature1_tools'")[0]?.values[0]?.[0]);
  check(toolsOn === 'on', `memory tools switched on (${toolsOn})`);
  // start the worker; wait for MemOS + the meaning source
  startWorker();
  const warm = await waitForSources(['memos', 'meaning']);
  check(Boolean(warm?.sources?.find((s) => s.name === 'meaning')?.available), 'worker running with the meaning source');
  check(Boolean(warm?.sources?.find((s) => s.name === 'openclaw')?.available), 'OpenClaw available in the worker');

  // ── TC-E2E-18 ───────────────────────────────────────────────────────────────
  title(18, 'Save + bring back in the 5 forms (English, Hindi, Hinglish, Gujarati, Gujlish)');
  for (const lang of FORMS) {
    const m = item(`${lang}-01`);
    const p = projectDir(lang);
    const ok = await turn(p, m.memory);
    const row = (await mapRows(p)).find((r) => r.content === m.memory);
    check(ok && row?.kind === 'rule' && row.locked === 1, `${lang}: saved through the Stop hook as a locked rule`);
    check(has(await shown(p, m.related), m.memory), `${lang}: related prompt brings it back`, m.related);
    check(!has(await shown(p, m.unrelated), m.memory), `${lang}: unrelated prompt stays clean`, m.unrelated);
  }

  // ── TC-E2E-19 ───────────────────────────────────────────────────────────────
  title(19, 'Goal languages (US slang, Spanish, Portuguese, Pidgin, Sheng, Swahili, Hausa, Amharic)');
  for (const lang of GOAL) {
    const m = item(`${lang}-01`);
    const p = projectDir(lang);
    await turn(p, m.memory);
    check(has(await shown(p, m.related), m.memory), `${lang}: related prompt brings it back`, m.related);
    check(!has(await shown(p, m.unrelated), m.memory), `${lang}: unrelated prompt stays clean`, m.unrelated);
  }

  // ── TC-E2E-20 ───────────────────────────────────────────────────────────────
  title(20, 'A related prompt in another form brings the memory back');
  const crossCases = ['en-01', 'hi-latn-08', 'gu-latn-02'].map((id) => {
    const m = item(id);
    return { id, m, project: projectDir(id === 'en-01' ? 'en' : id.replace(/-\d+$/, '')) };
  });
  let crossFound = 0;
  for (const c of crossCases) {
    if (c.id !== `${c.id.replace(/-\d+$/, '')}-01`) await turn(c.project, c.m.memory);
    const ok = has(await shown(c.project, c.m.cross.text), c.m.memory);
    if (ok) crossFound++;
    console.log(`       ${ok ? 'found' : 'missed'}: ${c.id} ← (${c.m.cross.lang}) ${c.m.cross.text}`);
  }
  check(crossFound >= 2, `at least 2 of 3 cross-form prompts bring it back (${crossFound}/3; real-model run: 7/10)`);

  // ── TC-E2E-21 ───────────────────────────────────────────────────────────────
  title(21, 'A newer Hindi / Gujarati decision replaces the older one');
  for (const [name, oldText, newText, newMark, oldMark, prompt] of [
    ['hi-chain', 'पक्का नियम: processRetry सिर्फ़ 3 बार retry करेगा।', 'पक्का नियम: processRetry अब 5 बार retry करेगा।', '5 बार', '3 बार', 'processRetry कितनी बार retry करता है'],
    ['gu-chain', 'પાકો નિયમ: processRetry માં ફક્ત ત્રણ વાર ફરી પ્રયાસ થશે.', 'પાકો નિયમ: processRetry માં હવે ફક્ત પાંચ વાર ફરી પ્રયાસ થશે.', 'પાંચ વાર', 'ત્રણ વાર', 'processRetry કેટલી વાર ફરી પ્રયાસ કરે છે'],
  ]) {
    const p = projectDir(name);
    await turn(p, oldText);
    await turn(p, newText);
    const active = (await mapRows(p)).map((r) => r.content);
    check(active.includes(newText) && !active.includes(oldText), `${name}: old decision marked replaced in the map`);
    await sleep(3000); // MemOS has both turns now
    const facts = await shown(p, prompt);
    check(has(facts, newMark), `${name}: the new decision is shown`, JSON.stringify(facts.map((f) => f.content)));
    check(!has(facts, oldMark), `${name}: the old decision does not come back (map or MemOS)`, JSON.stringify(facts.map((f) => f.content)));
  }

  // ── TC-E2E-22 ───────────────────────────────────────────────────────────────
  title(22, 'The same lock words in a question are not saved');
  for (const [name, q] of [
    ['q-hi-latn', 'kya ye final hai ki deploy sirf Tuesday ko hoga?'],
    ['q-hi', 'क्या यह पक्का फ़ैसला है कि deploy सिर्फ़ मंगलवार को होगा?'],
    ['q-gu-latn', 'shu aa final che ke deploy fakt Tuesday e j thase'],
  ]) {
    const p = projectDir(name);
    await turn(p, q, 'Abhi tak koi decision nahi hua.');
    const rules = (await mapRows(p)).filter((r) => r.kind === 'rule');
    check(rules.length === 0, `${name}: no rule saved`, JSON.stringify(rules.map((r) => r.content)));
  }

  // ── TC-E2E-23 ───────────────────────────────────────────────────────────────
  title(23, 'The same Hindi prompt sent twice is not shown back as a memory');
  {
    const p = projectDir('hi-echo');
    const prompt = 'मुझे checkout के बटन का रंग नीला करना है';
    await turn(p, prompt, 'ठीक है, बटन का रंग नीला कर दिया।');
    await sleep(12_000); // MemOS saves the turn
    hookAuto(p, prompt); // the same prompt again: MemOS's background search runs for it
    await sleep(12_000);
    const fromMemos = (await shown(p, prompt)).filter((f) => f.kind === 'memos_recall');
    // An echo is a bare copy of the prompt (plan T4-6). The earlier turn WITH the agent's reply
    // ("… — reply: done") is a real memory ("this was already done"), same rule as English.
    const bare = (t) => t.replace(/[\s।.!?]+$/u, '').trim();
    const echoes = fromMemos.filter((f) => bare(f.content) === bare(prompt));
    for (const f of fromMemos) console.log(`       MemOS line: ${f.content}`);
    check(echoes.length === 0, `no MemOS line is a bare copy of the prompt (${fromMemos.length} MemOS line(s) shown)`, JSON.stringify(fromMemos.map((f) => f.content)));
  }

  // ── TC-E2E-24 ───────────────────────────────────────────────────────────────
  title(24, 'With the key: MemOS summaries stay in the user\'s language');
  if (keySource === 'none') {
    skip('Hinglish summary has no Devanagari', 'no key');
    skip('Gujarati summary is in Gujarati script', 'no key');
  } else {
    const summaries = async (project) => {
      const until = Date.now() + 90_000;
      let rows = [];
      while (Date.now() < until) {
        rows = (await mapRows(project)).filter((r) => (r.evidence ?? '').includes('"memos"')).map((r) => r.content);
        if (rows.length > 0) return rows;
        await sleep(5000);
      }
      return rows;
    };
    // Turns our own extractor does not save (no lock word), so MemOS's summary is a new fact for the map.
    const hlProject = projectDir('sum-hi-latn');
    const guProject = projectDir('sum-gu');
    await turn(hlProject, 'chalo rate limiting ke liye Redis use karte hai, har API key pe 100 requests per minute', 'Theek hai, maine Redis se rate limiting laga di, har API key ke liye 100 requests per minute.');
    await turn(guProject, 'ચાલો rate limiting માટે Redis વાપરીએ, દરેક API key માટે મિનિટ દીઠ 100 requests', 'બરાબર, મેં Redis થી rate limiting ઉમેરી, દરેક API key માટે મિનિટ દીઠ 100 requests.');
    const hl = await summaries(hlProject);
    const gu = await summaries(guProject);
    console.log(`       Hinglish summary: ${hl[0] ?? '(none)'}\n       Gujarati summary: ${gu[0] ?? '(none)'}`);
    check(hl.length > 0 && hl.every((t) => !/\p{Script=Devanagari}/u.test(t)) && hl.some((t) => /\b(hai|ke|ki|ka|ko|se|me|pe|har|liye|rahega|sirf|hi|karna|mat|hoga)\b/i.test(t)), 'Hinglish summary stays Latin-letter Hinglish', JSON.stringify(hl));
    check(gu.length > 0 && gu.some((t) => /\p{Script=Gujarati}/u.test(t)), 'Gujarati summary is in Gujarati script', JSON.stringify(gu));
  }

  // ── TC-E2E-25 ───────────────────────────────────────────────────────────────
  title(25, 'Network off after install: the model still loads, memory still comes back');
  {
    const statusBefore = await workerStatus();
    await stopFeature1Worker(nexpathHome);
    await sleep(2000);
    const p = projectDir('hi-latn');
    const m = item('hi-latn-01');
    // the worker starts with no network at all
    startWorker(true);
    const st = await waitForSources(['memos', 'meaning']);
    const newPid = st?.pid;
    check(Boolean(newPid) && newPid !== statusBefore?.pid, `a new worker started inside the no-network namespace (pid ${newPid})`);
    const offlineNet = spawnSync(NO_NETWORK[0], [...NO_NETWORK.slice(1), process.execPath, '-e', 'fetch("https://huggingface.co").then(()=>process.exit(0)).catch(()=>process.exit(3))']).status;
    check(offlineNet === 3, 'the namespace really has no network');
    check(Boolean(st?.sources?.find((s) => s.name === 'meaning')?.available), 'meaning source loaded the model offline');
    check(Boolean(st?.sources?.find((s) => s.name === 'memos')?.available), 'MemOS loaded the model offline');
    // checked before any hook runs this prompt: a shown popup marks the fact "shown this session"
    const offlineFacts = await shown(p, m.related);
    check(has(offlineFacts, m.memory), 'related Hinglish prompt still brings the decision back', JSON.stringify(offlineFacts.map((f) => f.content)));
    // the real hook, with no network, on another prompt
    const a = hookAuto(p, m.unrelated, NO_NETWORK);
    check(a.status === 0, 'hook runs with no network');
  }

  // ── TC-E2E-26 / 27 / 28: uninstall ─────────────────────────────────────────
  // `ping` answers at once; `status` also asks every tool if it is available (slow for OpenClaw offline)
  const workerPid = (await requestWorker(socket, { type: 'ping' }, 5000).catch(() => undefined))?.pid;
  const toolDirs = memoryToolDataDirs(HOME);
  const modelDir = memoryModelDir(HOME);
  const usersOwnOpenClaw = join(HOME, '.openclaw');
  const otherApp = join(HOME, '.cache', 'other-app');
  for (const d of [usersOwnOpenClaw, otherApp]) mkdirSync(d, { recursive: true });
  writeFileSync(join(usersOwnOpenClaw, 'openclaw.json'), '{}');
  writeFileSync(join(otherApp, 'data'), 'x');
  const existedBefore = toolDirs.filter((d) => existsSync(d.dir));
  console.log(`\n       tool data before uninstall: ${existedBefore.map((d) => d.label).join(', ') || '(none)'}`);
  const uninstall = (deleteData) =>
    quietly(() => uninstallAction({
      paths, execFn: () => {}, dbPath,
      apiKeyConfirmFn: async () => false, // keep the credential (never touch the real keychain)
      storeDeleteConfirmFn: async () => deleteData,
    }));

  title(26, 'Uninstall, user says no to deleting data → everything kept');
  await uninstall(false);
  check(existedBefore.every((d) => existsSync(d.dir)), 'memory tools\' data kept');
  check(BUNDLED_MODEL ? existsSync(BUNDLED_MODEL) : existsSync(modelDir), 'memory model kept');
  check(existsSync(dbPath), 'local database kept');

  title(27, 'Uninstall, user deletes local data → all of Nexpath\'s memory data removed, nothing else');
  check(existedBefore.some((d) => d.dir.endsWith(`${sep}memos`)), 'MemOS memories existed before (real data from the turns above)');
  const { output: delOut } = await uninstall(true);
  for (const d of toolDirs) check(!existsSync(d.dir), `${d.label}: removed${existedBefore.includes(d) ? '' : ' (was not created in this run)'}`);
  check(!existsSync(modelDir), 'memory model cache folder removed (or never created: the model came with Nexpath)');
  check(!existsSync(dbPath), 'local database removed');
  check(delOut.includes('Saved memories (MemOS) removed') && (BUNDLED_MODEL || delOut.includes('Memory model removed')), 'uninstall says what it removed');
  check(existsSync(join(usersOwnOpenClaw, 'openclaw.json')), 'the user\'s own ~/.openclaw is untouched');
  check(existsSync(join(otherApp, 'data')), 'other apps\' cache folders are untouched');
  if (BUNDLED_MODEL) check(existsSync(BUNDLED_MODEL), 'the model inside the package is untouched (removed with the package itself)');

  title(28, 'Safety: worker stopped, real key and real home untouched');
  let alive = false;
  try {
    if (workerPid) {
      process.kill(workerPid, 0);
      alive = true;
    }
  } catch {
    alive = false;
  }
  check(Boolean(workerPid) && !alive, `the worker (pid ${workerPid}) was stopped by uninstall`);
  check((await hasKeychainKey()) === keyBefore, `the key in the OS keychain is unchanged (${keyBefore ? 'still there' : 'none before, none after'})`);
  check(realDataExists() === realDataBefore, `the real home's Nexpath data is still there (database, memories, model: ${realDataBefore})`);
} catch (err) {
  failed++;
  process.exitCode = 1;
  console.error(`\n❌ crashed: ${err?.stack ?? err}`);
} finally {
  await stopFeature1Worker(nexpathHome).catch(() => {});
}

console.log('\n' + '='.repeat(80));
console.log(`TC-E2E-17 … 28: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log('='.repeat(80));
