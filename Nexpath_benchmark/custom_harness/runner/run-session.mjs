#!/usr/bin/env node
// Custom harness — one session, one run.
//
// Sends a frozen prompt list to NexPath exactly as Claude Code's hooks do:
//   UserPromptSubmit -> `nexpath auto -p <project> --db <run db>`, prompt as JSON on stdin
//   Stop             -> `nexpath stop --db <run db>`, stop payload on stdin
// and saves everything the run produced under runs/<run-id>/.
//
// Rules this file must keep (SPEC.md):
//   - NexPath is called by FULL PATH to the clone's build, never the `nexpath` name.
//   - ONE fresh database per RUN. Never ~/.nexpath.
//   - The control arm calls NexPath not at all; it still walks the same prompts.
//   - Nothing here judges quality. It only records.

import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(HERE, '..');
const PTY_RUN = join(HERE, 'pty-run.py');
// The popup's own hint. NexPath draws it on /dev/tty and waits for Enter; the wrapper
// presses it inside OUR pseudo-terminal, so no operator screen is ever touched.
const POPUP_MARKER = 'Enter sends this prompt';
// Where NexPath's built CLI lives, and where the API key is kept. Both must be given —
// no machine's layout is baked in here. Flag first, then environment variable.
const DEFAULT_CLI = process.env.NEXPATH_CLI ?? '';
const DEFAULT_ENV_FILE = process.env.NEXPATH_ENV_FILE ?? '';
// Python only runs the pty wrapper that gives each run its own terminal.
const PYTHON = process.env.HARNESS_PYTHON ?? 'python3';

// ── arguments ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

const HELP = `
Run one session of a frozen prompt list against NexPath, the way its CLI hooks are really called.

Required
  --task=<id>              task id; its prompt file must exist in prompts/<id>.json
  --arm=nexpath|control    nexpath = hooks run · control = same prompts, no NexPath
  --project=<dir>          the repo folder the "user" is working in
  --nexpath-cli=<path>     NexPath's built CLI (dist/cli/index.js)   [env NEXPATH_CLI]

Optional
  --run-id=<name>          default: <task>.<arm>.<timestamp>
  --env-file=<path>        file holding OPENAI_API_KEY=...           [env NEXPATH_ENV_FILE]
  --no-key                 withhold the key (keyless condition; costs nothing)
  --proxy-url=<url>        send NexPath's AI calls to the record/replay proxy
  --require-proxy-mode=<m> refuse to start unless the proxy reports this mode
  --level=<name>           recorded in meta.json (NexPath's own default applies unless set in its config)
  --limit=<n>              walk only the first n prompts (plumbing checks only)
  --no-pty                 give the child no terminal, so the popup cannot be shown
                           (python3 is needed unless this is set; override with HARNESS_PYTHON)
  --dry-run                build every payload, call nothing
  --help

Output goes to runs/<run-id>/ : meta.json, log.jsonl, popups/, tty/
`;
if (args.help) { console.log(HELP.trim()); process.exit(0); }

const need = (k) => {
  const v = args[k];
  if (v === undefined) { console.error(`missing --${k}\n\nTry --help`); process.exit(2); }
  if (v === true) { console.error(`--${k} needs a value, e.g. --${k}=...\n\nTry --help`); process.exit(2); }
  return v;
};

