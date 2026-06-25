import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TASK_REVIEW, IDEA_TO_PRD } from './options.js';
import { TASK_REVIEW as TASK_REVIEW_VIA_CLASS } from './content-templates/class1-stage-transition.js';

// Layer-G content split invariants: every signalType lands in exactly one
// per-class file (partition completeness), the god-files no longer hold any
// content, and each class file holds only its own class's signalTypes.

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, 'content-templates');

// filename → class key (class1-stage-transition.ts → class1_stage_transition)
function classOfFile(file: string): string {
  return file.replace(/\.ts$/, '').replace(/-/g, '_');
}
// the canonical 9 classes + their expected distinct-signalType counts (the plan)
const EXPECTED: Record<string, number> = {
  class1_stage_transition: 7,
  class2_verification_quality: 21,
  class3_spec_architecture: 11,
  class4_release_observability_infra: 8,
  class5_session_quality: 8,
  class6_planning_idea_task: 14,
  class7_cool_geek_vibe_coder: 20,
  class8_role_cluster: 35,
  class9_academic_hardcore_pro: 12,
};

// signalType → class, from the why-help map (the partition's source of truth)
function signalTypeToClass(): Record<string, string> {
  const src = readFileSync(join(HERE, 'why-help-by-signal-type.ts'), 'utf-8');
  const map: Record<string, string> = {};
  const re = /(\w+):\s*WHY_HELP_PER_CLASS\.(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) map[m[1]] = m[2];
  return map;
}

// Every DecisionContent const in a file → { name, signalType }
function constsIn(src: string): { name: string; signalType: string }[] {
  const re = /(?:export\s+)?const\s+(\w+):\s*DecisionContent\s*=\s*\{\s*\n\s*signalType:\s*"([^"]+)"/g;
  const out: { name: string; signalType: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ name: m[1], signalType: m[2] });
  return out;
}

// The 9 DecisionContent per-class split files only — exclude the §4.E2
// content-template *record* companions (`classN-records.ts`) and any test files.
const classFiles = readdirSync(CONTENT_DIR).filter(
  (f) => /^class\d+-/.test(f) && f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.includes('-records'),
);
const perFile = classFiles.map((f) => ({ file: f, cls: classOfFile(f), consts: constsIn(readFileSync(join(CONTENT_DIR, f), 'utf-8')) }));
const allConsts = perFile.flatMap((p) => p.consts);

describe('Layer-G split — partition completeness', () => {
  it('there are exactly 9 per-class content files', () => {
    expect(classFiles.length).toBe(9);
    expect(Object.keys(EXPECTED).sort()).toEqual(perFile.map((p) => p.cls).sort());
  });

  it('all 240 consts / 136 distinct signalTypes are present', () => {
    expect(allConsts.length).toBe(240);
    expect(new Set(allConsts.map((c) => c.signalType)).size).toBe(136);
  });

  it('each class file holds exactly the expected number of distinct signalTypes', () => {
    for (const p of perFile) {
      const sigs = new Set(p.consts.map((c) => c.signalType));
      expect(sigs.size, `${p.file}`).toBe(EXPECTED[p.cls]);
    }
  });

  it('every signalType lands in exactly one class file (no split across files)', () => {
    const sigToFiles: Record<string, Set<string>> = {};
    for (const p of perFile) for (const c of p.consts) (sigToFiles[c.signalType] ??= new Set()).add(p.file);
    const split = Object.entries(sigToFiles).filter(([, files]) => files.size > 1);
    expect(split).toEqual([]);
  });

  it("each const sits in the file matching its signalType's class (per the why-help map)", () => {
    const map = signalTypeToClass();
    const misplaced: string[] = [];
    for (const p of perFile) for (const c of p.consts) {
      if (map[c.signalType] !== p.cls) misplaced.push(`${c.name} (${c.signalType}) in ${p.cls}, expected ${map[c.signalType]}`);
    }
    expect(misplaced).toEqual([]);
  });
});

describe('Layer-G split — import-graph (god-files emptied)', () => {
  it('options.ts + options-beginner.ts contain NO DecisionContent const definitions', () => {
    for (const f of ['options.ts', 'options-beginner.ts']) {
      const src = readFileSync(join(HERE, f), 'utf-8');
      expect(constsIn(src).length, `${f} still defines content`).toBe(0);
      expect(/\bconst\s+\w+:\s*DecisionContent\s*=/.test(src), `${f} still defines content`).toBe(false);
    }
  });

  it('the relocated content is re-exported so importers keep resolving (e.g. TASK_REVIEW)', () => {
    const src = readFileSync(join(HERE, 'options.ts'), 'utf-8');
    expect(src).toMatch(/export \* from '\.\/content-templates\//);
  });

  it('relocated consts resolve at runtime via the options.ts re-export and are the same object', () => {
    expect(TASK_REVIEW.signalType).toBe('TASK_REVIEW');
    expect(IDEA_TO_PRD.signalType).toBe('IDEA_TO_PRD');
    expect(TASK_REVIEW).toBe(TASK_REVIEW_VIA_CLASS); // re-export, not a copy
  });
});
