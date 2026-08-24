import { describe, it, expect } from 'vitest';
import { runBuildGate, checkTopicKeyword, checkOptionLengthBudget } from '../content-template-tooling.js';
import {
  reviewRecord, checkVoice, checkEscalation, checkL2Safeguard, findVoiceViolations, findJargonViolations,
} from '../content-authoring-rules.js';
import { composeWhyDesc, composeOption } from '../content-template-engine.js';
import { CONFIRM_SEEK_RE } from '../content-template-grounding.js';
import { detectL2TriggersInText } from '../r5-injection.js';
import {
  ABSENCE_SECRET_IN_PROMPT_RECORD, ABSENCE_NO_VERSION_CONTROL_RECORD, ABSENCE_NO_BACKUP_SAFETY_RECORD,
  ABSENCE_NO_SEPARATE_ENVS_RECORD, ABSENCE_NO_AUTOMATED_SECURITY_SCANNING_RECORD, SECURITY_SAFETY_PARAM_AXES,
} from './class-security-safety.js';
import { ABSENCE_ENV_AND_SECRETS_RECORD } from './class4-records.js';

// A3 — ABSENCE_SECRET_IN_PROMPT: a NEW security/safety signal (no legacy shipped headline),
// so ALL 5 columns are authored fresh — col-3 is NOT a frozen anchor and is subject to every
// authoring gate. Sensitive: rotation + history-scrub → l2SafeguardRequired + safeguard line.

const kw = 'secret';
const optionsOf = (lf: Record<number, { cell: { option: string; whyDesc: string } } | undefined>) =>
  Object.values(lf).filter(Boolean).map((f) => f!.cell);

