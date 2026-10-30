#!/usr/bin/env node
// Custom harness — record / replay proxy.
//
// NexPath builds every client as `new OpenAI()` with no address of its own, so pointing
// OPENAI_BASE_URL at this server captures ALL of its AI calls at once: profile classifier,
// Stream B, stage classifier, the risky-action micro-call, the writer, the route rescue.
//
//   record : forward to the real API, save request + reply, and reuse a saved reply if the
//            identical request appears again in the same run.
//   replay : answer only from saved replies. No network, no spend. A request with nothing
//            saved is refused (loudly) instead of silently costing money.
//
// The API key is NEVER written to disk: the Authorization header is dropped before saving.

import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true];
}));

const MODE     = args.mode || 'record';                  // record | replay
const PORT     = Number(args.port || 8787);
const UPSTREAM = args.upstream || 'https://api.openai.com';
const CASSETTE = resolve(args.cassettes || join(HERE, 'cassettes'), String(args.name || 'default'));
const STRICT   = args['on-miss'] !== 'passthrough';       // replay miss => refuse, by default

// record : always forward what is not saved yet
// replay : saved replies only — a new request is refused, so a run can never spend
// auto   : replay what is saved, record what is genuinely new (the cassette converges)
if (!['record', 'replay', 'auto'].includes(MODE)) { console.error('--mode must be record, replay or auto'); process.exit(2); }
mkdirSync(CASSETTE, { recursive: true });

// The key of a call: method + path + body, with per-run identifiers blanked out first.
//
// Why blanking is needed: NexPath stamps the session's UUID into every sectionId inside the
// writer's prompt, so the SAME logical call looks different in every run and a replay would
// miss it. Only ids and clock values are blanked — every word of the prompt still counts, so
// two genuinely different requests can never collide.
const VOLATILE = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>'],   // session / request ids
  [/\b1[0-9]{12}\b/g, '<epoch-ms>'],                                              // millisecond clocks
  [/\b1[0-9]{9}\b/g, '<epoch-s>'],                                                // second clocks
];
function stable(body) {
  // canonicalise first (parse+stringify), so the live proxy and the re-key tool — which
  // rebuilds the body from the saved cassette — always compute the same key.
  let t = body;
  try { t = JSON.stringify(JSON.parse(body)); } catch { /* not JSON: hash as-is */ }
  for (const [re, to] of VOLATILE) t = t.replace(re, to);
  return t;
}
const keyOf = (method, path, body) =>
  createHash('sha256').update(`${method} ${path}\n${stable(body)}`).digest('hex').slice(0, 32);

const stats = { record: 0, reused: 0, replayed: 0, miss: 0, upstream_error: 0 };
let saved = new Set(readdirSync(CASSETTE).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));

const server = createServer(async (req, res) => {
  // a health endpoint, so a runner can VERIFY the mode instead of assuming it
  if (req.url === '/__harness/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ mode: MODE, cassette: CASSETTE, saved: saved.size, stats }));
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  const key  = keyOf(req.method, req.url, body);
  const file = join(CASSETTE, `${key}.json`);

  const reply = (status, payload, note) => {
    res.writeHead(status, { 'content-type': 'application/json', 'x-harness-proxy': note });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  };

  // a saved reply always wins — that is what makes a repeat run identical and free
  if (saved.has(key)) {
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    stats[MODE === 'record' ? 'reused' : 'replayed']++;
    return reply(rec.status, rec.body, MODE === 'record' ? 'reused' : 'replay');
  }

  if (MODE === 'replay' || MODE === 'auto') {
    stats.miss++;
    // save what was asked but never recorded, so a mismatch can be diagnosed instead of guessed
    try {
      mkdirSync(join(CASSETTE, 'misses'), { recursive: true });
      writeFileSync(join(CASSETTE, 'misses', `${key}.json`),
        JSON.stringify({ at: new Date().toISOString(), method: req.method, path: req.url, body: safeBody(body) }, null, 2));
    } catch { /* diagnosis only */ }
    console.error(`  MISS  ${req.method} ${req.url}  (${key}) — nothing saved for this request`);
    if (MODE === 'replay' && STRICT) {
      return reply(502, { error: { message: `harness proxy: no saved reply for ${key}` } }, 'miss');
    }
    // auto mode falls through to record this one
  }

  // record: forward once, save, return
  try {
    const headers = { ...req.headers };
    delete headers.host; delete headers['content-length'];
    const up = await fetch(`${UPSTREAM}${req.url}`, { method: req.method, headers, body: body || undefined });
    const text = await up.text();
    writeFileSync(file, JSON.stringify({
      saved_at: new Date().toISOString(),
      request: { method: req.method, path: req.url, body: safeBody(body) },  // no Authorization header, ever
      status: up.status,
      body: text,
    }, null, 2));
    saved.add(key);
    stats.record++;
    return reply(up.status, text, 'recorded');
  } catch (e) {
    stats.upstream_error++;
    return reply(502, { error: { message: `harness proxy: upstream failed — ${e.message}` } }, 'upstream-error');
  }
});

// the request body holds prompts, never credentials — but keep it readable and bounded
function safeBody(body) {
  try { return JSON.parse(body); } catch { return body.slice(0, 20_000); }
}

const line = () => `record=${stats.record} reused=${stats.reused} replayed=${stats.replayed} miss=${stats.miss} upstream_error=${stats.upstream_error}`;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  console.log(`\nproxy stopping — ${line()} | cassette: ${CASSETTE}`);
  process.exit(0);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`harness proxy: mode=${MODE} port=${PORT} cassette=${CASSETTE}`);
  console.log(`  saved replies already here: ${saved.size}`);
  console.log(`  point NexPath at it with:  --proxy-url=http://127.0.0.1:${PORT}/v1`);
});
// live counter only on a terminal — in a log file this would write a line every 2 seconds
if (process.stdout.isTTY) setInterval(() => process.stdout.write(`\r  ${line()}   `), 2000).unref();
