/**
 * AbsenceSignalEngine — owns the corrective polarity: both absence-of-good
 * (a good pattern is missing) AND presence-of-bad (an anti-pattern is present)
 * signals that surface as ABSENCE_* advisories. (The name is historical — it
 * handles presence-of-bad too, not only absence.)
 *
 * It wraps the existing absence-detection path (detectAbsenceFlags); the Layer-B
 * registry simply routes corrective fires here. Adding a mistake category is a
 * new entry on that existing path, not a new engine.
 */

import type { Engine, EngineInput, ContentSpec } from './engine-registry.js';
import { detectAbsenceFlags } from '../classifier/AbsenceDetector.js';

export const absenceSignalEngine: Engine = {
  name: 'absence-signal',
  accepts: (polarity) => polarity === 'corrective',
  run: (input: EngineInput): ContentSpec => ({
    kind: 'absence',
    flags: detectAbsenceFlags(input.state, input.profile, input.projectType),
  }),
};
