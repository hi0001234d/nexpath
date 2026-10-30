#!/usr/bin/env node
// Custom harness — Layer 0 grader.
//
// Applies grading/GRADING-SHEET.md to the popups one run produced. Every question is yes/no.
// NOTHING here calls an AI: the rules are mechanical, and anything a rule cannot decide is
// left as `unknown` for a human, never guessed.
//
// Input : runs/<run-id>/popups/*.txt  + the run's frozen prompt file
// Output: runs/<run-id>/grades.csv    + a printed summary

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(HERE, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true];
}));
const runId = args.run || (console.error('missing --run=<run-id>'), process.exit(2));
const runDir = join(HARNESS, 'runs', runId);
if (!existsSync(runDir)) { console.error(`no such run: ${runDir}`); process.exit(2); }

const meta = JSON.parse(readFileSync(join(runDir, 'meta.json'), 'utf8'));
const frozen = JSON.parse(readFileSync(meta.prompts_file, 'utf8'));
const promptByN = new Map(frozen.prompts.map((p) => [p.n, p]));

// ── rule 1: what counts as naming "a real thing" ─────────────────────────────
// A word only counts when it is SPECIFIC to this task. Two kinds qualify:
//   - code-shaped: a flag, a path, a dotted or underscored name (--no-download, dvc list, 2.20)
//   - a rare word from the task's own text: not in the everyday-English list below
// Without this, any section mentioning "the code" or "your changes" would pass, which is
// exactly the filler the rule is meant to catch.
const EVERYDAY = new Set(('a about after all also an and any are as at be because been before being both but by can could did do does doing done down during each else even ever every few for from further get give go had has have having he her here hers him his how i if in into is it its itself just like make many may me might more most must my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up use used using very was way we well were what when where which while who whom why will with would you your yours ' +
  'code change changes feature features test tests testing file files function functions project task tasks work working issue issues bug bugs problem problems thing things step steps result results output input data system app application user users').split(' '));
const CODE_SHAPED = /^(--?[a-z][a-z0-9-]+|[a-z0-9]+[._/-][a-z0-9._/-]+|[0-9]+\.[0-9.]+)$/i;

// ── rule 3: advice that is only right when something is deployed or migrated ─
const DEPLOY_DEMAND = /\b(dry[- ]run|back ?up|rollback|roll back|pinned version|pin the version)\b/i;
const TASK_DEPLOYS  = /\b(deploy|deployment|release|migrat|production|publish|rollout)\b/i;

// ── rule 2: the signal a Best-practices section must name ────────────────────
const BEST_PRACTICES = /best practice/i;

// Not guidance — the sheet says to skip these: the restated request and the confirmation line.
const NOT_GUIDANCE = /^(my original request|original request|your request|confirmation|ask before|what you asked)/i;

// Rule 4 asks "could a developer act on this?" — that needs a verb that tells them to do something.
const ACTION_VERB = /\b(add|run|check|verify|write|use|call|keep|name|list|confirm|compare|test|review|outline|implement|update|remove|replace|document|measure|ensure|validate|reproduce|split|clarify|define|set|apply|revert|pin|record|inspect|trace|profile)\b/i;

function sectionsOf(popupText) {
  // A section starts at a markdown heading or a bold title line; everything to the next one is its body.
  const lines = popupText.split('\n');
  const out = []; let cur = null;
  for (const l of lines) {
    const m = l.match(/^#{1,6}\s+(.+?)\s*$/) || l.match(/^\*\*(.+?)\*\*\s*:?\s*$/);
    if (m) { if (cur) out.push(cur); cur = { title: m[1].trim(), body: [] }; }
    else if (cur) cur.body.push(l);
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ title: s.title, body: s.body.join('\n').trim() }));
}

