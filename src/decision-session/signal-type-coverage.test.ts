import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { R5_D_FALLBACKS } from './r5-fallbacks.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, 'content-templates');

const VARIANT_SUFFIXES = ['_CASUAL', '_FORMAL', '_BEGINNER'] as const;

function baseName(constName: string): string {
  for (const s of VARIANT_SUFFIXES) {
    if (constName.endsWith(s)) return constName.slice(0, -s.length);
  }
  return constName;
}

/**
 * Scan a source file for `(export )?const NAME: DecisionContent = { ... }`
 * declarations and pair each constant name with the literal `signalType:`
 * value on the next non-empty line.
 */
function scanDeclarations(source: string): Array<{ constName: string; signalType: string | null; lineNumber: number }> {
  const lines  = source.split(/\r?\n/);
  const decl   = /^(?:export )?const (\w+): DecisionContent = \{$/;
  const sigRe  = /^\s*signalType:\s*['"`]([^'"`]+)['"`]\s*,?\s*$/;
  const result: Array<{ constName: string; signalType: string | null; lineNumber: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(decl);
    if (!m) continue;
    const constName = m[1];
    // Find the first non-blank line after the opening brace; expect signalType there.
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    const sigMatch = lines[j]?.match(sigRe);
    result.push({ constName, signalType: sigMatch ? sigMatch[1] : null, lineNumber: i + 1 });
  }
  return result;
}

function loadAllDeclarations() {
  // The DecisionContent consts now live in the per-class content-template files.
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.ts') && /^class\d+-/.test(f))
    .flatMap((f) => scanDeclarations(readFileSync(join(CONTENT_DIR, f), 'utf8')).map((d) => ({ ...d, file: `content-templates/${f}` })));
}

describe('DecisionContent signalType coverage invariant', () => {
  const declarations = loadAllDeclarations();

  it('scans the full content set (guard against a vacuous pass)', () => {
    expect(declarations.length).toBeGreaterThan(200);
  });

  it('every DecisionContent constant declares a signalType as its first field', () => {
    const missing = declarations.filter((d) => d.signalType === null);
    expect(missing.map((d) => `${d.file}:${d.lineNumber} ${d.constName}`)).toEqual([]);
  });

  it('each constant\'s signalType matches its base name (register suffixes stripped)', () => {
    const mismatches = declarations
      .filter((d) => d.signalType !== null)
      .filter((d) => d.signalType !== baseName(d.constName));
    expect(mismatches.map((d) => `${d.file}:${d.lineNumber} ${d.constName} → ${d.signalType} (expected ${baseName(d.constName)})`)).toEqual([]);
  });

  it('every distinct signalType is also a key in R5_D_FALLBACKS', () => {
    const distinctSignalTypes = new Set(declarations.map((d) => d.signalType).filter((s): s is string => s !== null));
    const missingFromFallbacks = [...distinctSignalTypes].filter((s) => !(s in R5_D_FALLBACKS));
    expect(missingFromFallbacks).toEqual([]);
  });
});
