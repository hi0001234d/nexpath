// Voice-rule invariant test for option text content.
//
// Scope: all L1/L2/L3 array entries in options.ts and options-beginner.ts.
// Excluded: question / pinchFallback fields (user-facing pinch-UI labels,
// not sent to the agent as user messages).
//
// Why this is a separate file from option-generator.test.ts: the existing
// per-set "no coaching-voice relay patterns" checks cover a partial 9-phrase
// set focused on relay/coaching constructions. This file enforces the full
// 13-phrase banned-pattern list against every L1/L2/L3 string in both
// modules, in one place — a single invariant that catches regressions
// regardless of which set is modified.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPTIONS_FILE = join(__dirname, 'options.ts');
const OPTIONS_BEGINNER_FILE = join(__dirname, 'options-beginner.ts');

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

// Extract L1/L2/L3 string literals from a .ts source file.
//
// Strategy: parse the file as text. For each `const X: DecisionContent = {`
// block, find the L1 / L2 / L3 arrays and pull each string literal. Skip
// question / pinchFallback fields entirely (UI labels, exempt).
function extractOptionStrings(filePath: string): { setName: string; field: 'L1' | 'L2' | 'L3'; index: number; text: string }[] {
  const source = readFileSync(filePath, 'utf-8');
  const results: { setName: string; field: 'L1' | 'L2' | 'L3'; index: number; text: string }[] = [];

  // Match each set block: `(export )?const ABSENCE_FOO: DecisionContent = { ... };`
  // Use a non-greedy match up to the closing `};` at column 0 (or with closing brace at start of line).
  const setRegex = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]+):\s*DecisionContent\s*=\s*\{([\s\S]*?)\n\};/g;
  let setMatch: RegExpExecArray | null;
  while ((setMatch = setRegex.exec(source)) !== null) {
    const setName = setMatch[1];
    const body = setMatch[2];

    // Within each set body, find L1 / L2 / L3 arrays.
    for (const field of ['L1', 'L2', 'L3'] as const) {
      const arrayRegex = new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\n\\s{2,}\\]`, 'g');
      const arrayMatch = arrayRegex.exec(body);
      if (!arrayMatch) continue;
      const arrayBody = arrayMatch[1];

      // Pull each string literal: single-quoted, possibly multi-line via
      // escape sequences. Match `'...'` allowing `\'` escapes.
      const stringRegex = /'((?:[^'\\]|\\.)*)'/g;
      let strMatch: RegExpExecArray | null;
      let index = 0;
      while ((strMatch = stringRegex.exec(arrayBody)) !== null) {
        // Unescape `\'` and `\\` for the audit text.
        const text = strMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
        results.push({ setName, field, index, text });
        index++;
      }
    }
  }

  return results;
}

describe('Voice-rule invariant — 12 literal banned-pattern phrases', () => {
  describe('options.ts L1/L2/L3 arrays', () => {
    const entries = extractOptionStrings(OPTIONS_FILE);

    it('extracts a reasonable number of option strings (sanity)', () => {
      // options.ts has ~50+ sets, each with ~6 strings on average → expect >= 200.
      expect(entries.length).toBeGreaterThan(200);
    });

    for (const { pattern, desc } of BANNED_PATTERNS) {
      it(`no L1/L2/L3 string contains "${pattern}" (${desc})`, () => {
        const violations = entries.filter(({ text }) =>
          text.toLowerCase().includes(pattern.toLowerCase())
        );
        if (violations.length > 0) {
          const detail = violations
            .map((v) => `  ${v.setName}.${v.field}[${v.index}]: ${v.text.slice(0, 120)}${v.text.length > 120 ? '...' : ''}`)
            .join('\n');
          throw new Error(`Found "${pattern}" in ${violations.length} L1/L2/L3 string(s):\n${detail}`);
        }
      });
    }
  });

  describe('options-beginner.ts L1/L2/L3 arrays', () => {
    const entries = extractOptionStrings(OPTIONS_BEGINNER_FILE);

    it('extracts a reasonable number of option strings (sanity)', () => {
      expect(entries.length).toBeGreaterThan(100);
    });

    for (const { pattern, desc } of BANNED_PATTERNS) {
      it(`no L1/L2/L3 string contains "${pattern}" (${desc})`, () => {
        const violations = entries.filter(({ text }) =>
          text.toLowerCase().includes(pattern.toLowerCase())
        );
        if (violations.length > 0) {
          const detail = violations
            .map((v) => `  ${v.setName}.${v.field}[${v.index}]: ${v.text.slice(0, 120)}${v.text.length > 120 ? '...' : ''}`)
            .join('\n');
          throw new Error(`Found "${pattern}" in ${violations.length} L1/L2/L3 string(s):\n${detail}`);
        }
      });
    }
  });
});
