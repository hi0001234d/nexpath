import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The per-set DecisionContent now lives in the per-class content-template files.
const CONTENT_DIR = join(__dirname, 'content-templates');
function readContentSources(): string {
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(CONTENT_DIR, f), 'utf-8'))
    .join('\n');
}

// Verifies the deferred L2 safeguard pass scope: the per-set marker
// `l2SafeguardRequired: true` must be present on exactly the 32 sets
// flagged for L2 examination per dev-plan §9.2:
//
//   - 21 Class 4 sets (every set in Release / Observability / Infra)
//   -  1 Class 7 set (DEPENDENCY_ADVENTURE_CASUAL)
//   -  4 Class 8 sets (LAUNCH_STRATEGY / BUILD_IN_PUBLIC / STAKEHOLDER_
//                      ALIGNMENT / CROSS_TEAM_IMPACT)
//   -  6 Class 9 sets (OVER_ENGINEERING_CHECK / OBSERVABILITY_FIRST /
//                      FAILURE_MODE_ANALYSIS / SECURITY_THREAT_MODELING /
//                      DATABASE_MIGRATION_SAFETY / DEPLOYMENT_STRATEGY_
//                      ABSENCE)

const readOptionsSources = readContentSources;

const REQUIRED = [
  // Class 4 — 21 sets
  'ABSENCE_OBSERVABILITY', 'ABSENCE_OBSERVABILITY_CASUAL', 'ABSENCE_OBSERVABILITY_BEGINNER',
  'ABSENCE_ROLLBACK_PLANNING', 'ABSENCE_ROLLBACK_PLANNING_CASUAL', 'ABSENCE_ROLLBACK_PLANNING_BEGINNER',
  'ABSENCE_DEPLOYMENT_PLANNING', 'ABSENCE_DEPLOYMENT_PLANNING_CASUAL', 'ABSENCE_DEPLOYMENT_PLANNING_BEGINNER',
  'ABSENCE_DEPENDENCY_MGMT', 'ABSENCE_DEPENDENCY_MGMT_CASUAL', 'ABSENCE_DEPENDENCY_MGMT_BEGINNER',
  'ABSENCE_ENV_AND_SECRETS', 'ABSENCE_ENV_AND_SECRETS_CASUAL', 'ABSENCE_ENV_AND_SECRETS_BEGINNER',
  'ABSENCE_CI_PIPELINE', 'ABSENCE_CI_PIPELINE_CASUAL', 'ABSENCE_CI_PIPELINE_BEGINNER',
  'ABSENCE_RATE_LIMITING', 'ABSENCE_RATE_LIMITING_CASUAL', 'ABSENCE_RATE_LIMITING_BEGINNER',
  // Class 7 — 1 set
  'ABSENCE_DEPENDENCY_ADVENTURE_CASUAL',
  // Class 8 — 4 sets
  'ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL', 'ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL',
  'ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL', 'ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL',
  // Class 9 — 6 sets
  'ABSENCE_OVER_ENGINEERING_CHECK_FORMAL', 'ABSENCE_OBSERVABILITY_FIRST_FORMAL',
  'ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL', 'ABSENCE_SECURITY_THREAT_MODELING_FORMAL',
  'ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL', 'ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL',
];

describe('L2 safeguard marker — flagged-set inventory', () => {
  it('REQUIRED list contains exactly 32 names (sanity)', () => {
    expect(REQUIRED).toHaveLength(32);
  });

  it('every flagged set in the source carries l2SafeguardRequired: true', () => {
    const src = readOptionsSources();
    const missing: string[] = [];
    for (const name of REQUIRED) {
      // Find the set's DecisionContent block, then check if it contains
      // l2SafeguardRequired: true within its body.
      const blockRe = new RegExp(
        `(?:export\\s+)?const\\s+${name}:\\s*DecisionContent\\s*=\\s*\\{[\\s\\S]*?\\n\\};`,
      );
      const m = src.match(blockRe);
      if (!m) {
        missing.push(`${name} (set not found)`);
        continue;
      }
      if (!/l2SafeguardRequired:\s*true/.test(m[0])) {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('source contains exactly 32 occurrences of l2SafeguardRequired: true across the content-template files', () => {
    const src = readOptionsSources();
    const count = (src.match(/l2SafeguardRequired:\s*true/g) ?? []).length;
    expect(count).toBe(32);
  });
});
