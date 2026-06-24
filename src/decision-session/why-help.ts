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

/**
 * Class-aware storage entry — a discriminated union by `structure` (the
 * register-shape capability tag). This is the capability-based content-typing
 * pattern: a consumer narrow-checks `structure` before reading a register
 * sub-field (see `composeWhyHelpBlock`), so a variant is never asked for a
 * register it does not carry. Keep this union BOUNDED — prefer one discriminant
 * tag over many ad-hoc capability booleans; do not let it grow into a god-union.
 * Enforced by content-capability-typing.test.ts.
 */
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

// ──────────────────────────────────────────────────────────────────────────
// Content — 24 base why-help blocks across the 9 signal classes.
// ──────────────────────────────────────────────────────────────────────────

/** Signal-class keys for the why-help content table — verbatim per the locked spec. */
export type SignalClass =
  | 'class1_stage_transition'
  | 'class2_verification_quality'
  | 'class3_spec_architecture'
  | 'class4_release_observability_infra'
  | 'class5_session_quality'
  | 'class6_planning_idea_task'
  | 'class7_cool_geek_vibe_coder'
  | 'class8_role_cluster'
  | 'class9_academic_hardcore_pro';

/**
 * Why-help content table keyed by signal class. Each entry's `structure`
 * tag selects the register shape:
 *
 *   classes 1-6 → universal-triplet  (formal / casual / beginner)
 *   class 7     → class7-vibe-coder  (casual / beginner)
 *   class 8     → class8-role-cluster (founder_casual / indie_hacker_casual / pm_formal)
 *   class 9     → class9-formal-only (formal)
 *
 * 24 base blocks total (6×3 + 2 + 3 + 1).
 */
export const WHY_HELP_PER_CLASS: Record<SignalClass, WhyHelpEntry> = {
  class1_stage_transition: {
    structure: 'universal-triplet',
    content: {
      formal:   "Recent prompts indicate a transition from one development stage to the next. Confirmation that the prior stage's outputs are complete and stable hasn't surfaced. Teams typically anchor that confirmation before moving forward — to avoid carrying unfinished work into the next stage.",
      casual:   "Your recent prompts show a shift to a new stage of the work. The prior stage's loose ends haven't been pulled together yet. Worth checking those before moving on.",
      beginner: "Recent prompts show you've moved to a new stage. The previous stage's pieces haven't been wrapped up. Let's check those first.",
    },
  },
  class2_verification_quality: {
    structure: 'universal-triplet',
    content: {
      formal:   "Recent prompts have focused on implementation without surfacing verification — tests, review, or code-quality checks haven't anchored the current flow. Verification practices typically run alongside or shortly after implementation. This is where teams pause to confirm what's been built holds up.",
      casual:   "Your work has been moving fast on implementation but verification hasn't come up in recent prompts. Tests or review checks haven't been part of the flow. Good moment to pause and check what's been built.",
      beginner: "Recent prompts show building but no checking. Tests and reviews haven't shown up. Let's verify what's been built before moving on.",
    },
  },
  class3_spec_architecture: {
    structure: 'universal-triplet',
    content: {
      formal:   "Recent prompts have moved into implementation without anchoring the spec or architecture decisions behind it. Design intent, component boundaries, or data contracts haven't surfaced. Teams typically lock those before implementation to avoid downstream churn.",
      casual:   "Your work is in implementation mode but the spec or architecture behind it hasn't come up recently. Design decisions and component shapes haven't been part of the conversation. Worth pulling those back in.",
      beginner: "Recent prompts jump into building without a plan first. The design hasn't been discussed lately. Let's pin down the plan before more building.",
    },
  },
  class4_release_observability_infra: {
    structure: 'universal-triplet',
    content: {
      formal:   "Recent prompts have moved toward release without surfacing observability, rollback planning, or monitoring readiness. Release-stage rigor hasn't been part of the recent flow. Teams typically lock these before any production-facing change.",
      casual:   "Your work is heading toward release but monitoring, rollback plans, or observability haven't come up. Release-readiness pieces haven't been part of recent prompts. Worth pulling those in before deploying.",
      beginner: "Recent prompts are about releasing but the monitoring and rollback pieces haven't come up. Let's set those up first.",
    },
  },
  class5_session_quality: {
    structure: 'universal-triplet',
    content: {
      formal:   "Recent prompts have referenced earlier work without restating the constraints or assumptions behind it. Quality-checkpoint moments — re-anchoring decisions, pausing the rhythm — haven't surfaced in the visible window. This is where teams typically take a breath to reconstruct the assumption set before continuing.",
      casual:   "Your work has been touching pieces of earlier decisions without bringing them back into the conversation. Pause-and-check moments haven't come up. Good moment to slow down and re-anchor.",
      beginner: "Recent prompts mention earlier work but don't pull it back into view. Quick pauses haven't happened. Let's pause and check in.",
    },
  },
  class6_planning_idea_task: {
    structure: 'universal-triplet',
    content: {
      formal:   "Recent prompts have moved into work without anchoring scope, task ordering, or definition-of-done. Planning structure hasn't surfaced in the current flow. Teams typically lock these before deeper implementation to prevent scope drift.",
      casual:   "Your work has been moving without a clear scope or task list anchoring it. Planning pieces — what's in scope, what order, when it's done — haven't come up recently. Worth pulling those back in.",
      beginner: "Recent prompts jump into work without a clear plan. Scope and task pieces haven't been discussed. Let's plan first.",
    },
  },
  class7_cool_geek_vibe_coder: {
    structure: 'class7-vibe-coder',
    content: {
      casual:   "Your work has been moving with vibe-coder energy — fast, exploratory — but completion checks, polish-vs-function balance, or MVP scope haven't anchored the flow. These are the discipline points vibe coding needs to stay productive. Worth a quick look at which gap fits the current work.",
      beginner: "Recent prompts have been fast and exploratory but completion or scope haven't been discussed. These are the pieces vibe coding needs to stay on track. Let's check which gap matches now.",
    },
  },
  class8_role_cluster: {
    structure: 'class8-role-cluster',
    content: {
      founder_casual:      "Your recent prompts have moved into the build without surfacing launch context, distribution thinking, or build-in-public signals. Founder-context practices — what to share, when, with whom — haven't been part of the flow. Worth pulling those in before deeper build work.",
      indie_hacker_casual: "Your work has been moving fast on the build but indie-hacker context — solo-launch readiness, lean-stack choices, scope tightness — hasn't come up. These are the patterns indie-hacker work typically needs to stay sustainable. Good moment to pull those in.",
      pm_formal:           "Recent prompts have advanced the work without surfacing PM-context practices — stakeholder alignment, cross-team impact, or requirement traceability. These haven't anchored the recent flow. Teams typically lock these before deeper implementation to avoid downstream alignment costs.",
    },
  },
  class9_academic_hardcore_pro: {
    structure: 'class9-formal-only',
    content: {
      formal: "Recent prompts have moved into implementation without anchoring high-rigor engineering practices — failure-mode analysis, security threat modeling, observability-first design, or over-engineering audits. These practices typically anchor production-grade work. Teams lock them before any release-facing change.",
    },
  },
};

/** All signal-class keys as a const array — useful for exhaustive iteration in tests / dispatch tables. */
export const ALL_SIGNAL_CLASSES: readonly SignalClass[] = [
  'class1_stage_transition',
  'class2_verification_quality',
  'class3_spec_architecture',
  'class4_release_observability_infra',
  'class5_session_quality',
  'class6_planning_idea_task',
  'class7_cool_geek_vibe_coder',
  'class8_role_cluster',
  'class9_academic_hardcore_pro',
] as const;
