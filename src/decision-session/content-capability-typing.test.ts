import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as ts from 'typescript';
import { resolveWhyHelpContent, type WhyHelpRegister } from './why-help-compose.js';
import type { WhyHelpEntry } from './why-help.js';

/**
 * Capability-based content-typing guards (build-time + behavioural):
 *  - consumers narrow-check a capability/discriminant before invoking a feature,
 *  - every discriminant case is handled (no silent fall-through),
 *  - the capability surface stays BOUNDED (no god-union, no boolean-flag sprawl).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WHY_HELP_SRC = readFileSync(join(HERE, 'why-help.ts'), 'utf8');
const OPTIONS_SRC = readFileSync(join(HERE, 'options.ts'), 'utf8');

/** Literal values of a discriminant field across a type-alias union's variants. */
function discriminantLiterals(sourceText: string, typeName: string, field: string): string[] {
  const sf = ts.createSourceFile(`${typeName}.ts`, sourceText, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      found = true;
      const variants = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
      for (const v of variants) {
        if (!ts.isTypeLiteralNode(v)) continue;
        for (const m of v.members) {
          if (
            ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name) && m.name.text === field &&
            m.type && ts.isLiteralTypeNode(m.type) && ts.isStringLiteral(m.type.literal)
          ) {
            out.push(m.type.literal.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error(`type ${typeName} not found in source`);
  return out;
}

/** Count of boolean-typed property signatures on an interface (capability flags). */
function booleanFieldCount(sourceText: string, interfaceName: string): number {
  const sf = ts.createSourceFile(`${interfaceName}.ts`, sourceText, ts.ScriptTarget.Latest, true);
  let count = 0;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = true;
      for (const m of node.members) {
        if (ts.isPropertySignature(m) && m.type && m.type.kind === ts.SyntaxKind.BooleanKeyword) count++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error(`interface ${interfaceName} not found in source`);
  return count;
}

// Bounded-sprawl caps (documented, generous; tripping these forces a deliberate
// review — prefer one discriminant over many booleans).
const MAX_DISCRIMINANT_VARIANTS = 8;
const MAX_BOOLEAN_CAPABILITY_FLAGS = 6;

// One construction per declared WhyHelpEntry variant (used for exhaustiveness).
const HANDLED: Record<string, WhyHelpEntry> = {
  'universal-triplet': { structure: 'universal-triplet', content: { formal: 'F', casual: 'C', beginner: 'B' } },
  'class7-vibe-coder': { structure: 'class7-vibe-coder', content: { casual: 'C', beginner: 'B' } },
  'class8-role-cluster': { structure: 'class8-role-cluster', content: { founder_casual: 'FC' } },
  'class9-formal-only': { structure: 'class9-formal-only', content: { formal: 'F' } },
};

describe('content-capability-typing — bounded surface (god-union / flag-sprawl guard)', () => {
  it('the WhyHelpEntry discriminant set is non-empty and bounded', () => {
    const variants = discriminantLiterals(WHY_HELP_SRC, 'WhyHelpEntry', 'structure');
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.length).toBeLessThanOrEqual(MAX_DISCRIMINANT_VARIANTS);
  });

  it('boolean capability flags on DecisionContent stay bounded (prefer a discriminant over sprawl)', () => {
    expect(booleanFieldCount(OPTIONS_SRC, 'DecisionContent')).toBeLessThanOrEqual(MAX_BOOLEAN_CAPABILITY_FLAGS);
  });
});

describe('content-capability-typing — discriminant exhaustiveness (no silent fall-through)', () => {
  it('every declared WhyHelpEntry structure has a handled construction', () => {
    const declared = discriminantLiterals(WHY_HELP_SRC, 'WhyHelpEntry', 'structure');
    expect(declared.slice().sort()).toEqual(Object.keys(HANDLED).sort());
  });

  it('resolveWhyHelpContent handles every declared structure without throwing', () => {
    for (const structure of discriminantLiterals(WHY_HELP_SRC, 'WhyHelpEntry', 'structure')) {
      const entry = HANDLED[structure];
      const out = resolveWhyHelpContent(entry, 'casual', 'founder');
      expect(out === null || typeof out === 'string').toBe(true);
    }
  });
});

describe('content-capability-typing — consumers narrow-check before reading a sub-field', () => {
  it('returns the supported register sub-field per variant', () => {
    expect(resolveWhyHelpContent(HANDLED['universal-triplet'], 'formal')).toBe('F');
    expect(resolveWhyHelpContent(HANDLED['universal-triplet'], 'beginner')).toBe('B');
    expect(resolveWhyHelpContent(HANDLED['class7-vibe-coder'], 'casual')).toBe('C');
    expect(resolveWhyHelpContent(HANDLED['class9-formal-only'], 'formal')).toBe('F');
    expect(resolveWhyHelpContent(HANDLED['class8-role-cluster'], 'casual', 'founder')).toBe('FC');
  });

  it('skips (returns null) when the variant does not carry the requested capability', () => {
    // class7 has no formal register; class9 has no casual; class8 needs a matching role.
    expect(resolveWhyHelpContent(HANDLED['class7-vibe-coder'], 'formal' as WhyHelpRegister)).toBeNull();
    expect(resolveWhyHelpContent(HANDLED['class9-formal-only'], 'casual')).toBeNull();
    expect(resolveWhyHelpContent(HANDLED['class8-role-cluster'], 'casual', 'pm')).toBeNull();
  });
});
