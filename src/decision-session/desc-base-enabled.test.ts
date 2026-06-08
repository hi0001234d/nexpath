import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pins the per-set descBaseEnabled outcome of the R1 opt-out evaluation:
// every R3 sub-research's per-set opt-out section (R3.1-Sub1.7,
// R3.2-Sub2.7, R3.3-Sub3.5, R3.4-Sub4.5, R3.5-Sub5.5, R3.6-Sub6.5,
// R3.7-Sub7.5, R3.8-Sub8.5, R3.9-Sub9.5) concluded that ALL sets carry
// desc-bases. None opt out. The DecisionContent.descBaseEnabled field
// defaults to `true` when absent; this test guards against accidental
// inclusion of `descBaseEnabled: false` that would silently disable a
// set's desc-base pipeline against the locked decision.

function readOptionsSources(): string {
  return (
    readFileSync(join(__dirname, 'options.ts'), 'utf-8') +
    readFileSync(join(__dirname, 'options-beginner.ts'), 'utf-8')
  );
}

describe('descBaseEnabled — per-set opt-out invariant', () => {
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
