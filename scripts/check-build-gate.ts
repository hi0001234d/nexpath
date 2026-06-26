/**
 * Pre-build content-template gate (§4.E2 / §6.1 live-activation item 8).
 *
 * Runs the HARD build gate (`runBuildGate`: schema validation + the mandatory
 * level-1 floor) over the whole shipped registry BEFORE `tsc`, so a raw
 * `npm run build` — not just `vitest run` — hard-fails on a missing-floor or
 * schema-invalid record. Wired as the `prebuild` npm script; executed via `tsx`
 * so it reads the TypeScript source directly (no compiled dist needed first).
 *
 * Exit code 1 on any gate failure aborts the build before compilation; 0 lets
 * the build proceed.
 */

import { runBuildGate, SHIPPED_CONTENT_TEMPLATES } from '../src/decision-session/content-template-tooling.js';

const res = runBuildGate(SHIPPED_CONTENT_TEMPLATES);

if (!res.ok) {
  console.error(`✗ content-template build gate FAILED (${SHIPPED_CONTENT_TEMPLATES.length} records checked)`);
  if (!res.schema.ok) {
    for (const [signalType, errors] of Object.entries(res.schema.errorsBySignalType)) {
      console.error(`  schema — ${signalType}: ${errors.join('; ')}`);
    }
  }
  if (!res.floor.ok) {
    console.error(`  missing level-1 floor: ${res.floor.missingFloor.join(', ')}`);
  }
  console.error('Build aborted: fix the records above before building.');
  process.exit(1);
}

console.log(`✓ content-template build gate passed (${SHIPPED_CONTENT_TEMPLATES.length} records, all floored + schema-valid)`);
