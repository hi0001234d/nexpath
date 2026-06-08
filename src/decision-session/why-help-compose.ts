// Why-help block composition — assembles the multi-line content shown
// inside the popup header per dev-plan §11.2 ("why-help block
// decomposition"):
//
//   line 1     : R4 user-facing open bookend     ("You're seeing this because")
//   line 2..n  : R6 why-help content (per signal class × register)
//   line n+1?  : optional R6-Sub2 mood-conditional sentence (frustrated / rushed only)
//   line last  : R4 user-facing close bookend    (per-register variant)
//
// Each line emits as a SEPARATE LineKind element when render-loop splits
// the composed string on `\n` — honouring the §11.11 separate-element
// invariant at the layout layer.
//
// Failure-mode resilience (§11.2 Gap A fix): if the WhyHelpEntry is
// undefined/null OR the resolved content for the given register/role
// is missing, returns `null` so the caller skips the entire why-help
// region (popup degrades to the pre-4.8.5.1 header-pair-+-options
// layout — no fatal error).
//
// Class-8 routing: class8_role_cluster has per-role content
// (founder_casual / indie_hacker_casual / pm_formal). The caller passes
// the user's role; if no matching entry exists for that role, returns
// null (caller skips the why-help region).

import { R4_USER_OPEN, R4_USER_CLOSE } from './r4-bookends.js';
import { getMoodSentence } from './why-help-mood.js';
import type { WhyHelpEntry } from './why-help.js';
import type { UserMood, UserRole } from '../classifier/types.js';

/** Register set used for the user-facing why-help block. */
export type WhyHelpRegister = 'formal' | 'casual' | 'beginner';

/**
 * Compose the user-facing why-help block from a WhyHelpEntry + the
 * user's resolved register / mood / role. Returns a multi-line string
 * (lines joined by `\n`) ready to pass to render-loop as the
 * `whyHelpBlock` field, OR `null` when no content can be resolved
 * (caller should skip the why-help region per §11.2 graceful-fail).
 */
export function composeWhyHelpBlock(
  entry:    WhyHelpEntry | undefined | null,
  register: WhyHelpRegister,
  mood:     UserMood | undefined,
  role?:    UserRole | null,
): string | null {
  if (!entry) return null;

  const content = resolveWhyHelpContent(entry, register, role);
  if (!content) return null;

  const moodSentence = getMoodSentence(mood, register);
  const close        = R4_USER_CLOSE[register];

  const lines: string[] = [R4_USER_OPEN, content];
  if (moodSentence) lines.push(moodSentence);
  lines.push(close);

  return lines.join('\n');
}

/**
 * Pull the register-appropriate content string out of the discriminated-
 * union WhyHelpEntry. Returns `null` when the requested register isn't
 * present in the entry (class7 / class8 / class9 missing-register
 * cases).
 *
 * Exported for unit testability.
 */
export function resolveWhyHelpContent(
  entry:    WhyHelpEntry,
  register: WhyHelpRegister,
  role?:    UserRole | null,
): string | null {
  switch (entry.structure) {
    case 'universal-triplet':
      return entry.content[register];

    case 'class7-vibe-coder':
      if (register === 'casual')   return entry.content.casual;
      if (register === 'beginner') return entry.content.beginner;
      return null;  // no formal variant for class 7

    case 'class8-role-cluster': {
      // Routing per dev-plan §9.4.3 W4-W6 handlers — match role × register.
      if (role === 'founder'      && entry.content.founder_casual     !== undefined) return entry.content.founder_casual;
      if (role === 'indie_hacker' && entry.content.indie_hacker_casual !== undefined) return entry.content.indie_hacker_casual;
      if (role === 'pm'           && entry.content.pm_formal          !== undefined) return entry.content.pm_formal;
      return null;
    }

    case 'class9-formal-only':
      if (register === 'formal') return entry.content.formal;
      return null;
  }
}