describe('A3 — ABSENCE_SECRET_IN_PROMPT (new signal, no frozen col-3)', () => {
  const r = ABSENCE_SECRET_IN_PROMPT_RECORD;

  it('passes the build gate (schema-valid + level-1 floor)', () => {
    expect(runBuildGate([r]).ok).toBe(true);
  });
  it('authors all 5 maturity columns', () => {
    expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
  it('declares the grounded param axes the engine filters facts by; no spine (Gap 1)', () => {
    expect(r.paramAxes).toBeDefined();
    expect(r.paramAxes).toEqual(SECURITY_SAFETY_PARAM_AXES);
    expect(r.spine).toBeUndefined(); // security/safety family has no intensifying spine
  });
  it('is de-jargon clean in EVERY column (col-3 authored → not exempt) + headline-only + full coverage', () => {
    const review = reviewRecord(r, kw);
    expect(review.jargonByLevel).toEqual({});
    expect(review.headlineOnly.ok).toBe(true);
    expect(review.coverage.ok).toBe(true);
  });
  it('retains the "secret" keyword in every option AND why-desc (col-3 not exempt)', () => {
    const res = checkTopicKeyword(r, kw);
    expect(res.missingInOption).toEqual([]);
    expect(res.missingInWhyDesc).toEqual([]);
  });
  it('practice richness is monotonic', () => {
    expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
  });
  it('is voice-clean (option = the user\'s message TO the agent)', () => {
    expect(checkVoice(r).ok).toBe(true);
  });
  it('fits the copy-paste budget in every column, col-1 ≤ col-5 (Gap 2)', () => {
    expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
    expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
  });
  it('carries the L2 sensitive-action safeguard that names THIS record\'s action (rotate keys / rewrite history)', () => {
    expect(r.l2SafeguardRequired).toBe(true);
    expect(r.l2SafeguardLine ?? '').toMatch(/go-ahead|ask me/i);
    // The line names its OWN action, not a generic confirm-seek (no cross-record mismatch).
    expect(r.l2SafeguardLine ?? '').toMatch(/rotate|key|history/i);
    expect(checkL2Safeguard(r).ok).toBe(true);
    expect(checkL2Safeguard(r).unguardedLevels).toEqual([]); // record-level line covers all columns
  });
  it('serves the safeguard as the LAST line of EVERY composed column (the served path, not just the static gate)', () => {
    // The record is ship-dark, so no SHIPPED_CONTENT_TEMPLATES test exercises its serving —
    // verify the safeguard is actually appended by composeWhyDesc on each column.
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const composed = composeWhyDesc({ cell: r.levelForms[lvl]!.cell, slots: r.slots, l2Safeguard: r.l2SafeguardLine });
      expect(composed.endsWith(r.l2SafeguardLine!)).toBe(true);
    }
  });
  it('the l2SafeguardLine is itself CA-bound-clean: voice-clean, de-jargon-clean, no runtime placeholders', () => {
    const line = r.l2SafeguardLine!;
    expect(findVoiceViolations(line)).toEqual([]);
    expect(findJargonViolations(line)).toEqual([]);
    expect(line).not.toMatch(/\{[R{]/); // no {R... bookends or {{ slots
  });
  it('the heaviest column yields a written artifact', () => {
    expect(r.levelForms[5]!.cell.option.toLowerCase()).toMatch(/write|note/);
  });
  it('never contains a literal secret token (no-echo guard, belt-and-suspenders to the static+sanitize rule)', () => {
    const SECRET_RE = /\b(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,})\b|(api[_-]?key|password|token)\s*[:=]\s*\S{8,}/i;
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(SECRET_RE);
      expect(c.whyDesc).not.toMatch(SECRET_RE);
    }
  });
  it('stored cells are bare core lines — no {R...} / {{...}} runtime grammar (record↔runtime boundary, Gap 3)', () => {
    const PLACEHOLDER = /\{[R{]/; // runtime bookends "{R..." and slots "{{" — added at runtime, never stored
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(PLACEHOLDER);
      expect(c.whyDesc).not.toMatch(PLACEHOLDER);
    }
  });
  it('the options genuinely trip an L2 trigger (secret-env), so the record-level safeguard is warranted, not vacuous', () => {
    const optionTriggers = new Set(optionsOf(r.levelForms).flatMap((c) => detectL2TriggersInText(c.option).map((t) => t.name)));
    expect(optionTriggers.has('secret-env')).toBe(true); // "secret" → the record genuinely touches a sensitive action
  });
});

describe('A3 — differentiation vs ENV_AND_SECRETS (A2 dedup constraint)', () => {
  it('SECRET_IN_PROMPT and ENV_AND_SECRETS share no option text', () => {
    const a = optionsOf(ABSENCE_SECRET_IN_PROMPT_RECORD.levelForms).map((c) => c.option);
    const b = optionsOf(ABSENCE_ENV_AND_SECRETS_RECORD.levelForms).map((c) => c.option);
    for (const opt of a) expect(b).not.toContain(opt);
  });
});

// A4 — ABSENCE_NO_VERSION_CONTROL: a NEW security/safety signal, keyword "version". MILD
// sensitivity: establishing version control is non-destructive, so the record carries NO
// record-level safeguard. The A4-specific gate proves that decision is sound — no option
// proposes a history-rewrite / force-push, so no option is an L2 trigger.

describe('A4 — ABSENCE_NO_VERSION_CONTROL (new signal, mild — no record-level safeguard)', () => {
  const r = ABSENCE_NO_VERSION_CONTROL_RECORD;
  const kw4 = 'version';

  it('passes the build gate (schema-valid + level-1 floor)', () => {
    expect(runBuildGate([r]).ok).toBe(true);
  });
  it('authors all 5 maturity columns', () => {
    expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
  it('declares the grounded param axes; no spine', () => {
    expect(r.paramAxes).toBeDefined();
    expect(r.paramAxes).toEqual(SECURITY_SAFETY_PARAM_AXES);
    expect(r.spine).toBeUndefined();
  });
  it('is de-jargon clean in every column + headline-only + full coverage', () => {
    const review = reviewRecord(r, kw4);
    expect(review.jargonByLevel).toEqual({});
    expect(review.headlineOnly.ok).toBe(true);
    expect(review.coverage.ok).toBe(true);
  });
  it('retains the "version" keyword in every option AND why-desc', () => {
    const res = checkTopicKeyword(r, kw4);
    expect(res.missingInOption).toEqual([]);
    expect(res.missingInWhyDesc).toEqual([]);
  });
  it('practice richness is monotonic', () => {
    expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
  });
  it('is voice-clean (option = the user\'s message TO the agent)', () => {
    expect(checkVoice(r).ok).toBe(true);
  });
  it('fits the copy-paste budget in every column, col-1 ≤ col-5', () => {
    expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
    expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
  });
  it('the heaviest column yields a written artifact', () => {
    expect(r.levelForms[5]!.cell.option.toLowerCase()).toMatch(/write|note/);
  });
  it('stored cells are bare core lines — no {R...} / {{...}} runtime grammar', () => {
    const PLACEHOLDER = /\{[R{]/;
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(PLACEHOLDER);
      expect(c.whyDesc).not.toMatch(PLACEHOLDER);
    }
  });
  it('carries NO record-level safeguard, and no base option proposes a destructive git action (mild — A1 lock)', () => {
    // The record must NOT be flagged: base version-control advice is non-destructive.
    expect(r.l2SafeguardRequired).toBeFalsy();
    expect(r.l2SafeguardLine).toBeUndefined();
    // The safeguard gate passes because NO option is an L2 trigger (nothing to guard).
    expect(checkL2Safeguard(r).ok).toBe(true);
    expect(checkL2Safeguard(r).unguardedLevels).toEqual([]);
    // Belt-and-suspenders: no option contains history-rewrite / force-push language — this is
    // what WOULD demand a safeguard per the A1 lock. Also catches the rebase/reset/filter-branch
    // terms that detectL2TriggersInText does not model, so the "no safeguard" stays provably sound.
    const DESTRUCTIVE_GIT = /force[- ]?push|--force|\brebase\b|reset\s+--hard|rewrite\s+history|filter-branch/i;
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(DESTRUCTIVE_GIT);
      expect(c.whyDesc).not.toMatch(DESTRUCTIVE_GIT);
    }
  });
});

// A5 — ABSENCE_NO_BACKUP_SAFETY: a NEW security/safety signal, keyword "backup". MILD
// data-sensitivity with a PER-OPTION safeguard. Standing up + scheduling a backup (cols 1–2) is
// non-destructive → unguarded. Proving recovery means an actual restore, which OVERWRITES the
// current data — the destructive-adjacent case the A1 lock says MUST carry the safeguard. So
// cols 3–5 propose the restore AND carry the confirm-seek in both channels (option + why-desc);
// the record uses NO record-level l2SafeguardLine (that would wrongly guard the base cols too).

describe('A5 — ABSENCE_NO_BACKUP_SAFETY (new signal, mild — no record-level safeguard)', () => {
  const r = ABSENCE_NO_BACKUP_SAFETY_RECORD;
  const kw5 = 'backup';

  it('passes the build gate (schema-valid + level-1 floor)', () => {
    expect(runBuildGate([r]).ok).toBe(true);
  });
  it('authors all 5 maturity columns', () => {
    expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
  it('declares the grounded param axes; no spine', () => {
    expect(r.paramAxes).toBeDefined();
    expect(r.paramAxes).toEqual(SECURITY_SAFETY_PARAM_AXES);
    expect(r.spine).toBeUndefined();
  });
  it('is de-jargon clean in every column + headline-only + full coverage', () => {
    const review = reviewRecord(r, kw5);
    expect(review.jargonByLevel).toEqual({});
    expect(review.headlineOnly.ok).toBe(true);
    expect(review.coverage.ok).toBe(true);
  });
  it('retains the "backup" keyword in every option AND why-desc', () => {
    const res = checkTopicKeyword(r, kw5);
    expect(res.missingInOption).toEqual([]);
    expect(res.missingInWhyDesc).toEqual([]);
  });
  it('practice richness is monotonic', () => {
    expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
  });
  it('is voice-clean (option = the user\'s message TO the agent)', () => {
    expect(checkVoice(r).ok).toBe(true);
  });
  it('fits the copy-paste budget in every column, col-1 ≤ col-5', () => {
    expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
    expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
  });
  it('the heaviest column yields a written artifact', () => {
    expect(r.levelForms[5]!.cell.option.toLowerCase()).toMatch(/write|note/);
  });
  it('stored cells are bare core lines — no {R...} / {{...}} runtime grammar', () => {
    const PLACEHOLDER = /\{[R{]/;
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(PLACEHOLDER);
      expect(c.whyDesc).not.toMatch(PLACEHOLDER);
    }
  });
  it('applies the L2 safeguard as a per-option confirm-seek on the restore/overwrite columns ONLY, never on base setup advice (A1 lock)', () => {
    const CONFIRM_SEEK = /ask me for go-ahead|check with me|go-ahead before/i;
    const RESTORE_OVERWRITE = /\brestor|\brecover|overwrit/i;
    // Base setup columns (1–2): no restore proposed, and NO safeguard in EITHER channel.
    for (const lvl of [1, 2] as const) {
      expect(RESTORE_OVERWRITE.test(r.levelForms[lvl]!.cell.option)).toBe(false);
      expect(CONFIRM_SEEK.test(r.levelForms[lvl]!.cell.option)).toBe(false);
      expect(CONFIRM_SEEK.test(r.levelForms[lvl]!.cell.whyDesc)).toBe(false);
    }
    // Restore/overwrite columns (3–5): propose a restore over existing data AND carry the
    // confirm-seek in BOTH channels — the option (reliably served) and the why-desc (the
    // sensitive-action desc-base rule: the agent reads the why-desc as the detailed explanation).
    for (const lvl of [3, 4, 5] as const) {
      expect(RESTORE_OVERWRITE.test(r.levelForms[lvl]!.cell.option)).toBe(true);
      expect(CONFIRM_SEEK.test(r.levelForms[lvl]!.cell.option)).toBe(true);
      expect(CONFIRM_SEEK.test(r.levelForms[lvl]!.cell.whyDesc)).toBe(true);
    }
    // The safeguard is PER-OPTION (in the option text + why-desc), NOT a record-level line that
    // the engine would append to the base columns too. So no record-level flag/line is set.
    expect(r.l2SafeguardRequired).toBeFalsy();
    expect(r.l2SafeguardLine).toBeUndefined();
    expect(checkL2Safeguard(r).ok).toBe(true);
  });
  it('the restore columns genuinely trip an L2 trigger (destructive-data), so the per-option safeguard is enforced, not vacuous', () => {
    // The gate only inspects a column when its option trips an L2 trigger. The restore/overwrite
    // columns must trip one (else checkL2Safeguard would pass vacuously and a dropped confirm-seek
    // would go unnoticed); the base setup columns must trip none (they carry no safeguard by design).
    for (const lvl of [1, 2] as const) {
      expect(detectL2TriggersInText(r.levelForms[lvl]!.cell.option)).toEqual([]);
    }
    for (const lvl of [3, 4, 5] as const) {
      const names = detectL2TriggersInText(r.levelForms[lvl]!.cell.option).map((t) => t.name);
      expect(names).toContain('destructive-data');
    }
  });
  it('serves the confirm-seek VERBATIM on restore columns, never on base columns (composeOption — the reliable channel)', () => {
    // composeOption serves the option text verbatim (slot-fill only, no LLM rewrite), so the
    // per-option safeguard survives serving — unlike the why-desc, which the weave can reword.
    const CONFIRM_SEEK = /ask me for go-ahead|check with me/i;
    for (const lvl of [1, 2] as const) {
      expect(composeOption({ cell: r.levelForms[lvl]!.cell, slots: r.slots })).not.toMatch(CONFIRM_SEEK);
    }
    for (const lvl of [3, 4, 5] as const) {
      expect(composeOption({ cell: r.levelForms[lvl]!.cell, slots: r.slots })).toMatch(CONFIRM_SEEK);
    }
  });
  it('the restore columns\' confirm-seek is recognized by the ENGINE\'s CONFIRM_SEEK_RE, so the weave + simpler-derive preserve it (base columns are not)', () => {
    // Single source of truth: the hardening (weaveWhyDesc + deriveSimplerCell) only preserves a
    // safeguard whose phrasing matches the engine's CONFIRM_SEEK_RE. Tie A5's ACTUAL content to
    // that matcher so a future phrasing change can't silently defeat the preservation.
    for (const lvl of [1, 2] as const) {
      expect(CONFIRM_SEEK_RE.test(r.levelForms[lvl]!.cell.option)).toBe(false);
      expect(CONFIRM_SEEK_RE.test(r.levelForms[lvl]!.cell.whyDesc)).toBe(false);
    }
    for (const lvl of [3, 4, 5] as const) {
      expect(CONFIRM_SEEK_RE.test(r.levelForms[lvl]!.cell.option)).toBe(true);
      expect(CONFIRM_SEEK_RE.test(r.levelForms[lvl]!.cell.whyDesc)).toBe(true);
    }
  });
});

// A6 — ABSENCE_NO_SEPARATE_ENVS: a NEW security/safety signal, keyword "environment". HIGH-RISK:
// standing up separate environments touches production + moves credentials → RECORD-LEVEL
// safeguard (the A3 mechanism: l2SafeguardRequired + l2SafeguardLine appended to every column).
// About environment SEPARATION only — never restating ENV_AND_SECRETS's secrets-storage hygiene.

describe('A6 — ABSENCE_NO_SEPARATE_ENVS (new signal, HIGH-RISK — record-level safeguard)', () => {
  const r = ABSENCE_NO_SEPARATE_ENVS_RECORD;
  const kw6 = 'environment';

  it('passes the build gate (schema-valid + level-1 floor)', () => {
    expect(runBuildGate([r]).ok).toBe(true);
  });
  it('authors all 5 maturity columns', () => {
    expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
  it('declares the grounded param axes; no spine', () => {
    expect(r.paramAxes).toBeDefined();
    expect(r.paramAxes).toEqual(SECURITY_SAFETY_PARAM_AXES);
    expect(r.spine).toBeUndefined();
  });
  it('is de-jargon clean in every column + headline-only + full coverage', () => {
    const review = reviewRecord(r, kw6);
    expect(review.jargonByLevel).toEqual({});
    expect(review.headlineOnly.ok).toBe(true);
    expect(review.coverage.ok).toBe(true);
  });
  it('retains the "environment" keyword in every option AND why-desc', () => {
    const res = checkTopicKeyword(r, kw6);
    expect(res.missingInOption).toEqual([]);
    expect(res.missingInWhyDesc).toEqual([]);
  });
  it('practice richness is monotonic', () => {
    expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
  });
  it('is voice-clean (option = the user\'s message TO the agent)', () => {
    expect(checkVoice(r).ok).toBe(true);
  });
  it('fits the copy-paste budget in every column, col-1 ≤ col-5', () => {
    expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
    expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
  });
  it('the heaviest column yields a written artifact', () => {
    expect(r.levelForms[5]!.cell.option.toLowerCase()).toMatch(/write|note/);
  });
  it('stored cells are bare core lines — no {R...} / {{...}} runtime grammar', () => {
    const PLACEHOLDER = /\{[R{]/;
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(PLACEHOLDER);
      expect(c.whyDesc).not.toMatch(PLACEHOLDER);
    }
  });
  it('carries the record-level L2 safeguard that names THIS record\'s action (touch production / move credentials)', () => {
    expect(r.l2SafeguardRequired).toBe(true);
    expect(r.l2SafeguardLine ?? '').toMatch(/go-ahead|ask me/i);
    expect(r.l2SafeguardLine ?? '').toMatch(/production|environment|credential/i);
    expect(checkL2Safeguard(r).ok).toBe(true);
    expect(checkL2Safeguard(r).unguardedLevels).toEqual([]);
  });
  it('serves the safeguard as the LAST line of EVERY composed column (the served path)', () => {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const composed = composeWhyDesc({ cell: r.levelForms[lvl]!.cell, slots: r.slots, l2Safeguard: r.l2SafeguardLine });
      expect(composed.endsWith(r.l2SafeguardLine!)).toBe(true);
    }
  });
  it('the l2SafeguardLine is itself CA-bound-clean: voice-clean, de-jargon-clean, no runtime placeholders', () => {
    const line = r.l2SafeguardLine!;
    expect(findVoiceViolations(line)).toEqual([]);
    expect(findJargonViolations(line)).toEqual([]);
    expect(line).not.toMatch(/\{[R{]/);
  });
  it('never contains a literal secret/credential token (no-echo guard, belt-and-suspenders to the static+sanitize rule)', () => {
    const SECRET_RE = /\b(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,})\b|(api[_-]?key|password|token)\s*[:=]\s*\S{8,}/i;
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(SECRET_RE);
      expect(c.whyDesc).not.toMatch(SECRET_RE);
    }
  });
  it('the options trip an L2 trigger (deployment) so the record-level safeguard is warranted, not vacuous; the safeguard names both the production and credential actions the spec identifies', () => {
    // Options are about SEPARATION (staging/production → the deployment trigger), deliberately
    // without credential language (the ENV_AND_SECRETS differentiation). The credential aspect is
    // named ABSTRACTLY in the safeguard line ("move any environment credentials") — the plural
    // "credentials" does not trip the secret-env detector (\bcredential\b needs a word boundary),
    // but the record-level safeguard is ALWAYS served, so it covers the action regardless.
    const optionTriggers = new Set(optionsOf(r.levelForms).flatMap((c) => detectL2TriggersInText(c.option).map((t) => t.name)));
    expect(optionTriggers.has('deployment')).toBe(true);
    expect(r.l2SafeguardLine!).toMatch(/\bproduction\b/i);
    expect(r.l2SafeguardLine!).toMatch(/\bcredential/i);
  });
});

describe('A6 — differentiation vs ENV_AND_SECRETS + SECRET_IN_PROMPT (A2 dedup constraint)', () => {
  it('NO_SEPARATE_ENVS shares no option text with ENV_AND_SECRETS or SECRET_IN_PROMPT', () => {
    const envSep = optionsOf(ABSENCE_NO_SEPARATE_ENVS_RECORD.levelForms).map((c) => c.option);
    const envSecrets = optionsOf(ABSENCE_ENV_AND_SECRETS_RECORD.levelForms).map((c) => c.option);
    const secretInPrompt = optionsOf(ABSENCE_SECRET_IN_PROMPT_RECORD.levelForms).map((c) => c.option);
    for (const opt of envSep) {
      expect(envSecrets).not.toContain(opt);
      expect(secretInPrompt).not.toContain(opt);
    }
  });
});

// A7 — ABSENCE_NO_AUTOMATED_SECURITY_SCANNING: a NEW security/safety signal, keyword "scan".
// HIGH-RISK: acting on scan results installs/upgrades dependencies + changes CI/deploy config →
// RECORD-LEVEL safeguard (A3/A6 mechanism). Heavily de-jargoned: plain action leads; SAST/CVE/CI
// appear ONLY inside a trailing parenthetical.

describe('A7 — ABSENCE_NO_AUTOMATED_SECURITY_SCANNING (new signal, HIGH-RISK — record-level safeguard)', () => {
  const r = ABSENCE_NO_AUTOMATED_SECURITY_SCANNING_RECORD;
  const kw7 = 'scan';

  it('passes the build gate (schema-valid + level-1 floor)', () => {
    expect(runBuildGate([r]).ok).toBe(true);
  });
  it('authors all 5 maturity columns', () => {
    expect(Object.keys(r.levelForms).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
  it('declares the grounded param axes; no spine', () => {
    expect(r.paramAxes).toBeDefined();
    expect(r.paramAxes).toEqual(SECURITY_SAFETY_PARAM_AXES);
    expect(r.spine).toBeUndefined();
  });
  it('is de-jargon clean in every column + headline-only + full coverage', () => {
    const review = reviewRecord(r, kw7);
    expect(review.jargonByLevel).toEqual({});
    expect(review.headlineOnly.ok).toBe(true);
    expect(review.coverage.ok).toBe(true);
  });
  it('keeps SAST/CVE/CI jargon OUT of the bare instruction — only inside a trailing parenthetical (heavy de-jargon, A1 lock names all three)', () => {
    const stripParens = (s: string) => s.replace(/\([^)]*\)/g, ' ');
    const JARGON = /\bSAST\b|\bCVE\b|\bCI\b/i;
    for (const c of optionsOf(r.levelForms)) {
      expect(stripParens(c.option)).not.toMatch(JARGON);
      expect(stripParens(c.whyDesc)).not.toMatch(JARGON);
    }
  });
  it('retains the "scan" keyword in every option AND why-desc', () => {
    const res = checkTopicKeyword(r, kw7);
    expect(res.missingInOption).toEqual([]);
    expect(res.missingInWhyDesc).toEqual([]);
  });
  it('practice richness is monotonic', () => {
    expect(checkEscalation([1, 2, 3, 4, 5]).ok).toBe(true);
  });
  it('is voice-clean (option = the user\'s message TO the agent)', () => {
    expect(checkVoice(r).ok).toBe(true);
  });
  it('fits the copy-paste budget in every column, col-1 ≤ col-5', () => {
    expect(checkOptionLengthBudget(r).overLevels).toEqual([]);
    expect(r.levelForms[1]!.cell.option.length).toBeLessThanOrEqual(r.levelForms[5]!.cell.option.length);
  });
  it('the heaviest column yields a written artifact', () => {
    expect(r.levelForms[5]!.cell.option.toLowerCase()).toMatch(/write|note/);
  });
  it('stored cells are bare core lines — no {R...} / {{...}} runtime grammar', () => {
    const PLACEHOLDER = /\{[R{]/;
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(PLACEHOLDER);
      expect(c.whyDesc).not.toMatch(PLACEHOLDER);
    }
  });
  it('never contains a literal secret/credential token (no-echo guard, belt-and-suspenders to the static+sanitize rule)', () => {
    const SECRET_RE = /\b(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,})\b|(api[_-]?key|password|token)\s*[:=]\s*\S{8,}/i;
    for (const c of optionsOf(r.levelForms)) {
      expect(c.option).not.toMatch(SECRET_RE);
      expect(c.whyDesc).not.toMatch(SECRET_RE);
    }
  });
  it('carries the record-level L2 safeguard that names THIS record\'s action (install/upgrade deps / change CI/deploy config)', () => {
    expect(r.l2SafeguardRequired).toBe(true);
    expect(r.l2SafeguardLine ?? '').toMatch(/go-ahead|ask me/i);
    expect(r.l2SafeguardLine ?? '').toMatch(/upgrade|dependenc|deploy|CI/i);
    expect(checkL2Safeguard(r).ok).toBe(true);
    expect(checkL2Safeguard(r).unguardedLevels).toEqual([]);
  });
  it('serves the safeguard as the LAST line of EVERY composed column (the served path)', () => {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const composed = composeWhyDesc({ cell: r.levelForms[lvl]!.cell, slots: r.slots, l2Safeguard: r.l2SafeguardLine });
      expect(composed.endsWith(r.l2SafeguardLine!)).toBe(true);
    }
  });
  it('the l2SafeguardLine is itself CA-bound-clean: voice-clean, de-jargon-clean, no runtime placeholders', () => {
    const line = r.l2SafeguardLine!;
    expect(findVoiceViolations(line)).toEqual([]);
    expect(findJargonViolations(line)).toEqual([]);
    expect(line).not.toMatch(/\{[R{]/);
  });
  it('the options trip an L2 trigger (dep-install) so the record-level safeguard is warranted; the safeguard names both the dependency and CI/deploy actions', () => {
    const optionTriggers = new Set(optionsOf(r.levelForms).flatMap((c) => detectL2TriggersInText(c.option).map((t) => t.name)));
    expect(optionTriggers.has('dep-install')).toBe(true); // "upgrade" → the record genuinely touches a sensitive action
    const lineTriggers = new Set(detectL2TriggersInText(r.l2SafeguardLine!).map((t) => t.name));
    expect(lineTriggers.has('dep-install')).toBe(true);  // "install or upgrade dependencies"
    expect(lineTriggers.has('deployment')).toBe(true);   // "change the CI/deploy config"
  });
});
