import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { composeAdvisory, type RecordCandidateLookup } from './content-template-engine.js';
import { deliverSelectedPrompt } from './whydesc-delivery.js';
import { findWhyDescVoiceViolations } from './whydesc-voice-lint.js';
import { SHIPPED_CONTENT_TEMPLATES } from './content-template-tooling.js';

// Phase 17.4 — semi-e2e sim spot-check.
//
// Drive composeAdvisory (the real record-resolve → column-resolve → two-channel compose path)
// across several representative signals and registers — including sensitive ones — then simulate
// the now-live delivery (deliverSelectedPrompt, enabled=true) and assert, at the prompt the agent
// receives: option + agent-voiced why-desc, the why-desc is voice-lint clean, and for a sensitive
// signal the record-level safeguard is present (as the final line).

function lookupOf(map: Partial<Record<string, unknown>>): RecordCandidateLookup {
  return (source) => map[source];
}
// Invalid JSON → the live grounding falls back to the deterministic assembly (the authored
// agent-voiced core line + safeguard), i.e. the real shipped why-desc, no live LLM dependency.
const mock: OpenAI = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'not json' } }] }) } } } as unknown as OpenAI;

const rec = (sig: string) => SHIPPED_CONTENT_TEMPLATES.find((r) => r.signalType === sig)!;

interface Spot { sig: string; level: 1 | 2 | 3 | 4 | 5; register?: string; sensitive?: boolean }

const SPOTS: readonly Spot[] = [
  { sig: 'ABSENCE_TEST_CREATION',          level: 3 },                       // class2 verification, base
  { sig: 'ABSENCE_TEST_CREATION',          level: 2, register: 'beginner' }, // beginner register
  { sig: 'ABSENCE_USER_VALUE_CHECK',       level: 1 },                       // class8 role-cluster, base
  { sig: 'ABSENCE_DEPENDENCY_ADVENTURE',   level: 5, sensitive: true },      // class7, sensitive (dependency add)
  { sig: 'ABSENCE_LAUNCH_STRATEGY_ABSENCE', level: 5, sensitive: true },     // class8, sensitive (publish/launch)
];

describe('whydesc delivery — semi-e2e sim spot-check (17.4)', () => {
  for (const spot of SPOTS) {
    const label = `${spot.sig} L${spot.level}${spot.register ? ' (' + spot.register + ')' : ''}${spot.sensitive ? ' [sensitive]' : ''}`;
    it(`delivers option + agent-voiced why-desc for ${label}`, async () => {
      const record = rec(spot.sig);
      const composed = await composeAdvisory(
        { lookup: lookupOf({ shipped: record }), level: spot.level, register: spot.register },
        mock,
      );
      expect(composed).not.toBeNull();
      if (!composed) return;

      // Simulate the now-live delivery (gate ON).
      const delivered = deliverSelectedPrompt(composed.option, composed.whyDesc, true);
      expect(delivered).toBe(`${composed.option}\n\n${composed.whyDesc}`);

      // What reaches the agent is agent-voice clean.
      expect(findWhyDescVoiceViolations(composed.whyDesc, composed.option)).toEqual([]);

      if (spot.sensitive) {
        const sg = record.l2SafeguardLine!;
        expect(composed.l2Safeguard).toBe(sg);           // safeguard sourced from the record
        expect(composed.whyDesc).toContain(sg);          // ...survived compose into the why-desc
        expect(delivered.trimEnd().endsWith(sg)).toBe(true); // ...and lands as the delivered prompt's final line
      }

      // eslint-disable-next-line no-console
      console.log(`[17.4] ${label} DELIVERED >>>\n${delivered}\n<<<`);
    });
  }
});
