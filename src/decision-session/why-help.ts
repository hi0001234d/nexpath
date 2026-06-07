// Type definitions for the popup why-help content layer.
//
// Why-help blocks are short explanations rendered above the option list inside
// the decision-session popup. They are register-aware (formal / casual /
// beginner) and live per signal class — every option set in the same class
// shares the same why-help content.
//
// The 9 signal classes split into two register-structure groups:
//
//   Classes 1-6 (universal triplet) — every block defines all 3 registers.
//   Classes 7-9 (non-standard)      — block shape differs by class:
//                                       Class 7 (vibe-coder)  → casual + beginner only
//                                       Class 8 (role cluster) → role-keyed casual/formal subset
//                                       Class 9 (formal only)  → formal only

/** Universal triplet — all 3 registers required. Used by signal classes 1-6. */
export type UniversalWhyHelpVariants = {
  formal:   string;
  casual:   string;
  beginner: string;
};

/** Non-standard subset — any subset of the 3 registers. */
export type NonStandardWhyHelpVariants = Partial<UniversalWhyHelpVariants>;

/** Class-aware storage entry — discriminated union by class register-structure. */
export type WhyHelpEntry =
  | { structure: 'universal-triplet';   content: UniversalWhyHelpVariants }
  | { structure: 'class7-vibe-coder';   content: { casual: string; beginner: string } }
  | {
      structure: 'class8-role-cluster';
      content: {
        founder_casual?:     string;
        indie_hacker_casual?: string;
        pm_formal?:          string;
      };
    }
  | { structure: 'class9-formal-only';  content: { formal: string } };

/**
 * Back-compat alias — preserves the original type name for consumers that
 * reference WhyHelpVariants directly. Aliases to UniversalWhyHelpVariants
 * since that is the common shape (classes 1-6). For classes 7-9, consumers
 * should use WhyHelpEntry directly.
 */
export type WhyHelpVariants = UniversalWhyHelpVariants;
