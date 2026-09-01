/**
 * H8 item 6 — cross-milestone traceability, made MECHANICALLY CHECKABLE.
 *
 * The audit found the plan's "nothing dropped" claim resting on memory: four rows
 * carried no source tag, so nothing could verify them. This turns each into a
 * check that fails when the property stops holding.
 *
 * **The distinction the plan insists on is preserved here:** these were
 * TRACEABILITY findings, not proven implementation gaps. Two are now tagged and
 * verified in source; two are recorded below as deliberately untaggable, with the
 * reason — flattening all four into "4 things missing" would be wrong.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
/** Strip comments — a claim in prose must never satisfy a check about code. */
const codeOnly = (src: string) =>
  src.split('\n').filter((l) => {
    const t = l.trimStart();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  }).join('\n');

describe('PEH-5 — the PE fallback is not the Decision-Session path', () => {
  const src = read('pe-store-reader.ts');

  it('is tagged in the implementing file', () => {
    expect(src).toContain('PEH-5');
  });

  it('⭐ never reads pending_advisories IN CODE', () => {
    // The recorded evidence was "grep-verified never to touch pending_advisories"
    // - but a naive grep returns 2 hits here, both COMMENTS asserting the
    // opposite. Stripping comments is what makes this check mean anything.
    expect(codeOnly(src)).not.toMatch(/pending_advisories/);
  });

  it('does query its own table', () => {
    // Guards against the check above passing because the file stopped querying
    // anything at all.
    expect(codeOnly(src)).toMatch(/pending_prompt_enhancements/);
  });
});

describe('PEH-DEP-04 — a stale result never replaces a newer body', () => {
  const src = read('pe-action-loop.ts');

  it('is tagged in the implementing file', () => {
    // Recorded as "unconfirmed, needs verification" in the audit.
    expect(src).toContain('PEH-DEP-04');
  });

  it('the ignore path exists in code, not just in prose', () => {
    expect(codeOnly(src)).toMatch(/stale_or_superseded_response_ignored/);
  });
});

describe('the two rows that are deliberately NOT taggable', () => {
  it('PEH-8 is satisfied by the suite, not by a line', () => {
    // "extension tests" is not a property of any single file; tagging one would
    // be arbitrary and would imply the rest are out of scope. So the check is
    // that the PE suite EXISTS and is substantial - enumerated from disk rather
    // than from a hardcoded list, because an earlier version guessed a filename
    // (`pe-html.test.ts`) that does not exist and failed for the wrong reason.
    const suites = readdirSync(__dirname).filter((f) => /^pe-.*\.test\.ts$/.test(f));
    expect(suites.length).toBeGreaterThanOrEqual(8);
    // The traceability suite itself must not be what satisfies PEH-8.
    expect(suites.filter((f) => f !== 'pe-traceability.test.ts').length).toBeGreaterThanOrEqual(7);
  });

  it('PEH-DEP-05 is a document by design — a source tag would be wrong', () => {
    // The acceptance evidence packet is a deliverable, not code. Asserting a
    // source tag for it would create a false trace. Recorded, not tagged.
    expect(true).toBe(true);
  });
});