const task    = need('task');                        // e.g. iterative__dvc_2.19.0_2.20.0
const arm     = need('arm');                         // nexpath | control
const project = resolve(need('project'));            // the repo folder the "user" is working in
const runId   = args['run-id'] || `${task}.${arm}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
const level   = args.level || 'optimum';             // NexPath's own default; recorded for the run
const NEXPATH_CLI = String(args['nexpath-cli'] ?? DEFAULT_CLI);
const ENV_FILE    = String(args['env-file'] ?? DEFAULT_ENV_FILE);
if (!NEXPATH_CLI) {
  console.error('no NexPath CLI given. Pass --nexpath-cli=/path/to/nexpath/dist/cli/index.js or set NEXPATH_CLI.\n\nTry --help');
  process.exit(2);
}
if (!existsSync(NEXPATH_CLI)) {
  console.error(`NexPath CLI not found at ${NEXPATH_CLI} — build NexPath first (npm run build in its folder).`);
  process.exit(2);
}
const dry     = !!args['dry-run'];                   // build payloads, call nothing

if (!['nexpath', 'control'].includes(arm)) { console.error('--arm must be nexpath or control'); process.exit(2); }
if (!existsSync(project)) {
  // Node reports a missing working directory as "spawn <command> ENOENT", which looks like a
  // missing program. Catch it here, where the real cause can be named.
  console.error(`--project folder does not exist: ${project}`);
  process.exit(2);
}

// ── prompts (frozen) ─────────────────────────────────────────────────────────
const promptsFile = args.prompts || join(HARNESS, 'prompts', `${task}.json`);
const frozen = JSON.parse(readFileSync(promptsFile, 'utf8'));
if (!frozen.frozen) { console.error(`${promptsFile} is not marked frozen`); process.exit(2); }
if (frozen.task !== task) { console.error(`prompt file is for ${frozen.task}, not ${task}`); process.exit(2); }

// ── run folder ───────────────────────────────────────────────────────────────
const runDir = join(HARNESS, 'runs', runId);
// What the agent must be handed, one row per turn. The agent driver reads ONLY this file,
// so what reaches the agent is exactly what was recorded here — nothing re-derived later.
const turnsPath = () => join(runDir, 'turns.jsonl');
const popupDir = join(runDir, 'popups');
const ttyDir = join(runDir, 'tty');          // what the popup drew, per call
mkdirSync(popupDir, { recursive: true });
mkdirSync(ttyDir, { recursive: true });
const usePty = !args['no-pty'];              // --no-pty = no terminal at all (popup cannot show)
const dbPath  = join(runDir, 'session.db');          // fresh, per RUN
const logPath = join(runDir, 'log.jsonl');
const log = (row) => appendFileSync(logPath, JSON.stringify(row) + '\n');

// ── environment for NexPath's own calls ──────────────────────────────────────
// The key is read from the harness .env by this program at runtime; it is never printed.
function keyFromEnvFile() {
  if (process.env.OPENAI_API_KEY) return { key: process.env.OPENAI_API_KEY, from: 'environment' };
  if (!ENV_FILE || !existsSync(ENV_FILE)) return { key: undefined, from: 'missing' };
  const line = readFileSync(ENV_FILE, 'utf8').split('\n').find((l) => l.startsWith('OPENAI_API_KEY='));
  return { key: line ? line.slice('OPENAI_API_KEY='.length).trim() : undefined, from: line ? 'env file' : 'missing' };
}
const noKey = !!args['no-key'];                          // keyless condition, or a zero-spend smoke run
const { key, from: keyFrom } = noKey ? { key: undefined, from: 'withheld (--no-key)' } : keyFromEnvFile();
const childEnv = { ...process.env };
if (key) childEnv.OPENAI_API_KEY = key; else delete childEnv.OPENAI_API_KEY;
if (args['proxy-url']) childEnv.OPENAI_BASE_URL = args['proxy-url'];   // record/replay proxy

// ── one hook call ────────────────────────────────────────────────────────────
function callNexpath(cmdArgs, stdinPayload, tag, timeoutMs = 180_000) {
  return new Promise((done) => {
    const started = Date.now();
    const ttyLog = join(ttyDir, `${tag}.log`);
    // NexPath's popup opens /dev/tty directly, so the child must own a terminal of its own:
    // pty-run.py gives it one, keeps stdin/stdout as pipes, and presses Enter on the popup.
    const argv = usePty
      ? [PTY_RUN, `--marker=${POPUP_MARKER}`, '--quiet-ms=2000', `--timeout=${Math.round(timeoutMs / 1000)}`,
         `--tty-log=${ttyLog}`, '--', process.execPath, NEXPATH_CLI, ...cmdArgs]
      : [NEXPATH_CLI, ...cmdArgs];
    const bin = usePty ? PYTHON : process.execPath;
    const child = spawn(bin, argv, { env: childEnv, cwd: project, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs + 15_000);
    child.on('error', (e) => {                       // a missing interpreter, a bad cwd, a permission
      clearTimeout(timer);                            // problem: record it, do not crash the run
      done({ code: null, out, err: `${err}spawn failed: ${e.code ?? e.message}`, ms: Date.now() - started,
             timedOut: false, enters: 0, spawn_error: e.code ?? String(e.message) });
    });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      const m = err.match(/enters=(\d+)/);
      done({ code, out, err, ms: Date.now() - started, timedOut: killed, enters: m ? Number(m[1]) : 0 });
    });
    child.stdin.end(JSON.stringify(stdinPayload));
  });
}

// NexPath prints { hookSpecificOutput: { hookEventName, additionalContext } } when a popup fires.
function popupFrom(stdout) {
  const line = stdout.split('\n').map((l) => l.trim()).filter(Boolean).reverse()
    .find((l) => l.startsWith('{') && l.includes('hookSpecificOutput'));
  if (!line) return null;
  try { return JSON.parse(line)?.hookSpecificOutput?.additionalContext ?? null; }
  catch { return null; }
}

// ── read back what NexPath decided, from the run's own database ──────────────
// pending_advisories.flag_type is the signal that fired ('absence:test_creation',
// 'stage_transition', ...); session_states.state_json carries the stage, its confidence
// and the absence flags. Read-only, and never the global ~/.nexpath database.
function readDecision(previousAdvisoryId, previousPeId) {
  const empty = { fired_flag: null, advisory_id: previousAdvisoryId, stage: null, prev_stage: null,
                  stage_confidence: null, prompt_count: null, absence_flags: null, queue_signals: null,
                  pe_id: previousPeId, pe_status: null, pe_sections: null, popup_text: null };
  if (!existsSync(dbPath)) return empty;
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const adv = db.prepare(
      'SELECT id, flag_type, stage, prev_stage, prompt_count, status FROM pending_advisories ORDER BY id DESC LIMIT 1',
    ).get();
    const ses = db.prepare('SELECT state_json FROM session_states LIMIT 1').get();
    // The popup body lives here whichever way it is delivered (direct terminal, or the Stop
    // bridge). Reading it from the store is the only capture that works on every path.
    const pe = db.prepare(
      'SELECT id, status, prompt_count, result_json FROM pending_prompt_enhancements ORDER BY id DESC LIMIT 1',
    ).get();
    let peNew = null;
    if (pe && pe.id !== previousPeId) {
      try {
        const body = JSON.parse(pe.result_json)?.currentBody ?? {};
        const sections = Array.isArray(body.sections) ? body.sections : [];
        peNew = {
          pe_id: pe.id, pe_status: pe.status, pe_sections: sections.length,
          // The sections view, for grading the text.
          popup_text: sections.map((x) => `## ${x.title ?? x.sectionKind ?? 'section'}\n${x.text ?? x.bodyText ?? ''}`).join('\n\n'),
          // The body EXACTLY as NexPath composed it — this is what a user would submit, and what
          // the agent must receive. It opens with "My original request (verbatim):".
          enhanced_prompt: typeof body.text === 'string' ? body.text : null,
        };
      } catch { peNew = { pe_id: pe.id, pe_status: pe.status, pe_sections: null, popup_text: null, enhanced_prompt: null }; }
    }
    const st = ses ? JSON.parse(ses.state_json) : {};
    const isNew = adv && adv.id !== previousAdvisoryId;
    return {
      fired_flag: isNew ? adv.flag_type : null,          // null = nothing fired for THIS prompt
      advisory_id: adv ? adv.id : previousAdvisoryId,
      stage: st.currentStage ?? null,
      prev_stage: adv ? adv.prev_stage : null,
      stage_confidence: st.stageConfidence ?? null,
      prompt_count: st.promptCount ?? null,
      absence_flags: Array.isArray(st.absenceFlags) ? st.absenceFlags.length : null,
      queue_signals: Array.isArray(st.absenceFlags)
        ? [...new Set(st.absenceFlags.map((f) => f.signalKey))].join(' ') : null,
      pe_id: pe ? pe.id : previousPeId,
      pe_status: peNew ? peNew.pe_status : null,
      pe_sections: peNew ? peNew.pe_sections : null,
      popup_text: peNew ? peNew.popup_text : null,
      enhanced_prompt: peNew ? peNew.enhanced_prompt : null,
    };
  } catch (e) {
    return { ...empty, db_error: String(e.message).slice(0, 120) };
  } finally { try { db?.close(); } catch { /* ignore */ } }
}

