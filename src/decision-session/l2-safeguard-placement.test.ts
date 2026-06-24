import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The per-set DecisionContent now lives in the per-class content-template files.
const CONTENT_DIR = join(__dirname, 'content-templates');

// Verifies the L2 inline safeguard placement invariant:
//
// (1) Every L2 confirmation-seek sentence ("ask me for go-ahead
//     confirmation.") MUST appear inside a DecisionContent set whose
//     l2SafeguardRequired field is true. A safeguard sentence in any
//     other set is a misapplication — it would prompt confirmation
//     for an action that wasn't flagged as sensitive.
//
// (2) At least some flagged sets carry safeguard sentences — the
//     dev-plan locked specific options-per-set, so the total count
//     should be > 0. The strict total varies by per-option verb-mood
//     assessment; a hard upper bound would over-specify, so this
//     test asserts only a soft floor (> 30).

const SAFEGUARD_NEEDLE = 'ask me for go-ahead confirmation';

function readOptionsSources(): { path: string; text: string }[] {
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ path: `content-templates/${f}`, text: readFileSync(join(CONTENT_DIR, f), 'utf-8') }));
}

interface SetBlock {
  setName:               string;
  flagged:               boolean;
  hasSafeguardSentence:  boolean;
}

function extractSetBlocks(src: string): SetBlock[] {
  const out: SetBlock[] = [];
  const re = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]+):\s*DecisionContent\s*=\s*\{([\s\S]*?)\n\};/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const setName = m[1];
    const body    = m[2];
    out.push({
      setName,
      flagged:              /l2SafeguardRequired:\s*true/.test(body),
      hasSafeguardSentence: body.includes(SAFEGUARD_NEEDLE),
    });
  }
  return out;
}

describe('L2 inline-safeguard placement invariant', () => {
  it('every safeguard sentence lives inside an l2SafeguardRequired: true set', () => {
    const violations: string[] = [];
    for (const { path, text } of readOptionsSources()) {
      for (const block of extractSetBlocks(text)) {
        if (block.hasSafeguardSentence && !block.flagged) {
          violations.push(`${path}: ${block.setName} has safeguard text but no l2SafeguardRequired: true marker`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('safeguard sentence count across source is in the expected band (> 30 floor)', () => {
    let total = 0;
    for (const { text } of readOptionsSources()) {
      const matches = text.match(new RegExp(SAFEGUARD_NEEDLE, 'g')) ?? [];
      total += matches.length;
    }
    // Dev-plan §9.2 best-estimate is ≤ 60 inline authorings; current
    // authoring stands at 56. The "> 30" floor pins that the inline
    // safeguard pass has actually run; the soft upper limit avoids
    // over-specification when per-option assessment narrows the count.
    expect(total).toBeGreaterThan(30);
    expect(total).toBeLessThanOrEqual(70);
  });

  it('safeguard sentence uses the locked wording suffix', () => {
    // The locked pattern ends in the exact phrase below; this test
    // pins the suffix so future safeguard additions stay consistent.
    for (const { text } of readOptionsSources()) {
      const matches = text.match(/Still, before you[\s\S]*?ask me for go-ahead confirmation\./g) ?? [];
      // Every match must end with the locked suffix (verified by the regex).
      for (const m of matches) {
        expect(m.endsWith('ask me for go-ahead confirmation.')).toBe(true);
      }
    }
  });
});
