import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pins the locked desc-base structural invariant: every authored
// descBase template literal in the option-set source must contain
// the {R4_OPEN} and {R4_CLOSE} bookend placeholders. The runtime
// substitution pipeline replaces these placeholders at option-
// generation time; a descBase missing either placeholder would
// render with no CA-facing bookend at all.
//
// {R5_INJECT: ...} is intentionally NOT required — per the spec, an
// authored desc-base MAY use the injection placeholder but is not
// required to. This test does not assert on it.

// The per-set DecisionContent (and its descBase templates) now live in the
// per-class content-template files.
const CONTENT_DIR = join(__dirname, 'content-templates');
function readContentSource(): string {
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(CONTENT_DIR, f), 'utf-8'))
    .join('\n');
}

function extractTemplates(src: string): { snippet: string; text: string }[] {
  const re = /descBase:\s*`((?:[^`\\]|\\.)*)`/g;
  const out: { snippet: string; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = Math.max(0, m.index - 80);
    out.push({
      snippet: src.slice(start, m.index + 40).replace(/\n/g, '\\n'),
      text:    m[1],
    });
  }
  return out;
}

describe('desc-base placeholder invariant', () => {
  const entries = extractTemplates(readContentSource());

  it('extracts a reasonable number of templates (sanity)', () => {
    expect(entries.length).toBeGreaterThan(1000);
  });

  it('every template contains the {R4_OPEN} bookend placeholder', () => {
    const missing = entries.filter((e) => !e.text.includes('{R4_OPEN}'));
    if (missing.length > 0) {
      const sample = missing.slice(0, 5).map((e) => `  …${e.snippet}…`).join('\n');
      throw new Error(`${missing.length} template(s) missing {R4_OPEN}:\n${sample}`);
    }
  });

  it('every template contains the {R4_CLOSE} bookend placeholder', () => {
    const missing = entries.filter((e) => !e.text.includes('{R4_CLOSE}'));
    if (missing.length > 0) {
      const sample = missing.slice(0, 5).map((e) => `  …${e.snippet}…`).join('\n');
      throw new Error(`${missing.length} template(s) missing {R4_CLOSE}:\n${sample}`);
    }
  });
});
