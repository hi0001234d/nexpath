import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as ts from 'typescript';
import type { DecisionContent } from './options.js';

/**
 * Build-time check (lint-as-test) for the content-type forward-compat discipline:
 * every field on an in-source content interface that is NOT part of the fixed
 * required baseline MUST be optional (`?:`). This fails the suite the moment a
 * new NON-optional field is added to a content interface, so additive fields stay
 * forward-compatible (old code keeps compiling and narrow-checks the default).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const OPTIONS_SRC = readFileSync(join(HERE, 'options.ts'), 'utf8');

/**
 * Names of interface members that are NEITHER in `requiredBaseline` NOR optional.
 * Empty array ⇒ the optional-field discipline holds for that interface.
 */
function nonOptionalNewFields(
  sourceText: string,
  interfaceName: string,
  requiredBaseline: readonly string[],
): string[] {
  const sf = ts.createSourceFile(`${interfaceName}.ts`, sourceText, ts.ScriptTarget.Latest, true);
  const required = new Set(requiredBaseline);
  const violations: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = true;
      for (const m of node.members) {
        if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name)) {
          const optional = m.questionToken !== undefined;
          if (!required.has(m.name.text) && !optional) violations.push(m.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error(`interface ${interfaceName} not found in source`);
  return violations;
}

describe('content-type optionality discipline (build-time check)', () => {
  it('DecisionContent: every field beyond the required baseline is optional', () => {
    const required = ['signalType', 'question', 'pinchFallback', 'L1', 'L2', 'L3'];
    expect(nonOptionalNewFields(OPTIONS_SRC, 'DecisionContent', required)).toEqual([]);
  });

  it('OptionEntry: no non-optional field beyond {option, descBase}', () => {
    expect(nonOptionalNewFields(OPTIONS_SRC, 'OptionEntry', ['option', 'descBase'])).toEqual([]);
  });

  it('flags a NEW non-optional field added to a content interface (the lint fires)', () => {
    const synthetic = `
      export interface DecisionContent {
        signalType: string;
        question: string;
        newOptional?: boolean;   // ok — additive-optional
        newRequired: number;     // VIOLATION — non-optional new field
      }
    `;
    const required = ['signalType', 'question', 'pinchFallback', 'L1', 'L2', 'L3'];
    expect(nonOptionalNewFields(synthetic, 'DecisionContent', required)).toEqual(['newRequired']);
  });

  it('throws if the interface is missing (guards against silent no-op)', () => {
    expect(() => nonOptionalNewFields('export interface Other {}', 'DecisionContent', [])).toThrow(/not found/);
  });
});

describe('content-type forward-compat (defaults applied via narrow-check)', () => {
  it('a DecisionContent with only the required fields type-checks and the documented defaults apply', () => {
    // If any optional field were actually required, this object would not compile —
    // so the construction itself proves the fields are additive-optional.
    const c: DecisionContent = {
      signalType: 'X',
      question: 'q',
      pinchFallback: 'p',
      L1: [],
      L2: [],
      L3: [],
    };
    expect(c.whyHelp).toBeUndefined();
    expect(c.descBaseEnabled ?? true).toBe(true);        // default: desc-bases active
    expect(c.l2SafeguardRequired ?? false).toBe(false);  // default: not in L2 scope
    expect(c.lengthBudget ?? 'MEDIUM').toBe('MEDIUM');    // default tier
  });
});
