#!/usr/bin/env node
/**
 * Feature 1 — Semi-E2E TC-E2E-29 … TC-E2E-35: the F3 privacy switch (`dataPrivacy`) on the desktop.
 * TC-E2E-1 … 16: scripts/run-all-semi-e2e.ts · 17 … 28: scripts/run-semi-e2e-multilingual.mjs.
 *
 *   npm run build && node scripts/run-semi-e2e-privacy.mjs
 *
 * Real built code: the desktop's two calls (`prepareNexpathWriterEnhancement`, `preparePromptEnhancement`),
 * the real desktop tools (MemOS with the local model, OpenClaw, codebase-memory-mcp, meaning search),
 * real HTTP. Three local servers stand in for what is outside the device, and log every request:
 *   - "server"  F3 (/f3/v1/resource, /f3/v1/resource-result) and the cloud AI (/v1/chat/completions:
 *               Cloud Pro, the Nexpath writer, MemOS's summaries);
 *   - "LAN"     the user's LAN machine (F6 bridge, /v1/chat/completions).
 * Rule under test (F3, 2026-11-06): while the switch is on, no cloud AI processes the user's data.
 * Runs in a fresh temp HOME; no real credential is read or used (the device token is fake).
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);

// ── 0. Re-start in a fresh temp HOME ──────────────────────────────────────────
if (!process.env.__NEXPATH_PRIV_E2E_HOME) {
  if (!existsSync(join(R, 'dist/cli/index.js'))) {
    console.error('Run `npm run build` first.');
    process.exit(1);
  }
  const home = mkdtempSync(join(tmpdir(), 'nexpath-priv-e2e-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, __NEXPATH_PRIV_E2E_HOME: home };
  for (const k of ['OPENAI_API_KEY', 'NEXPATH_F3_URL', 'NEXPATH_CLOUD_PRO_URL', 'NEXPATH_DESKTOP_SESSION']) delete env[k];
  const r = spawnSync(process.execPath, [SELF], { stdio: 'inherit', env });
  if (process.env.KEEP_E2E_HOME !== '1') rmSync(home, { recursive: true, force: true });
  else console.log(`(temp home kept: ${home})`);
  process.exit(r.status ?? 1);
}
const HOME = process.env.HOME;
if (HOME !== process.env.__NEXPATH_PRIV_E2E_HOME || !HOME.startsWith(tmpdir() + sep)) {
  console.error('Refusing to run outside the temp HOME.');
  process.exit(1);
}

// ── Report ────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const check = (cond, label, detail) => {
  if (cond) {
    passed++;
    console.log(`    ✅ [PASS] ${label}`);
  } else {
    failed++;
    console.error(`    ❌ [FAIL] ${label}${detail !== undefined ? `\n       Detail: ${detail}` : ''}`);
    process.exitCode = 1;
  }
};
const title = (n, text) => console.log(`\n[${n - 28}/7] TC-E2E-${n}: ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Stand-ins for everything outside the device ───────────────────────────────
const log = [];
let f3Mode = 'skip';
let lanMode = 'ok';
const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};
const LAN_DEVICE = { deviceId: 'lan-box', tier: 'T5', model: 'qwen2.5-coder:7b', endpoint: 'peer-1' };
const CLOUD_TEXT = 'CLOUD ANSWER';
const LAN_TEXT = 'LAN REWRITE: add the retry inside processRetry, the only entry point for payment retries.';
const listen = (handler) =>
  new Promise((r) => {
    const s = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => handler(req, res, raw ? JSON.parse(raw) : undefined));
    });
    s.listen(0, '127.0.0.1', () => r(s));
  });
const server = await listen((req, res, body) => {
  const path = req.url ?? '';
  log.push({ to: 'server', path, body });
  if (path === '/f3/v1/resource-result') return json(res, 200, {});
  if (path === '/f3/v1/resource') {
    if (f3Mode === 'hang') return; // never answers: the client times out
    if (f3Mode === 'skip') return json(res, 200, { decisionId: 'd-srv-skip', target: 'skip', reason: 'NO_LAN_DEVICE', lanDevice: null, pro: null });
    if (f3Mode === 'local') return json(res, 200, { decisionId: 'd-srv-local', target: 'local', reason: 'LAN_OK', lanDevice: LAN_DEVICE, pro: null });
    if (f3Mode === 'pro') return json(res, 200, { decisionId: 'd-srv-pro', target: 'pro', reason: 'POLICY_PRO_ONLY', lanDevice: null, pro: { model: 'gpt-4o-mini' } });
    if (f3Mode === '413') return json(res, 413, { detail: 'TOO_LARGE' });
    if (f3Mode === '429') { res.setHeader('retry-after', '5'); return json(res, 429, { detail: 'RATE_LIMITED' }); }
    return json(res, 500, { detail: 'boom' });
  }
  if (path.endsWith('/chat/completions')) {
    return json(res, 200, { id: 'c', object: 'chat.completion', created: 0, model: 'gpt-4o-mini', choices: [{ index: 0, message: { role: 'assistant', content: CLOUD_TEXT }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
  }
  json(res, 404, {});
});
const lan = await listen((req, res, body) => {
  log.push({ to: 'lan', path: req.url ?? '', body });
  if (lanMode === 'ok') return json(res, 200, { choices: [{ message: { role: 'assistant', content: LAN_TEXT } }] });
  json(res, 500, { error: 'model crashed' });
});
const BASE = `http://127.0.0.1:${server.address().port}`;
const LAN_URL = `http://127.0.0.1:${lan.address().port}/v1/chat/completions`;
const closed = await listen(() => {});
const CLOSED_BASE = `http://127.0.0.1:${closed.address().port}`;
await new Promise((r) => closed.close(r)); // nothing listens there now: connection refused

/** Requests since `mark`, grouped. */
const since = (mark) => {
  const part = log.slice(mark);
  return {
    f3: part.filter((e) => e.to === 'server' && e.path === '/f3/v1/resource'),
    results: part.filter((e) => e.to === 'server' && e.path === '/f3/v1/resource-result'),
    cloud: part.filter((e) => e.to === 'server' && e.path.endsWith('/chat/completions')),
    lan: part.filter((e) => e.to === 'lan'),
  };
};

