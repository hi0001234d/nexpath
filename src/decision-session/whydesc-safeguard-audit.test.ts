import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { SHIPPED_CONTENT_TEMPLATES } from './content-template-tooling.js';
import { checkL2Safeguard, findVoiceViolations, findJargonViolations } from './content-authoring-rules.js';
import { composeAdvisory, resolveRegisterForms, type RecordCandidateLookup } from './content-template-engine.js';
import { deliverSelectedPrompt } from './whydesc-delivery.js';
import { CONFIRM_SEEK_RE } from './content-template-grounding.js';
import type { ContentTemplateRecord, MaturityLevel } from './content-template-schema.js';

// Phase 18.3 — safeguard + leakage audit across ALL sensitive records.
//
// Every record flagged l2SafeguardRequired must (a) carry a CA-bound-clean, confirm-seeking
// l2SafeguardLine, (b) be fully guarded across all served columns in BOTH registers, and (c) have
// that safeguard survive compose → delivery to the agent as the delivered prompt's final line.
// Leakage: the safeguard line is static record data (no prompt-derived text), and the why-desc
// path is sanitized at extraction (§4.E6, covered by whydesc-delivery-leakage.test.ts) — here we
// additionally assert the safeguard line itself carries no runtime placeholder or PII.

const PLACEHOLDER = /\{[R{]/;
function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}
const mock: OpenAI = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'not json' } }] }) } } } as unknown as OpenAI;
function asBeginner(r: ContentTemplateRecord): ContentTemplateRecord {
  return { ...r, levelForms: resolveRegisterForms(r, 'beginner') };
}

const SENSITIVE = SHIPPED_CONTENT_TEMPLATES.filter((r) => r.l2SafeguardRequired);

describe('safeguard audit — all sensitive records (18.3)', () => {
  it('there is a non-trivial set of record-level sensitive records', () => {
    expect(SENSITIVE.length).toBeGreaterThanOrEqual(20); // 26 at time of writing
  });

  for (const r of SENSITIVE) {
    describe(r.signalType, () => {
      const sg = r.l2SafeguardLine;

      it('carries a CA-bound-clean, confirm-seeking l2SafeguardLine', () => {
        expect(typeof sg).toBe('string');
        expect(sg!.trim().length).toBeGreaterThan(0);
        expect(CONFIRM_SEEK_RE.test(sg!)).toBe(true);           // asks for go-ahead / check with me
        expect(findVoiceViolations(sg!)).toEqual([]);           // voice-clean
        expect(findJargonViolations(sg!)).toEqual([]);          // jargon-clean
        expect(sg!).not.toMatch(PLACEHOLDER);                   // no {R...}/{{...}} runtime token
        expect(sg!).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);    // no PII (email) baked in
      });

      it('is fully guarded across all served columns in base AND beginner registers', () => {
        expect(checkL2Safeguard(r).unguardedLevels).toEqual([]);
        if (r.registerOverrides?.beginner) {
          expect(checkL2Safeguard(asBeginner(r)).ok).toBe(true);
        }
      });

      it('the safeguard survives compose → delivery as the delivered prompt final line (L1 + L5)', async () => {
        for (const level of [1, 5] as MaturityLevel[]) {
          const composed = await composeAdvisory({ lookup: lookupOf({ shipped: r }), level }, mock);
          expect(composed, `${r.signalType} L${level} composed`).not.toBeNull();
          if (!composed) continue;
          expect(composed.l2Safeguard).toBe(sg);
          expect(composed.whyDesc).toContain(sg!);
          const delivered = deliverSelectedPrompt(composed.option, composed.whyDesc, true);
          expect(delivered.trimEnd().endsWith(sg!.trim()), `${r.signalType} L${level} delivered ends with safeguard`).toBe(true);
        }
      });
    });
  }
});

describe('safeguard audit — per-column inline confirm-seek (NO_BACKUP restore columns)', () => {
  const noBackup = SHIPPED_CONTENT_TEMPLATES.find((r) => r.signalType === 'ABSENCE_NO_BACKUP_SAFETY');

  it('NO_BACKUP_SAFETY restore columns keep their inline confirm-seek and pass the L2 gate', () => {
    expect(noBackup).toBeDefined();
    if (!noBackup) return;
    // Not record-level flagged (it would wrongly guard non-destructive cols 1-2), but the restore
    // columns carry an inline confirm-seek and the gate must find every guarded column consistent.
    expect(noBackup.l2SafeguardRequired).toBeUndefined();
    expect(checkL2Safeguard(noBackup).ok).toBe(true);
    for (const lvl of [3, 4, 5] as const) {
      const c = noBackup.levelForms[lvl]?.cell;
      if (!c) continue;
      expect(CONFIRM_SEEK_RE.test(c.option) || CONFIRM_SEEK_RE.test(c.whyDesc)).toBe(true);
    }
  });
});
