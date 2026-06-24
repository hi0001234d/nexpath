import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyRuntimeSubstitutionsAllLevels } from './runtime-substitutions.js';
import type { DecisionContent } from './options.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The per-set DecisionContent now lives in the per-class content-template files.
const CONTENT_DIR = join(__dirname, 'content-templates');

// Pins the per-set descBaseEnabled outcome of the R1 opt-out evaluation:
// every R3 sub-research's per-set opt-out section (R3.1-Sub1.7,
// R3.2-Sub2.7, R3.3-Sub3.5, R3.4-Sub4.5, R3.5-Sub5.5, R3.6-Sub6.5,
// R3.7-Sub7.5, R3.8-Sub8.5, R3.9-Sub9.5) concluded that ALL sets carry
// desc-bases. None opt out. The DecisionContent.descBaseEnabled field
// defaults to `true` when absent; this test guards against accidental
// inclusion of `descBaseEnabled: false` that would silently disable a
// set's desc-base pipeline against the locked decision.

function readOptionsSources(): string {
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(CONTENT_DIR, f), 'utf-8'))
    .join('\n');
}

describe('descBaseEnabled — per-set opt-out invariant', () => {
  it('scans real content (guard against a vacuous pass)', () => {
    // Every set carries desc-bases, so the content source must contain many.
    expect((readOptionsSources().match(/descBase:/g) ?? []).length).toBeGreaterThan(200);
  });

  it('no set in the source has descBaseEnabled set to false', () => {
    const src = readOptionsSources();
    expect(src).not.toMatch(/descBaseEnabled:\s*false/);
  });

  it('any explicit descBaseEnabled in source uses the value true (rare; default is omit)', () => {
    const src = readOptionsSources();
    const explicitMatches = src.match(/descBaseEnabled:\s*(true|false)/g) ?? [];
    for (const m of explicitMatches) {
      expect(m).toMatch(/descBaseEnabled:\s*true/);
    }
  });
});

// The runtime consumer of the capability flag: the desc-base pipeline skips
// processing when a set declares descBaseEnabled === false, and runs normally
// when it is omitted (default) or true.
describe('descBaseEnabled — runtime consumer (capability-check)', () => {
  function content(descBaseEnabled: boolean | undefined): DecisionContent {
    const base: DecisionContent = {
      signalType:    'TASK_REVIEW',
      question:      'q',
      pinchFallback: 'p',
      L1: [{ option: 'o1', descBase: 'Static desc-base line one.' }],
      L2: [{ option: 'o2', descBase: 'Static desc-base line two.' }],
      L3: [{ option: 'o3', descBase: 'Static desc-base line three.' }],
    };
    return descBaseEnabled === undefined ? base : { ...base, descBaseEnabled };
  }
  const generated = { l1: ['o1'], l2: ['o2'], l3: ['o3'] };

  it('descBaseEnabled === false → pipeline skipped, desc-bases emitted empty (options preserved)', async () => {
    const out = await applyRuntimeSubstitutionsAllLevels(generated, content(false), [], 'TASK_REVIEW', 'casual');
    expect(out.l1[0]).toEqual({ option: 'o1', descBase: '' });
    expect(out.l2[0].descBase).toBe('');
    expect(out.l3[0].descBase).toBe('');
  });

  it('descBaseEnabled omitted (default) → pipeline runs, desc-base is non-empty', async () => {
    const out = await applyRuntimeSubstitutionsAllLevels(generated, content(undefined), [], 'TASK_REVIEW', 'casual');
    expect(out.l1[0].option).toBe('o1');
    expect(out.l1[0].descBase).not.toBe(''); // pipeline produced a desc-base
  });

  it('descBaseEnabled === true → pipeline runs (same as default)', async () => {
    const out = await applyRuntimeSubstitutionsAllLevels(generated, content(true), [], 'TASK_REVIEW', 'casual');
    expect(out.l1[0].descBase).not.toBe('');
  });
});