// ── Built modules ─────────────────────────────────────────────────────────────
const ce = await import(join(R, 'dist/context-engineering/index.js'));
const { openStore, closeStore } = await import(join(R, 'dist/store/db.js'));

const dataDir = join(HOME, 'desktop-data');
mkdirSync(dataDir, { recursive: true });
const store = await openStore(join(dataDir, 'prompt-store.db'));
const project = join(HOME, 'projects', 'shop');
mkdirSync(join(project, 'src/payments'), { recursive: true });
writeFileSync(join(project, 'src/payments/retry.ts'), 'export async function processRetry(paymentId: string) {\n  return paymentId;\n}\n');
execFileSync('git', ['init', '-q'], { cwd: project });

const DECISION = 'processRetry in src/payments/retry.ts is the only entry point for payment retries';
const PROMPT = 'add a retry when processRetry fails for a checkout payment';
let sessionN = 0;
const ctx = (dataPrivacy) => ({ workspacePath: project, store, sessionId: `desk-${++sessionN}`, deviceToken: 'npd_fake_e2e', deviceId: 'dev-e2e', ...(dataPrivacy === undefined ? {} : { dataPrivacy }) });

console.log('='.repeat(80));
console.log('🧪 NEXPATH FEATURE 1 — SEMI-E2E TC-E2E-29 … 35 (F3 privacy switch on the desktop)');
console.log(`   home: temp  ·  device token: fake  ·  Node ${process.version}`);
console.log('='.repeat(80));