// The user's own words for this run: every prompt in the frozen list.
const userWords = new Set(
  frozen.prompts.flatMap((p) => p.text.toLowerCase().match(/[a-z0-9_][a-z0-9_.\-/]{2,}/g) || [])
    .filter((w) => !EVERYDAY.has(w)),
);

function gradeSection(sec, taskDeploys) {
  const body = sec.body;
  const words = (body.toLowerCase().match(/[a-z0-9_-][a-z0-9_.\-/]{2,}/g) || []);
  const namesRealThing = words.some((w) => !EVERYDAY.has(w) && (CODE_SHAPED.test(w) || userWords.has(w)));
  const wrongAdvice = DEPLOY_DEMAND.test(body) && !taskDeploys;
  const actionable = body.length >= 40 && ACTION_VERB.test(body);
  const isBP = BEST_PRACTICES.test(sec.title);
  // rule 2 needs the signal NexPath used; the runner does not record it yet, so a human decides.
  const namesSignal = isBP ? 'unknown' : 'n_a';
  // rule 5: every pilot prompt is English; flag only non-Latin script as a fail.
  const language = /[ऀ-ॿ઀-૿]/.test(body) ? 'no' : 'yes';
  return {
    r1_names_real_thing: namesRealThing ? 'yes' : 'no',
    r2_names_signal: namesSignal,
    r3_no_wrong_advice: wrongAdvice ? 'no' : 'yes',
    r4_actionable: actionable ? 'yes' : 'no',
    r5_language: language,
  };
}

const popupDir = join(runDir, 'popups');
const files = existsSync(popupDir) ? readdirSync(popupDir).filter((f) => f.endsWith('.txt')).sort() : [];
const rows = [];
for (const f of files) {
  const n = Number(f.replace('.txt', ''));
  const prompt = promptByN.get(n);
  const taskDeploys = TASK_DEPLOYS.test(prompt ? prompt.text : '');
  const text = readFileSync(join(popupDir, f), 'utf8');
  const secs = sectionsOf(text).filter((x) => !NOT_GUIDANCE.test(x.title));
  if (secs.length === 0) rows.push({ run_id: runId, prompt_n: n, section: '(no sections parsed)',
    r1_names_real_thing: 'unknown', r2_names_signal: 'unknown', r3_no_wrong_advice: 'unknown',
    r4_actionable: 'unknown', r5_language: 'unknown', grader: 'rule', note: `${text.length} chars` });
  for (const s of secs) rows.push({ run_id: runId, prompt_n: n, section: s.title,
    ...gradeSection(s, taskDeploys), grader: 'rule', note: '' });
}

const cols = ['run_id','prompt_n','section','r1_names_real_thing','r2_names_signal','r3_no_wrong_advice','r4_actionable','r5_language','grader','note'];
writeFileSync(join(runDir, 'grades.csv'),
  [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c]).replace(/"/g,'""')}"`).join(','))].join('\n') + '\n');

const share = (f) => rows.length ? Math.round(100 * rows.filter(f).length / rows.length) : 0;
const popupsWithWrongAdvice = new Set(rows.filter((r) => r.r3_no_wrong_advice === 'no').map((r) => r.prompt_n));
console.log(`run ${runId}  (${meta.arm}, level ${meta.level})`);
console.log(`  popups graded      : ${files.length}`);
console.log(`  sections graded    : ${rows.length}`);
console.log(`  bad share          : ${share((r) => r.r1_names_real_thing==='no' || r.r3_no_wrong_advice==='no' || r.r4_actionable==='no')}%   (fails rule 1, 3 or 4)`);
console.log(`  names a real thing : ${share((r) => r.r1_names_real_thing==='yes')}%`);
console.log(`  wrong advice       : ${popupsWithWrongAdvice.size} of ${files.length} popups`);
console.log(`  needs a human      : ${rows.filter((r) => Object.values(r).includes('unknown')).length} rows  (rule 2 always, until the runner records the signal)`);
console.log(`  saved: ${join(runDir, 'grades.csv')}`);
