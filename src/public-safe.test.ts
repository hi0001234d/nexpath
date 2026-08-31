import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// L12/D-20: "no free plan/pro plan wording scattered through the open-source
// code — plan/branding awareness lives on the website/server only." Mirrors
// readme.test.ts's shape (a fixed content set, checked for forbidden terms).
//
// ⚠️ Scope is deliberately the files this milestone's client seam actually
// owns, not a sweep of the whole repository. A repo-wide sweep found real hits
// in files this guard has no authority over: `auto.ts` is on §0's frozen list
// and already carries pre-existing, unrelated developer-name comments from
// before this milestone, predating anything this guard is meant to catch.
// Flagging frozen content this guard cannot fix would make it permanently red
// for a reason unrelated to what it exists to prevent. If a future unit adds
// another file under the client seam's own ownership, add it to this list.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const OWNED_FILES = [
  'src/config/NexpathTokenStore.ts',
  'src/config/ApiKeyResolver.ts',
  'src/cli/commands/token.ts',
];

const sourceFiles = OWNED_FILES.map((relative) => join(ROOT, relative));

// Plan/pricing/branding terms that belong to the private planning artefacts
// and must never appear in this public repo's source — the client seam's own
// vocabulary (plan/pricing wording, internal decision/risk/unit IDs, and the
// private repos' names). Terms are matched as substrings deliberately, but
// each was checked against the real tree first so a term does not fire on an
// unrelated word that merely contains it (e.g. NOT "nexpath-pro", which is a
// substring of the legitimate "nexpath-prompt-store" MCP server name).
const FORBIDDEN_TERMS = [
  'free plan',
  'pro plan',
  'freeproplan',
  'emptyops/nexpath-pro',
  'nexpath-prompt-enhancement-submodule',
  '30% margin',
  'dep-fp-',
  'risk-1',
  'risk-2',
  'risk-3',
  'risk-4',
  'risk-5',
  'risk-6',
  'risk-7',
  'risk-8',
  'risk-9',
  'fp-0.',
  'fp-1.',
  'fp-2.',
  'fp-3.',
  'fp-4.',
  'fp-5.',
  'fp-6.',
  'fp-7.',
  'fp-8.',
  'hiren',
  'bhavnesh',
  'vedansi',
];

describe('client seam — public-safe content guard (FP-4.4)', () => {
  it('does not leak plan, pricing, internal-decision, or team-name terminology', () => {
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8').toLowerCase();
      for (const term of FORBIDDEN_TERMS) {
        expect(text, `${file} contains forbidden term "${term}"`).not.toContain(term);
      }
    }
  });

  it('the guard actually fires: a planted "Pro plan" string is caught', () => {
    const planted = 'export const upsell = "Upgrade to the Pro plan for more credit";';
    const lower = planted.toLowerCase();
    expect(FORBIDDEN_TERMS.some((term) => lower.includes(term))).toBe(true);
  });

  it('the guard actually fires: a planted internal risk ID is caught', () => {
    const planted = '// mitigates RISK-7, the free-credit farming concern';
    const lower = planted.toLowerCase();
    expect(FORBIDDEN_TERMS.some((term) => lower.includes(term))).toBe(true);
  });

  it('the guard actually fires: a planted team name is caught', () => {
    const planted = "// per Hiren's instruction, this stays a no-op";
    const lower = planted.toLowerCase();
    expect(FORBIDDEN_TERMS.some((term) => lower.includes(term))).toBe(true);
  });

  it('does not fire on a lookalike substring that is not the forbidden term', () => {
    // "nexpath-prompt-store" contains "nexpath-pro" as a raw substring; the
    // precise term below must not match it, which is why the exact
    // "emptyops/nexpath-pro" form is what is actually forbidden above.
    const lookalike = "const MCP_SERVER_NAME = 'nexpath-prompt-store';".toLowerCase();
    expect(FORBIDDEN_TERMS.some((term) => lookalike.includes(term))).toBe(false);
  });

  it('every file this guard claims to own actually exists and was scanned', () => {
    expect(sourceFiles.length).toBe(OWNED_FILES.length);
    for (const file of sourceFiles) {
      expect(() => readFileSync(file, 'utf8')).not.toThrow();
    }
  });
});