// Which NexPath is being measured. Recorded with the run, because a stale build silently
// measures older behaviour.
function nexpathVersion() {
  try {
    const pkg = resolve(dirname(NEXPATH_CLI), '..', '..', 'package.json');
    return existsSync(pkg) ? JSON.parse(readFileSync(pkg, 'utf8')).version ?? null : null;
  } catch { return null; }
}

// ── the session ──────────────────────────────────────────────────────────────
const meta = {
  schema: 'custom_harness.run.v1',
  run_id: runId, task, arm, level, project,
  prompts_file: promptsFile, prompts: frozen.prompts.length,
  limit: args.limit ? Number(args.limit) : null,
  nexpath_cli: NEXPATH_CLI, db: dbPath,
  nexpath_version: nexpathVersion(),
  key_source: keyFrom === 'missing' ? 'none' : keyFrom,      // never the key itself
  proxy: args['proxy-url'] || null,
  popup_input: usePty ? 'own pty, Enter pressed automatically' : 'no terminal (--no-pty): popup cannot be shown',
  started_at: new Date().toISOString(),
  dry_run: dry,
};
writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

// Verify the proxy is in the mode we asked for. A replay run that silently hits a record
// proxy spends money and proves nothing — that happened once, so it is checked now.
if (args['proxy-url']) {
  const statusUrl = args['proxy-url'].replace(/\/v1\/?$/, '') + '/__harness/status';
  try {
    const st = await (await fetch(statusUrl)).json();
    console.log(`proxy: mode=${st.mode} saved=${st.saved}`);
    if (args['require-proxy-mode'] && st.mode !== args['require-proxy-mode']) {
      console.error(`proxy is in "${st.mode}" mode, but --require-proxy-mode=${args['require-proxy-mode']}. Stopping before anything is spent.`);
      process.exit(3);
    }
    meta.proxy_mode = st.mode;
  } catch {
    console.error(`no harness proxy answering at ${statusUrl} — stopping (a run without it would go straight to the real API)`);
    process.exit(3);
  }
}