const tools = ce.createDesktopFeature1Tools({ dataDir, openclawNodePath: process.execPath });
try {
  // Set-up: the decision is taught the way the desktop does it, and the tools are warm.
  const taught = await ce.handleStopHookCapture(store, { projectRoot: project, sessionId: 'teach', prompt: `Locked requirement: ${DECISION}.`, assistantResponse: 'Understood.' });
  tools.warmUp();
  const until = Date.now() + 90_000;
  let ready = [];
  while (Date.now() < until) {
    ready = [];
    for (const d of tools.drivers) if (await d.available()) ready.push(d.name);
    if (ready.includes('memos') && ready.includes('meaning')) break;
    await sleep(2000);
  }
  console.log(`   set-up: decision taught (${taught.factsCaptured} fact) · tools ready: ${ready.join(', ')}`);

  const oldPath = (dataPrivacy, extra = {}) =>
    ce.preparePromptEnhancement(PROMPT, ctx(dataPrivacy), {
      timeoutMs: 8000, f3BaseUrl: BASE, cloudProUrl: `${BASE}/v1/chat/completions`,
      localExecutionOptions: { bridgeUrl: LAN_URL }, sources: tools.drivers, ...extra,
    });
  const writer = (dataPrivacy, extra = {}) =>
    ce.prepareNexpathWriterEnhancement(PROMPT, ctx(dataPrivacy), { timeoutMs: 15000, apiBaseUrl: BASE, tools, localExecutionOptions: { bridgeUrl: LAN_URL }, ...extra });

  // ── TC-E2E-29 ───────────────────────────────────────────────────────────────
  title(29, 'Switch off: unchanged (baseline — proves the stand-in servers see the calls)');
  f3Mode = '500';
  let m = log.length;
  let r = await oldPath(undefined);
  let s = since(m);
  check(s.f3.length === 1 && !('dataPrivacy' in s.f3[0].body), 'F3 request has no dataPrivacy field (exactly today\'s request)', JSON.stringify(s.f3[0]?.body));
  check(s.cloud.length === 1 && r.enhancedPrompt === CLOUD_TEXT, 'F3 error → Cloud Pro, as today', `${s.cloud.length} cloud call(s), "${r.enhancedPrompt.slice(0, 60)}"`);
  check(JSON.stringify(s.cloud[0]?.body ?? {}).includes('only entry point'), 'memory reached the cloud with the switch off (so the later "nothing reached the cloud" checks mean something)');

  // ── TC-E2E-30 ───────────────────────────────────────────────────────────────
  title(30, 'Switch on, F3 says "skip": the original prompt, nothing to the cloud');
  await sleep(1100); // past nothing cached for privacy: the cache keeps the two apart anyway
  f3Mode = 'skip';
  m = log.length;
  r = await oldPath(true);
  await sleep(300);
  s = since(m);
  check(s.f3.length === 1 && s.f3[0].body.dataPrivacy === true, 'F3 request carries dataPrivacy: true');
  check(!JSON.stringify(s.f3[0]?.body ?? {}).includes('processRetry'), 'F3 request has no prompt or memory text (metadata only)');
  check(r.isEnhanced === false && r.enhancedPrompt === PROMPT, 'original prompt returned unchanged', `"${r.enhancedPrompt.slice(0, 80)}"`);
  check(s.cloud.length === 0 && s.lan.length === 0, `no cloud AI call, no LAN call (${s.cloud.length} / ${s.lan.length})`);
  check(s.results.length === 0, 'no /f3/v1/resource-result for the skip');

  // ── TC-E2E-31 ───────────────────────────────────────────────────────────────
  title(31, 'Switch on, any F3 problem → the original prompt, never Cloud Pro');
  for (const [name, mode, base] of [['HTTP 500', '500', BASE], ['HTTP 413 TOO_LARGE', '413', BASE], ['HTTP 429 RATE_LIMITED', '429', BASE], ['"pro" answer', 'pro', BASE], ['timeout (no answer)', 'hang', BASE], ['connection refused', '500', CLOSED_BASE]]) {
    f3Mode = mode;
    m = log.length;
    const t0 = Date.now();
    r = await oldPath(true, { f3BaseUrl: base });
    s = since(m);
    check(r.enhancedPrompt === PROMPT && r.isEnhanced === false && s.cloud.length === 0 && s.lan.length === 0,
      `${name}: original prompt, no cloud / LAN call (${Date.now() - t0} ms)`, `cloud ${s.cloud.length}, lan ${s.lan.length}, "${r.enhancedPrompt.slice(0, 60)}"`);
  }

  // ── TC-E2E-32 ───────────────────────────────────────────────────────────────
  title(32, 'Switch on, F3 says "local": the LAN rewrite, with memory, and nothing to the cloud');
  f3Mode = 'local';
  lanMode = 'ok';
  m = log.length;
  r = await oldPath(true);
  await sleep(300);
  s = since(m);
  check(r.isEnhanced === true && r.enhancedPrompt === LAN_TEXT, 'the LAN machine\'s rewrite is returned', `"${r.enhancedPrompt.slice(0, 80)}"`);
  check(s.lan.length === 1 && JSON.stringify(s.lan[0].body).includes('only entry point for payment retries'), 'project memory went to the LAN machine only');
  check(s.cloud.length === 0, `no cloud AI call (${s.cloud.length})`);
  check(s.results.length === 1 && s.results[0].body.ok === true && s.results[0].body.ranOn === 'local', 'result reported to F3 for the LAN run', JSON.stringify(s.results[0]?.body));

  // ── TC-E2E-33 ───────────────────────────────────────────────────────────────
  title(33, 'Switch on, the LAN call fails: the original prompt, no Cloud Pro fallback');
  lanMode = 'fail';
  m = log.length;
  r = await oldPath(true);
  await sleep(300);
  s = since(m);
  check(r.isEnhanced === false && r.enhancedPrompt === PROMPT, 'original prompt returned unchanged', `"${r.enhancedPrompt.slice(0, 80)}"`);
  check(s.lan.length === 1 && s.cloud.length === 0, `LAN tried once, no cloud fallback (${s.lan.length} / ${s.cloud.length})`);
  check(s.results[0]?.body.ok === false && s.results[0]?.body.fellBackToPro === false, 'F3 told: LAN failed, no fallback to Pro', JSON.stringify(s.results[0]?.body));

  // ── TC-E2E-34 ───────────────────────────────────────────────────────────────
  title(34, 'The desktop\'s writer function: switch on skips the whole writer pipeline');
  m = log.length;
  r = await writer(false);
  s = since(m);
  check(s.cloud.length > 0 && s.f3.length === 0, `switch off: the writer pipeline runs and calls the cloud AI (${s.cloud.length} call(s)) — baseline`);
  await sleep(500);
  f3Mode = 'skip';
  m = log.length;
  r = await writer(true);
  await sleep(300);
  s = since(m);
  check(r.isEnhanced === false && r.enhancedPrompt === PROMPT, 'switch on + F3 skip: the original prompt', `"${r.enhancedPrompt.slice(0, 80)}"`);
  check(s.cloud.length === 0 && s.f3.length === 1 && s.f3[0].body.dataPrivacy === true, `no cloud AI call; F3 asked with dataPrivacy (${s.cloud.length} cloud)`);
  f3Mode = 'local';
  lanMode = 'ok';
  m = log.length;
  r = await writer(true);
  s = since(m);
  check(r.isEnhanced === true && r.enhancedPrompt === LAN_TEXT, 'switch on + LAN available: the LAN rewrite', `"${r.enhancedPrompt.slice(0, 80)}"`);
  check(s.cloud.length === 0, `no cloud AI call (${s.cloud.length})`);

  // ── TC-E2E-35 ───────────────────────────────────────────────────────────────
  title(35, 'MemOS: a private turn is never kept or summarised; a normal one is (control)');
  const SECRET = 'zebracorn77 private roadmap';
  const NORMAL = 'otterbloom55 public changelog';
  const memosFiles = () => {
    const out = [];
    const walk = (d) => { for (const n of existsSync(d) ? readdirSync(d) : []) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : out.push(p); } };
    walk(join(dataDir, 'memos'));
    return out;
  };
  const inMemos = (word) => memosFiles().some((f) => readFileSync(f).includes(Buffer.from(word)));
  const reply = 'Done. I updated the notes as asked and kept the existing structure of the document unchanged for review.';
  // a private prompt, then its turn
  f3Mode = 'skip';
  m = log.length;
  await writer(true);
  await tools.capture({ projectRoot: project, sessionId: 'mem-1', prompt: `Write the ${SECRET} notes for the team`, response: reply, dataPrivacy: true }, store);
  await sleep(25_000); // past MemOS's summary delay (20 s)
  s = since(m);
  check(!inMemos('zebracorn77'), 'the private turn is nowhere in MemOS\'s files');
  check(s.cloud.length === 0, `no cloud AI call while the switch was on (${s.cloud.length})`);
  // a normal prompt, then its turn
  m = log.length;
  await writer(false);
  await tools.capture({ projectRoot: project, sessionId: 'mem-1', prompt: `Write the ${NORMAL} notes for the team`, response: reply }, store);
  await sleep(25_000);
  check(inMemos('otterbloom55'), 'control: a normal turn is saved by MemOS (the file check works)');
} catch (err) {
  failed++;
  process.exitCode = 1;
  console.error('    ❌ [FAIL] the run stopped:', err?.stack ?? err);
} finally {
  await tools.close().catch(() => {});
  try { closeStore(store); } catch { /* ignore */ }
  server.closeAllConnections?.();
  lan.closeAllConnections?.();
  server.close();
  lan.close();
}

console.log(`\n${'='.repeat(80)}\nTC-E2E-29 … 35: ${passed} passed, ${failed} failed`);
process.exit(process.exitCode ?? 0);
