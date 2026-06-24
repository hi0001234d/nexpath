// Voice-rule invariant test for option text content.
//
// Scope: all L1/L2/L3 array entries across the per-class content-template files.
// Excluded: question / pinchFallback fields (user-facing pinch-UI labels,
// not sent to the agent as user messages).
//
// Why this is a separate file from option-generator.test.ts: the existing
// per-set "no coaching-voice relay patterns" checks cover a partial 9-phrase
// set focused on relay/coaching constructions. This file enforces the full
// 13-phrase banned-pattern list against every L1/L2/L3 string, in one place —
// a single invariant that catches regressions regardless of which set is
// modified.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The per-set DecisionContent now lives in the per-class content-template files.
const CONTENT_DIR = join(__dirname, 'content-templates');
function readContentSource(): string {
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(CONTENT_DIR, f), 'utf-8'))
    .join('\n');
}

// 12 unambiguous literal banned-pattern phrases. Each is a case-insensitive
// substring match.
//
// Two patterns from the source banned-list (`it says` / `it finds`) are
// explicitly marked context-sensitive ("where 'it' = AI") and are NOT
// included as bare literals — they can legitimately appear with a clear
// non-AI referent (e.g., "the name that doesn't mean what it says anymore"
// where "it" refers to "the name"). Semantic audits catch the AI-referent
// forms; the literal CI invariant covers the 12 phrases that have no
// reasonable non-AI reading.
const BANNED_PATTERNS: ReadonlyArray<{ pattern: string; desc: string }> = [
  { pattern: 'the AI',           desc: 'third-person AI reference' },
  { pattern: 'Ask the AI',       desc: 'third-person directive to AI' },
  { pattern: 'Have the AI',      desc: 'third-person directive to AI' },
  { pattern: 'Get the AI',       desc: 'third-person directive to AI' },
  { pattern: 'Instruct the AI',  desc: 'third-person directive to AI' },
  { pattern: 'Claude',           desc: 'third-person AI reference (model name)' },
  { pattern: 'the assistant',    desc: 'third-person AI reference' },
  { pattern: 'its answer',       desc: 'third-person possessive for AI output' },
  { pattern: 'its output',       desc: 'third-person possessive for AI output' },
  { pattern: 'this option',      desc: 'third-person self-reference (prompt-as-object)' },
  { pattern: 'the action below', desc: 'third-person self-reference' },
  { pattern: 'the prompt above', desc: 'third-person self-reference' },
];

// Extract L1/L2/L3 string literals from content-template source text.
// For each `const X: DecisionContent = {` block, find the L1 / L2 / L3 arrays
// and pull each string literal. Skip question / pinchFallback (UI labels, exempt).
function extractOptionStrings(source: string): { setName: string; field: 'L1' | 'L2' | 'L3'; index: number; text: string }[] {
  const results: { setName: string; field: 'L1' | 'L2' | 'L3'; index: number; text: string }[] = [];
  const setRegex = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]+):\s*DecisionContent\s*=\s*\{([\s\S]*?)\n\};/g;
  let setMatch: RegExpExecArray | null;
  while ((setMatch = setRegex.exec(source)) !== null) {
    const setName = setMatch[1];
    const body = setMatch[2];
    for (const field of ['L1', 'L2', 'L3'] as const) {
      const arrayRegex = new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\n\\s{2,}\\]`, 'g');
      const arrayMatch = arrayRegex.exec(body);
      if (!arrayMatch) continue;
      const arrayBody = arrayMatch[1];
      const stringRegex = /'((?:[^'\\]|\\.)*)'/g;
      let strMatch: RegExpExecArray | null;
      let index = 0;
      while ((strMatch = stringRegex.exec(arrayBody)) !== null) {
        const text = strMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
        results.push({ setName, field, index, text });
        index++;
      }
    }
  }
  return results;
}

describe('Voice-rule invariant — 12 literal banned-pattern phrases', () => {
  const entries = extractOptionStrings(readContentSource());

  it('extracts a reasonable number of option strings (sanity)', () => {
    expect(entries.length).toBeGreaterThan(300);
  });

  for (const { pattern, desc } of BANNED_PATTERNS) {
    it(`no L1/L2/L3 string contains "${pattern}" (${desc})`, () => {
      const violations = entries.filter(({ text }) => text.toLowerCase().includes(pattern.toLowerCase()));
      if (violations.length > 0) {
        const detail = violations
          .map((v) => `  ${v.setName}.${v.field}[${v.index}]: ${v.text.slice(0, 120)}${v.text.length > 120 ? '...' : ''}`)
          .join('\n');
        throw new Error(`Found "${pattern}" in ${violations.length} L1/L2/L3 string(s):\n${detail}`);
      }
    });
  }
});

// ─── descBase template-literal content (full coverage) ─────────────────────
//
// Pulls every `` descBase: `...` `` template-literal value out of the content
// source and runs the same 12-phrase invariant against the template body.

function extractDescBaseTemplates(source: string): { snippet: string; text: string }[] {
  const results: { snippet: string; text: string }[] = [];
  const re = /descBase:\s*`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = m[1];
    const text = raw.replace(/\\`/g, '`').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
    const start = m.index + m[0].indexOf('`') + 1;
    const snippet = source.slice(Math.max(0, start - 60), Math.min(source.length, start + 60));
    results.push({ snippet, text });
  }
  return results;
}

describe('Voice-rule invariant — descBase template-literal content', () => {
  const entries = extractDescBaseTemplates(readContentSource());

  it('extracts a reasonable number of desc-base templates (sanity)', () => {
    expect(entries.length).toBeGreaterThan(550);
  });

  for (const { pattern, desc } of BANNED_PATTERNS) {
    it(`no descBase template contains "${pattern}" (${desc})`, () => {
      const violations = entries.filter(({ text }) => text.toLowerCase().includes(pattern.toLowerCase()));
      if (violations.length > 0) {
        const detail = violations
          .slice(0, 8)
          .map((v) => `  …${v.snippet.replace(/\n/g, '\\n')}…`)
          .join('\n');
        const more = violations.length > 8 ? `\n  (${violations.length - 8} more not shown)` : '';
        throw new Error(`Found "${pattern}" in ${violations.length} descBase template(s):\n${detail}${more}`);
      }
    });
  }
});
