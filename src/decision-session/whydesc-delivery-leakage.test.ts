import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { extractParamsFromPrompts, weaveWhyDesc, sanitizePromptDerivedValue } from './content-template-grounding.js';
import { combineOptionWithWhyDesc } from './whydesc-delivery.js';
import { SHIPPED_CONTENT_TEMPLATES } from './content-template-tooling.js';

// Phase 17.3 — leakage / safeguard gate at the DELIVERY boundary.
//
// Now that why-desc delivery is ON, the rendered why-desc reaches the coding agent. This file
// proves the two invariants that make that safe end to end:
//   1. A user-prompt-derived secret / PII value is sanitized (§4.E6 gate) and therefore never
//      reaches the delivered prompt (option + why-desc).
//   2. A sensitive signal's record-level l2Safeguard survives the weave and reaches the delivered
//      prompt verbatim, as its final line.
//
// The per-path sanitizers themselves (sanitizePromptDerivedValue; r5-injection F2 maskSecretsInText)
// are unit-tested in content-template-grounding.test.ts and r5-injection.test.ts; here we assert the
// end-to-end guarantee at the combine point the agent actually receives.

function mock(reply: string): OpenAI {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } } } as unknown as OpenAI;
}

const OPTION = 'Write one test for the most important behaviour in what was just built.';

describe('whydesc delivery — leakage + safeguard at the delivery boundary (17.3)', () => {
  it('a prompt-derived secret/PII value is redacted before it can reach the delivered prompt', async () => {
    // extraction runs the §4.E6 sanitize gate on every mined value...
    const facts = await extractParamsFromPrompts(
      ['email me at alice@corp.com and use api_key=sk-ABCD1234EFGH5678'],
      mock(JSON.stringify({ facts: [{ key: 'contact', value: 'email alice@corp.com api_key=sk-ABCD1234EFGH5678' }] })),
    );
    expect(facts.length).toBe(1);
    expect(facts[0].value).not.toMatch(/alice@corp\.com/);
    expect(facts[0].value).not.toMatch(/sk-ABCD1234EFGH5678/);

    // ...and weaving that fact (deterministic assembly — no live LLM) then combining for delivery
    // keeps the secret/PII out of what the agent receives.
    const woven = await weaveWhyDesc(
      { coreLine: 'Ground the change in the current setup.', facts: [{ text: facts[0].value, tier: 'capability' }] },
      mock('not json'), // forces the deterministic fallback (coreLine + facts)
    );
    const delivered = combineOptionWithWhyDesc(OPTION, woven);
    expect(delivered).not.toMatch(/alice@corp\.com/);
    expect(delivered).not.toMatch(/sk-ABCD1234EFGH5678/);
  });

  it('sanitizePromptDerivedValue redacts each PII/secret class (defence in depth behind delivery)', () => {
    expect(sanitizePromptDerivedValue('mail x@y.com')).not.toMatch(/x@y\.com/);
    expect(sanitizePromptDerivedValue('see https://secret.example/q')).not.toMatch(/https?:\/\//);
    expect(sanitizePromptDerivedValue('key at /home/alice/keys/id_rsa')).not.toMatch(/\/home\/alice/);
    // benign tooling facts pass through unchanged
    expect(sanitizePromptDerivedValue('uses Vitest, small team')).toBe('uses Vitest, small team');
  });

  it("a sensitive signal's safeguard survives the weave and reaches the delivered prompt as the final line", async () => {
    const sensitive = SHIPPED_CONTENT_TEMPLATES.find((r) => r.l2SafeguardRequired && r.l2SafeguardLine);
    expect(sensitive).toBeDefined();
    const sg = sensitive!.l2SafeguardLine!;

    // The model drops the safeguard; the weave re-appends it (survival is non-negotiable).
    const woven = await weaveWhyDesc(
      { coreLine: 'Do the flagged action.', facts: [{ text: 'has CI', tier: 'capability' }], l2Safeguard: sg },
      mock(JSON.stringify({ whyDesc: 'Do the flagged action (safeguard dropped by the model).' })),
    );
    expect(woven.endsWith(sg)).toBe(true);

    const delivered = combineOptionWithWhyDesc('Do the flagged action.', woven);
    expect(delivered).toContain(sg);            // the safeguard reaches the agent
    expect(delivered.endsWith(sg)).toBe(true);  // ...as the final line of the delivered prompt
  });
});