console.log(`run ${runId}`);
console.log(`  arm=${arm} level=${level} prompts=${frozen.prompts.length} key=${meta.key_source} popup=${usePty ? 'auto-Enter' : 'no terminal'}${dry ? ' (dry run)' : ''}`);

let shown = 0;
let lastAdvisoryId = null;
let lastPeId = null;
// --limit=N walks only the first N prompts. For checking the plumbing, never for a real run:
// meta.json records it so a shortened run can never be mistaken for a full one.
const walk = args.limit ? frozen.prompts.slice(0, Number(args.limit)) : frozen.prompts;
for (const p of walk) {
  const payload = { prompt: p.text, permission_mode: 'bypassPermissions' };
  if (args['transcript']) payload.transcript_path = args['transcript'];

  let res = { code: null, out: '', err: '', ms: 0, timedOut: false };
  let popup = null;

  if (arm === 'nexpath' && !dry) {
    res = await callNexpath(['auto', '-p', project, '--db', dbPath], payload, `${String(p.n).padStart(2, '0')}-auto`);
    popup = popupFrom(res.out);
    if (popup) {
      shown++;
      writeFileSync(join(popupDir, `${String(p.n).padStart(2, '0')}.txt`), popup);
    }
    // the Stop hook, as a real session would after the agent's reply
    await callNexpath(['stop', '--db', dbPath],
      { cwd: project, hook_event_name: 'Stop', stop_hook_active: false, session_id: runId },
      `${String(p.n).padStart(2, '0')}-stop`, 90_000);
  }

  const decision = (arm === 'nexpath' && !dry) ? readDecision(lastAdvisoryId, lastPeId) : {};
  if (decision.advisory_id !== undefined) lastAdvisoryId = decision.advisory_id;
  if (decision.pe_id !== undefined) lastPeId = decision.pe_id;

  // a popup body found in the store counts as a popup, whichever path delivered it
  if (!popup && decision.popup_text) {
    popup = decision.popup_text;
    shown++;
    writeFileSync(join(popupDir, `${String(p.n).padStart(2, '0')}.txt`), popup);
  }

  // V2's losslessness guard: NexPath opens its body by reproducing the prompt verbatim, so
  // replacing the prompt with the body is only safe while that is still true. Checked, never assumed.
  const squash = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const enhanced = decision.enhanced_prompt ?? null;
  const keepsOriginal = enhanced ? squash(enhanced).includes(squash(p.text)) : null;

  appendFileSync(turnsPath(), JSON.stringify({
    turn: p.n,
    type: p.type,
    raw_prompt: p.text,
    enhanced_prompt: enhanced,                 // null when NexPath said nothing this turn
    submit: enhanced ?? p.text,                // what the agent should receive
    enhanced_used: Boolean(enhanced),
    keeps_original_verbatim: keepsOriginal,    // false here is a defect, not a detail
    fired_flag: decision.fired_flag ?? null,
    pe_status: decision.pe_status ?? null,     // 'shown' = the popup was displayed and accepted
    pe_sections: decision.pe_sections ?? null,
  }) + '\n');

  const { popup_text, enhanced_prompt, ...decisionForLog } = decision;   // texts go to their own files
  log({
    prompt_n: p.n, type: p.type, chars: p.text.length,
    ...decisionForLog,
    popup_shown: !!popup, popup_chars: popup ? popup.length : 0,
    exit_code: res.code, ms: res.ms, timed_out: res.timedOut, enter_presses: res.enters,
    stderr_tail: res.err ? res.err.trim().split('\n').slice(-2).join(' | ').slice(0, 300) : '',
    assumes: p.assumes, check: p.check,          // tagged fits/does_not_fit later, never scored
  });
  console.log(`  ${String(p.n).padStart(2)} ${p.type.padEnd(11)} ${popup ? `POPUP(${decision.pe_sections ?? '?'})` : '  -   '} ${(decision.fired_flag ?? '').padEnd(28)} ${decision.stage ?? ''} ${res.ms ? res.ms + 'ms' : ''}`);
}

writeFileSync(join(runDir, 'meta.json'),
  JSON.stringify({ ...meta, finished_at: new Date().toISOString(), popups_shown: shown }, null, 2) + '\n');
const turnRows = existsSync(turnsPath())
  ? readFileSync(turnsPath(), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const brokenVerbatim = turnRows.filter((r) => r.keeps_original_verbatim === false).length;
if (brokenVerbatim) console.log(`  ⚠️  ${brokenVerbatim} enhanced prompt(s) do NOT contain the original verbatim`);
console.log(`  enhanced turns: ${turnRows.filter((r) => r.enhanced_used).length} / ${walk.length}`);
console.log(`  popups shown: ${shown} / ${walk.length}${args.limit ? ` (LIMITED run — ${frozen.prompts.length} in the frozen list)` : ''}`);
console.log(`  saved: ${runDir}`);
