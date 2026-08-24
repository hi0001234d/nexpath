import { describe, expect, it } from 'vitest';
import { findWhyDescVoiceViolations, scanWhyDescVoice } from './whydesc-voice-lint.js';
import { SHIPPED_CONTENT_TEMPLATES } from './content-template-tooling.js';

// Fixtures are the Phase-0 gold exemplars (docs why-desc-agent-voice-spec-phase0).
// AFTER = positive (must be CLEAN); BEFORE = negative (must FLAG the named pattern).

const AFTER_POSITIVES: ReadonlyArray<{ option: string; whyDesc: string }> = [
  { option: "Name in one line what this PRD must capture — what 'done' looks like.",
    whyDesc: "One sentence, not a document — just the outcome that means the project is done. Don't open the full PRD or any architecture yet." },
  { option: 'Name who this PRD is for and the one acceptance condition that means it is done.',
    whyDesc: "Two things only — the target user and one pass/fail condition that means it's done. Skip the rest of the PRD for now." },
  { option: 'Write a PRD for this project: define the problem, target user, core features…',
    whyDesc: "Fill all five sections and treat each as required — don't move on to architecture or tasks until the PRD is written." },
  { option: 'Write a PRD file: problem, users, acceptance criteria, edge-case table…',
    whyDesc: 'Commit it as an actual file, put the edge cases in given/when/then form, and record the why in one paragraph — so the file, not the chat, is the source of truth.' },
  { option: 'Write one test for the most important behaviour in what was just built.',
    whyDesc: 'Just one test — the single most important behaviour, not full coverage yet.' },
  { option: 'Write tests: unit tests for each function added/modified, and ≥1 integration test…',
    whyDesc: 'Scope this to the code you just changed, not the whole codebase, and make the integration test run the real main path end-to-end — not a mocked stand-in.' },
  { option: 'Write tests covering each function and the main integration path, run the full suite…',
    whyDesc: 'Cover each function you changed plus the main integration path, run the whole suite so nothing else regressed, and commit it as a checkpoint I can roll back to.' },
  { option: 'Enumerate applicable STRIDE threats and define a mitigation control per threat…',
    whyDesc: "Go category by category through STRIDE and give every threat that applies here a named control — don't skip a category just because it seems unlikely." },
  { option: "1. Help me describe what I'm building. 2. Share your understanding with me…",
    whyDesc: "First say back to me, in plain words, what you understand I'm building — so we catch any mismatch before we start planning. Keep it simple, no jargon." },
];

const BEFORE_NEGATIVES: ReadonlyArray<{ whyDesc: string; expect: string }> = [
  { whyDesc: 'The idea is still open-ended; one line of intended scope is the lightest first pin toward a PRD.', expect: 'A-ladder-meta' },
  { whyDesc: 'A lighter pin than the full PRD: the audience plus the single done-condition.', expect: 'A-ladder-meta' },
  { whyDesc: 'Beyond the standard PRD: the edge cases and the intended architecture direction, captured before code.', expect: 'A-ladder-meta' },
  { whyDesc: 'The PRD as a committed file with an edge-case table and a recorded rationale — the durable spec artifact.', expect: 'A-ladder-meta' },
  { whyDesc: 'No tests yet; one test on the most important behaviour is the lightest floor.', expect: 'A-ladder-meta' },
  { whyDesc: 'A light test floor: the critical path covered and committed.', expect: 'A-ladder-meta' },
  { whyDesc: 'Tests haven\'t been written for what was just built; silent regressions become possible the next time anyone touches this code.', expect: 'A-situation-rationale' },
  { whyDesc: 'STRIDE threat model for this feature hasn\'t been completed — risk of un-mitigated attack vectors at ship.', expect: 'A-situation-rationale' },
  { whyDesc: "I'm at the moment where talking about the idea turns into actually planning it; I need a shared understanding before going further.", expect: 'B-user-narration' },
  { whyDesc: 'List the must-be-true things to ship this — each a plain yes/no you can check.', expect: 'C-human-only' },
];

describe('whydesc-voice-lint — gold-exemplar fixtures', () => {
  it('every AFTER (target) is clean', () => {
    for (const { option, whyDesc } of AFTER_POSITIVES) {
      const v = findWhyDescVoiceViolations(whyDesc, option);
      expect(v, `AFTER flagged unexpectedly: ${whyDesc} → ${JSON.stringify(v)}`).toEqual([]);
    }
  });

  it('every BEFORE flags its pattern', () => {
    for (const { whyDesc, expect: pat } of BEFORE_NEGATIVES) {
      const v = findWhyDescVoiceViolations(whyDesc);
      expect(v.map((x) => x.pattern), `BEFORE not flagged: ${whyDesc}`).toContain(pat);
    }
  });
});

describe('whydesc-voice-lint — per-pattern units', () => {
  it('coherence: why-desc restating the option verb flags', () => {
    const v = findWhyDescVoiceViolations('Write one test on the most important behaviour.', 'Write one test for the most important behaviour in what was just built.');
    expect(v.map((x) => x.pattern)).toContain('coherence-restate');
  });
  it('coherence: a complementing why-desc does not flag', () => {
    const v = findWhyDescVoiceViolations('Just one test — the single most important behaviour, not full coverage yet.', 'Write one test for the most important behaviour in what was just built.');
    expect(v.map((x) => x.pattern)).not.toContain('coherence-restate');
  });
  it('C: "you" addressed to the agent is allowed', () => {
    expect(findWhyDescVoiceViolations('Review what you built and report anything risky.')).toEqual([]);
  });
});

describe('whydesc-voice-lint — permanent agent-voice CI gate', () => {
  // Permanent regression gate (no baseline / ratchet): every shipped static why-desc cell must be
  // agent-voice-clean. Any cell drifting back to caption, situation-statement, user-narration, or
  // human-only voice fails the build.
  it('every shipped static why-desc cell is agent-voice-clean', () => {
    const report = scanWhyDescVoice(SHIPPED_CONTENT_TEMPLATES);
    // eslint-disable-next-line no-console
    console.log('[whydesc-voice-lint] flagged cells:', report.total, 'byPattern:', JSON.stringify(report.byPattern));
    expect(report.total, `${report.total} static cell(s) drifted from agent voice: ${JSON.stringify(report.byPattern)}`).toBe(0);
  });
});
