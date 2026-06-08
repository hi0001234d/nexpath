// R5 D-fallback summary strings — fallback content used when the runtime
// dynamic injection path cannot produce a clean output and falls back to
// a pre-authored per-signal-class summary.
//
// 240 strings across 9 signal classes, keyed by signal_type with per-register
// variants. Some signal_types have all 3 registers, some have 1 or 2 per the
// source-code register coverage.

type Register = 'formal' | 'casual' | 'beginner';

/** Per-register subset — any subset of the 3 registers per signal_type's source coverage. */
export type RegisterPartial = Partial<Record<Register, string>>;

// ──────────────────────────────────────────────────────────────────────────
// Per-class fallback tables. Each table is keyed by the signal_type name
// (matching the ABSENCE_* constants in options.ts and options-beginner.ts).
// ──────────────────────────────────────────────────────────────────────────

const CLASS_1_FALLBACKS = {
  IDEA_TO_PRD: {
    formal:   "Earlier prompts touched on what to build, but the PRD hasn't been written yet.",
    beginner: "I've been talking about building this without writing the plan down first.",
  },
  PRD_TO_ARCHITECTURE: {
    formal:   "Previous prompts shifted to task-level work; architecture decisions aren't recorded yet.",
    beginner: "I've been talking about specific tasks without picking the architecture first.",
  },
  ARCHITECTURE_TO_TASKS: {
    formal:   "Coding has started without an explicit task breakdown.",
    beginner: "I've been jumping into code without listing the specific tasks first.",
  },
  TASK_REVIEW: {
    formal:   "Recent prompts have added tasks faster than review has caught up.",
    casual:   "I've been adding tasks without doing a review pass on them.",
    beginner: "I've been writing tasks without checking them over before moving on.",
  },
  IMPLEMENTATION_TO_REVIEW: {
    formal:   "Earlier prompts signaled implementation completion; the review pass hasn't followed.",
    beginner: "I've been finishing code without going back to review what I built.",
  },
  REVIEW_TO_RELEASE: {
    formal:   "Release-prep is underway while review sign-off hasn't been confirmed.",
    beginner: "I've been getting ready to release without confirming the review is done.",
  },
  RELEASE_TO_FEEDBACK: {
    formal:   "Previous prompts moved past release, but feedback-loop signals haven't surfaced.",
    beginner: "I've been working past the release without checking what users think.",
  },
};

const CLASS_2_BASE_FALLBACKS = {
  BEHAVIOUR_TESTING: {
    formal:   "Previous prompts moved into implementation; acceptance testing hasn't been triggered yet.",
    casual:   "I've been writing the feature without running it end-to-end against actual usage.",
    beginner: "I've been building the feature without trying it as if I were the user.",
  },
  ABSENCE_TEST_CREATION: {
    formal:   "Recent prompts have produced code without paired unit tests for it.",
    casual:   "I've been adding code without writing unit tests alongside it.",
    beginner: "I've been writing code without making small tests to check each piece.",
  },
  ABSENCE_REGRESSION_CHECK: {
    formal:   "Earlier prompts changed shared code paths, but a regression sweep hasn't been run.",
    casual:   "I've been touching shared code without checking what else might break.",
    beginner: "I've been making changes without going back to test the parts I didn't touch.",
  },
  ABSENCE_SECURITY_CHECK: {
    formal:   "Security-sensitive paths have been edited without an explicit security review.",
    casual:   "I've been editing security-sensitive code without doing a security review.",
    beginner: "I've been changing sensitive code without checking it for security holes.",
  },
  ABSENCE_ERROR_HANDLING: {
    formal:   "Previous prompts focused on happy-path logic; error handling hasn't been addressed.",
    casual:   "I've been writing the main flow without thinking through what fails.",
    beginner: "I've been writing what works without thinking about what goes wrong.",
  },
  ABSENCE_PROBLEM_CORRECTION: {
    formal:   "Earlier prompts surfaced bugs that haven't been confirmed as fixed.",
    casual:   "I've been mentioning bugs without circling back to confirm any are fixed.",
    beginner: "I've been talking about problems without checking which ones are actually solved.",
  },
  ABSENCE_OUTPUT_VERIFICATION: {
    // Class 2 base has beginner-only for this signal_type (no formal/casual sets in source).
    beginner: "I've been moving on without checking that what I built actually works correctly.",
  },
};

const CLASS_2_ROUTED_FALLBACKS = {
  // ── N2 routed (17 sets) ────────────────────────────────────────────
  ABSENCE_ACCESSIBILITY: {
    formal:   "Previous prompts focused on UI implementation; accessibility considerations haven't surfaced.",
    casual:   "I've been building the UI without thinking about accessibility along the way.",
    beginner: "I've been making the UI without checking it works for users with different needs.",
  },
  ABSENCE_DATA_VALIDATION: {
    formal:   "Earlier prompts wrote input-handling code; explicit validation hasn't been added.",
    casual:   "I've been handling input without writing explicit validation around it.",
    beginner: "I've been taking in data without checking it looks right first.",
  },
  ABSENCE_DOCUMENTATION: {
    formal:   "Code has been written without paired comments, docstrings, or README updates.",
    casual:   "I've been writing code without leaving comments or docs alongside it.",
    beginner: "I've been writing code without explaining what it does in comments or docs.",
  },
  ABSENCE_REFACTORING: {
    formal:   "Recent prompts have added code without revisiting earlier patterns for cleanup.",
    casual:   "I've been adding code without going back to clean up patterns that need it.",
    beginner: "I've been writing new code without tidying up older parts that got messy.",
  },
  ABSENCE_CORRECTION_SEEKING: {
    formal:   "Output has been accepted across recent prompts without explicit review questions.",
    casual:   "I've been accepting output without pushing back to ask for corrections.",
    beginner: "I've been taking what comes back without asking for corrections or other ideas.",
  },
  ABSENCE_REFACTORING_CHECKPOINT: {
    // N2 single-variant — casual only
    casual: "I've been moving forward without pausing for a refactor checkpoint on what I built.",
  },
  ABSENCE_DOCUMENTATION_BEFORE_ASK: {
    // N2 single-variant — beginner only
    beginner: "I've been asking without first looking at any docs that might already have the answer.",
  },

  // ── N3 routed (7 sets, all casual-only) ────────────────────────────
  ABSENCE_CODE_DOCUMENTATION_GAP: {
    casual: "I've been adding code without inline comments explaining the trickier parts.",
  },
  ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT: {
    casual: "I've been moving forward without naming the shortcuts I took along the way.",
  },
  ABSENCE_TEST_DEPTH_CHECK: {
    casual: "I've been adding tests without checking they actually cover the edge cases.",
  },
  ABSENCE_SECURITY_REVIEW_GAP: {
    casual: "I've been wrapping up changes without scheduling a security review pass.",
  },
  ABSENCE_ERROR_HANDLING_COVERAGE: {
    casual: "I've been adding error handling without checking it covers all the failure paths.",
  },
  ABSENCE_SELF_REVIEW_HABIT: {
    casual: "I've been pushing changes without giving them my own review pass first.",
  },
  ABSENCE_PERFORMANCE_AWARENESS: {
    casual: "I've been writing functionality without checking how it'll perform at scale.",
  },
};

const CLASS_3_FALLBACKS = {
  // ── Base (R3-Sub3 Phase A — 21 sets, 7 signal_types × 3 registers) ──
  ABSENCE_SPEC_ACCEPTANCE: {
    formal:   "The conversation has referenced the spec without pinning down acceptance criteria.",
    casual:   "I've been working from the spec without nailing down what \"done\" actually looks like.",
    beginner: "I've been building from the spec without writing what would mean it's finished.",
  },
  ABSENCE_CROSS_CONFIRMING: {
    formal:   "Across recent prompts, output has been accepted without a cross-confirmation step.",
    casual:   "I've been moving through changes without cross-checking against what I asked for.",
    beginner: "I've been accepting changes without checking they match what I originally asked.",
  },
  ABSENCE_SPEC_CROSS_CONFIRM: {
    formal:   "Implementation work has progressed without explicit cross-confirmation against the spec.",
    casual:   "I've been building without going back to compare what I built against the spec.",
    beginner: "I've been building parts without checking each one against the original spec.",
  },
  ABSENCE_SPEC_REVISION: {
    formal:   "The spec hasn't been revised yet, though implementation has drifted from it.",
    casual:   "I've been drifting from what the spec says without updating the spec to match.",
    beginner: "I've been doing things differently than the spec without updating the spec.",
  },
  ABSENCE_ARCH_CONFLICT: {
    formal:   "Recent prompts have touched on conflicting architectural directions without resolution.",
    casual:   "I've been moving forward with architectural choices that conflict without resolving them.",
    beginner: "I've been making design choices that don't fit together without picking which wins.",
  },
  ABSENCE_API_DESIGN_REVIEW: {
    formal:   "An API surface has been built without an explicit design-review pass.",
    casual:   "I've been shipping API changes without a design-review pass on them.",
    beginner: "I've been adding API endpoints without going back to review the design first.",
  },
  ABSENCE_PROMPT_CONTEXT: {
    formal:   "Change requests have come without architectural context being restated alongside them.",
    casual:   "I've been asking for changes without giving the architectural background first.",
    beginner: "I've been asking for changes without explaining the bigger picture first.",
  },

  // ── N2 routed (R3-Sub3-ext — ABSENCE_ALTERNATIVES triplet, 3 sets) ──
  ABSENCE_ALTERNATIVES: {
    formal:   "Alternative options haven't been weighed; commitment to one direction continued.",
    casual:   "I've been picking one approach without weighing other ways to do it.",
    beginner: "I've been going with one idea without thinking about other ways to do it.",
  },

  // ── N3 routed (R3-Sub3-ext — 3 sets, all casual-only) ──
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE: {
    casual: "I've been making architecture decisions without writing them down for later.",
  },
  ABSENCE_API_CONTRACT_DEFINITION: {
    casual: "I've been wiring up endpoints without writing down the full contract first.",
  },
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK: {
    casual: "I've been changing the public API without checking what breaks for existing callers.",
  },
};

const CLASS_4_FALLBACKS = {
  // ── Base (R3-Sub4 Phase A — 21 sets, 7 signal_types × 3 registers; all L2-flagged for desc-base deferred pass) ──
  ABSENCE_OBSERVABILITY: {
    formal:   "Build activity has progressed without observability instrumentation being added.",
    casual:   "I've been shipping changes without adding logging, metrics, or tracing.",
    beginner: "I've been building features without adding ways to see what's happening at runtime.",
  },
  ABSENCE_ROLLBACK_PLANNING: {
    formal:   "A rollback plan hasn't been written; deployment-bound changes continue regardless.",
    casual:   "I've been shipping changes without thinking through how to roll them back if needed.",
    beginner: "I've been making changes without planning how to undo them if things go wrong.",
  },
  ABSENCE_DEPLOYMENT_PLANNING: {
    formal:   "Deployment work has begun without explicit planning for sequence, gates, or fallback.",
    casual:   "I've been preparing to deploy without writing out the steps and what could fail.",
    beginner: "I've been getting ready to deploy without planning the steps to follow.",
  },
  ABSENCE_DEPENDENCY_MGMT: {
    formal:   "Recent prompts have introduced dependencies without explicit version-pinning discipline.",
    casual:   "I've been adding dependencies without pinning versions or auditing what they pull in.",
    beginner: "I've been adding libraries without checking their versions or what else they bring.",
  },
  ABSENCE_ENV_AND_SECRETS: {
    formal:   "The conversation has touched env-and-secret handling without an explicit secret-management plan.",
    casual:   "I've been handling secrets and env vars without a clear plan for keeping them safe.",
    beginner: "I've been working with secrets and env vars without a careful way to store them.",
  },
  ABSENCE_CI_PIPELINE: {
    formal:   "Code changes have accumulated without an automated CI pipeline validating them.",
    casual:   "I've been making changes without an automated pipeline checking them as I go.",
    beginner: "I've been writing code without automatic tools checking it after each change.",
  },
  ABSENCE_RATE_LIMITING: {
    formal:   "Across recent prompts, endpoints have been built without rate-limiting or throttling.",
    casual:   "I've been building endpoints without rate-limiting or throttling controls.",
    beginner: "I've been making endpoints without adding limits on how often they get called.",
  },

  // ── N3 routed (R3-Sub4-ext-NEW — 1 set, casual-only) ──
  ABSENCE_DEPENDENCY_AUDIT_GAP: {
    casual: "I've been adding dependencies without auditing what's already in the project.",
  },
};

const CLASS_5_FALLBACKS = {
  // ── Base (R3-Sub5 Phase A — 18 sets, 6 signal_types × 3 registers) ──

  // Anchor #1 — R5-Sub1.7 worked example (legacy colon-fragment pattern)
  WORK_RHYTHM_CHECK: {
    formal:   "Recent prompts: rapid prompting pattern observed.",
    casual:   "I've been sending prompts pretty fast.",
    beginner: "I've been sending prompts quickly without reading each one.",
  },
  DECISION_FATIGUE_PATTERN: {
    formal:   "Decision activity has shifted toward default acceptance without articulated rationale.",
    casual:   "I've been accepting defaults without really thinking through each choice.",
    beginner: "I've been picking whatever comes back without thinking about it much.",
  },
  FOCUS_DRIFT_DETECTION: {
    formal:   "The conversation has drifted from the originally-stated objective without realignment.",
    casual:   "I've been drifting from what I started out to do without coming back to it.",
    beginner: "I've been getting off-track without coming back to what I originally wanted.",
  },
  SESSION_LENGTH_CHECKPOINT: {
    formal:   "Session length has crossed working-window norms without a consolidation checkpoint.",
    casual:   "I've been working straight through without stepping back to see where I am.",
    beginner: "I've been working for a long time without stopping to check on my progress.",
  },
  PROGRESS_CONSOLIDATION_GAP: {
    formal:   "Progress markers haven't been consolidated; new work has continued layering on top.",
    casual:   "I've been moving forward without pausing to note where things stand.",
    beginner: "I've been making progress without writing down what I've already finished.",
  },

  // Anchor #2 — Stage 0 calibration sample (legacy colon-fragment pattern)
  CONTEXT_LOSS: {
    formal:   "Recent prompts: earlier work referenced without restated constraints or assumptions.",
    casual:   "I've been touching pieces of earlier decisions without bringing the reasons back in.",
    beginner: "I've been referencing earlier work without pulling it back into view.",
  },

  // ── N2 routed (R3-Sub5-ext — 6 sets, 2 signal_types × 3 registers) ──
  ABSENCE_COMPREHENSION: {
    formal:   "Output acceptance has continued without explicit comprehension checks against the build target.",
    casual:   "I've been accepting output without checking I actually understand what it does.",
    beginner: "I've been taking what comes back without making sure I get how it works.",
  },
  ABSENCE_NO_PUSHBACK: {
    formal:   "Critical pushback hasn't surfaced across recent decisions; output has been accepted as-given.",
    casual:   "I've been moving along without questioning choices that maybe should be questioned.",
    beginner: "I've been accepting changes without pushing back on the ones that seem off.",
  },
};

const CLASS_6_FALLBACKS = {
  ABSENCE_PHASE_TRANSITION: {
    formal:   "Workflow phases have blurred into each other without an explicit transition checkpoint.",
    casual:   "I've been blending phases together without stopping to mark the transitions.",
    beginner: "I've been moving between stages without clearly marking when each one ends.",
  },
  ABSENCE_IDEA_SCOPING: {
    formal:   "The conversation has explored the idea without bounding what's in scope versus out.",
    casual:   "I've been talking through the idea without setting clear scope boundaries.",
    beginner: "I've been thinking about the idea without deciding what's in and what's out.",
  },
  ABSENCE_IDEA_CONSTRAINT_CHECK: {
    formal:   "Real-world constraints haven't been checked against the idea direction so far.",
    casual:   "I've been developing the idea without checking what real-world constraints apply.",
    beginner: "I've been working on the idea without checking what limits I need to work within.",
  },
  ABSENCE_IDEA_USER_DEFINITION: {
    formal:   "Idea development has progressed without an explicit definition of the target user.",
    casual:   "I've been building out the idea without nailing down who it's actually for.",
    beginner: "I've been working on the idea without saying who it's actually for.",
  },
  ABSENCE_TASK_ORDERING: {
    formal:   "Task execution has continued without dependency ordering being established first.",
    casual:   "I've been picking up tasks without ordering them by what depends on what.",
    beginner: "I've been doing tasks without figuring out which ones need to come first.",
  },
  ABSENCE_TASK_SIZING: {
    formal:   "Task effort hasn't been sized; commitments have continued at unknown cost.",
    casual:   "I've been committing to tasks without sizing how much effort each one takes.",
    beginner: "I've been agreeing to tasks without thinking about how big each one really is.",
  },
  ABSENCE_TASK_DEFINITION_OF_DONE: {
    formal:   "Recent prompts have driven task work without explicit \"done\" criteria for each.",
    casual:   "I've been working through tasks without saying what \"done\" looks like for each one.",
    beginner: "I've been doing tasks without writing what would mean each one is finished.",
  },
  ABSENCE_USER_FEEDBACK_REVIEW: {
    formal:   "The conversation has moved past feature delivery without setting up a user-feedback loop.",
    casual:   "I've been delivering features without setting up ways to hear what users think.",
    beginner: "I've been making features without setting up a way to hear what people think.",
  },
  ABSENCE_ITERATION_PLANNING: {
    formal:   "Iteration cadence hasn't been planned; work has continued without explicit cycle boundaries.",
    casual:   "I've been working straight through without breaking it into clear iteration cycles.",
    beginner: "I've been working without breaking the time into shorter cycles to plan around.",
  },
  ABSENCE_SCOPE_CREEP: {
    formal:   "Across recent prompts, scope has expanded without explicit prioritization or trade-off.",
    casual:   "I've been adding new things to the scope without weighing what gets pushed out.",
    beginner: "I've been adding more to the scope without thinking about what else gets dropped.",
  },
  ABSENCE_FEATURE_SCOPE: {
    formal:   "Feature work has continued without explicit boundaries for what is in or out of scope.",
    casual:   "I've been working on the feature without nailing down exactly what it covers.",
    beginner: "I've been working on the feature without saying exactly what it should include.",
  },
  ABSENCE_IMPLEMENTATION_CHECKPOINT: {
    formal:   "Implementation checkpoints haven't been set; build work has continued without intermediate review.",
    casual:   "I've been building straight through without stopping at intermediate checkpoints.",
    beginner: "I've been building without stopping along the way to check what I have so far.",
  },
  ABSENCE_SPEC_BEFORE_CODE: {
    formal:   "The conversation has moved into implementation specifics before the spec is written down.",
    casual:   "I've been writing code before getting the spec actually written down.",
    beginner: "I've been writing code before writing what the code is supposed to do.",
  },
  ABSENCE_INCREMENTAL_BUILD: {
    formal:   "Build activity has aggregated into large chunks without incremental-delivery checkpoints.",
    casual:   "I've been building in big chunks without breaking it into smaller deliverable pieces.",
    beginner: "I've been working in big batches without making smaller pieces that work on their own.",
  },
};

const CLASS_7_FALLBACKS = {
  // ── Cool_geek casual sets (11) ──────────────────────────────────────
  ABSENCE_FEATURE_COMPLETION_CHECK: {
    // Pattern β — Lately I've been
    casual: "Lately I've been marking features done without actually trying them end-to-end myself.",
  },
  ABSENCE_FINISHING_LINE_AWARENESS: {
    // Pattern γ — My X has
    casual: "My recent work has lacked a clear sense of what the finish line actually looks like.",
  },
  ABSENCE_POLISH_VS_FUNCTION: {
    // Pattern α — I've been
    casual: "I've been polishing details before the core function actually works reliably.",
  },
  ABSENCE_MVP_SCOPE_DISCIPLINE: {
    // Pattern δ — So far
    casual: "So far, the MVP line hasn't held — extras keep getting added instead.",
  },
  ABSENCE_IDEA_TO_SPEC_BRIDGE: {
    // Pattern ε — Looking at
    casual: "Looking at recent prompts, I've been kicking the idea around without writing it as spec.",
  },
  ABSENCE_DEMO_VS_PRODUCT: {
    // Pattern α — I've been
    casual: "I've been building toward something that demos well without making sure it actually works.",
  },
  ABSENCE_USER_JOURNEY_CHECK: {
    // Pattern γ — My X has
    casual: "My feature additions have happened without walking through the user journey end-to-end.",
  },
  ABSENCE_TECHNICAL_SPIKE_TREATMENT: {
    // Pattern ζ — Honestly
    casual: "Honestly, I've been letting spike code stay in place instead of rewriting it properly.",
  },
  ABSENCE_DEPENDENCY_ADVENTURE: {
    // Pattern β — Lately I've been (R3-Sub7 L2-flag noted; D-fallback L2-neutral per §1.5)
    casual: "Lately I've been pulling in libraries on impulse without checking what they actually do.",
  },
  ABSENCE_RESTART_IMPULSE_CHECK: {
    // Pattern α — I've been
    casual: "I've been thinking about starting over instead of fixing what's already here.",
  },
  ABSENCE_CREATIVE_VS_CORE_RATIO: {
    // Pattern γ — My X has gone
    casual: "My recent time has gone to creative side-quests while the core work waits.",
  },

  // ── Vibe-coder beginner sets (9 — DOCUMENTATION_BEFORE_ASK excluded; routed to Class 2) ──
  ABSENCE_ERROR_UNDERSTANDING: {
    // Pattern α — I've been
    beginner: "I've been getting errors without slowing down to understand what they're telling me.",
  },
  ABSENCE_REQUIREMENT_CLARITY: {
    // Pattern η — Let's check (beginner collaborative exception)
    beginner: "Let's check — I've been building before making sure I understand what I'm supposed to build.",
  },
  ABSENCE_COPY_PASTE_AWARENESS: {
    // Pattern α — I've been
    beginner: "I've been copying code in without checking if I understand what it does.",
  },
  ABSENCE_DEBUGGING_OBSERVATION: {
    // Pattern ε — Looking back
    beginner: "Looking back, I've been guessing at fixes without watching what the code does when it breaks.",
  },
  ABSENCE_LEARNING_CONSOLIDATION: {
    // Pattern β — Lately I've
    beginner: "Lately I've moved on from things I learned without writing down what stuck.",
  },
  ABSENCE_SIMPLE_SOLUTION_FIRST: {
    // Pattern α — I've been
    beginner: "I've been reaching for complex solutions before trying the simple version first.",
  },
  ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING: {
    // Pattern δ — So far
    beginner: "So far I've been asking for many things at once instead of one clear thing at a time.",
  },
  ABSENCE_ROLLBACK_AWARENESS: {
    // Pattern γ — My X have
    beginner: "My changes have been going in without me knowing how to undo them if something goes wrong.",
  },
  ABSENCE_BUILD_VS_UNDERSTAND_RATIO: {
    // Pattern ζ — Pattern check (interjection)
    beginner: "Pattern check: I've been building a lot without taking time to understand each piece.",
  },
};

const CLASS_8_FALLBACKS = {
  // ── Founder cluster (12 sets, casual register) ──────────────────────
  ABSENCE_USER_VALUE_CHECK: {
    // Pattern γ — My X has
    casual: "My recent build choices haven't been tested against what users actually value.",
  },
  ABSENCE_OUTCOME_DEFINITION: {
    // Pattern δ — So far
    casual: "So far, the target outcome hasn't been pinned down — work continues toward something fuzzy.",
  },
  ABSENCE_FEATURE_PRIORITIZATION: {
    // Pattern β — Lately I've
    casual: "Lately I've been picking features by interest level instead of explicit prioritization.",
  },
  ABSENCE_USER_PERSONA_CLARITY: {
    // Pattern α
    casual: "I've been building features without nailing down who exactly the target user is.",
  },
  ABSENCE_COMPETITIVE_AWARENESS: {
    // Pattern ε — Looking at
    casual: "Looking at recent work, I haven't checked what competitors already offer in this space.",
  },
  ABSENCE_MVP_BOUNDARY_DISCIPLINE: {
    // Pattern γ — My X has
    casual: "My MVP scope has crept outward without an explicit boundary holding it in place.",
  },
  ABSENCE_USER_ACQUISITION_CONSIDERATION: {
    // Pattern α
    casual: "I've been building features without thinking through how new users will actually find this.",
  },
  ABSENCE_RETENTION_MECHANISM_CHECK: {
    // Pattern δ — So far
    casual: "So far, retention mechanisms haven't been designed in — first-visit features are all that exist.",
  },
  ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT: {
    // Pattern ζ — Honestly
    casual: "Honestly, I've been shipping without setting up a way to hear what early users actually think.",
  },
  ABSENCE_HYPOTHESIS_BEFORE_BUILD: {
    // Pattern α
    casual: "I've been building features without first stating what hypothesis each one is testing.",
  },
  ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE: {
    // Pattern γ — My time has
    casual: "My time has gone heavily into technical depth without matching product-thinking time.",
  },
  ABSENCE_NORTH_STAR_ALIGNMENT: {
    // Pattern β — Lately I've
    casual: "Lately I've been making feature choices that don't trace back to the north-star direction.",
  },

  // ── Indie_hacker cluster (11 sets, casual register; 2 L2-flagged) ──
  ABSENCE_TIME_TO_VALUE_CHECK: {
    // Pattern α
    casual: "I've been building without checking how long until a user actually sees value from this.",
  },
  ABSENCE_SHIP_READINESS_DEFINITION: {
    // Pattern δ — So far
    casual: "So far, \"ship-ready\" hasn't been defined — the bar for releasing keeps shifting.",
  },
  ABSENCE_MANUAL_BEFORE_AUTOMATE: {
    // Pattern β — Lately I've
    casual: "Lately I've been automating things before the manual version is even proven to work.",
  },
  ABSENCE_TECH_STACK_COMPLEXITY_CHECK: {
    // Pattern γ — My X has
    casual: "My stack choices have stacked complexity higher than a solo workload can sustain.",
  },
  ABSENCE_LAUNCH_STRATEGY_ABSENCE: {
    // L2-flagged per R3-Sub8.6; D-fallback L2-neutral. Pattern ζ — Honestly
    casual: "Honestly, I've been moving toward launch without an explicit strategy for getting it in front of people.",
  },
  ABSENCE_EARLY_USER_FEEDBACK: {
    // Pattern α
    casual: "I've been building without showing in-progress work to even one early user yet.",
  },
  ABSENCE_SOLO_MAINTAINABILITY: {
    // Pattern ε — Looking back
    casual: "Looking back, I've built things I'll have a hard time maintaining alone over time.",
  },
  ABSENCE_DISTRIBUTION_THINKING: {
    // Pattern γ — My X has
    casual: "My product work has happened without thinking about how it'll reach the people who need it.",
  },
  ABSENCE_MONETIZATION_PATH_CLARITY: {
    // Pattern α
    casual: "I've been building features without a clear path for how this turns into revenue.",
  },
  ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY: {
    // L2-flagged per R3-Sub8.6; D-fallback L2-neutral. Pattern δ — So far
    casual: "So far, build-in-public moments have passed by without being shared or capitalized on.",
  },
  ABSENCE_SCOPE_VS_TIME_CHECK: {
    // Pattern β — Lately I've
    casual: "Lately I've been committing to scope that doesn't fit the time I actually have available.",
  },

  // ── PM cluster (12 sets, formal register; 2 L2-flagged) ────────────
  ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV: {
    // Pattern F — inverted
    formal: "Acceptance criteria haven't been written down; development is proceeding without them.",
  },
  ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK: {
    // L2-flagged per R3-Sub8.6; D-fallback L2-neutral. Pattern B — conversation
    formal: "The conversation has progressed on the project without stakeholder alignment being confirmed.",
  },
  ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG: {
    // Pattern C — subject-noun
    formal: "Requirement language has stayed ambiguous without explicit clarification or flag.",
  },
  ABSENCE_DEPENDENCY_MAPPING: {
    // Pattern F — inverted
    formal: "Cross-task dependencies haven't been mapped; planning is proceeding as if work is independent.",
  },
  ABSENCE_DEFINITION_OF_DONE: {
    // Pattern A — prompt-referential
    formal: "Recent prompts have moved into task work without an explicit definition of \"done\" per task.",
  },
  ABSENCE_CROSS_TEAM_IMPACT_CHECK: {
    // L2-flagged per R3-Sub8.6; D-fallback L2-neutral. Pattern D — activity-noun
    formal: "Cross-team impact has been left unexamined while implementation work proceeds locally.",
  },
  ABSENCE_SUCCESS_METRIC_DEFINITION: {
    // Pattern F — inverted
    formal: "Success metrics haven't been defined; the project is being judged against an unstated bar.",
  },
  ABSENCE_PRIORITY_JUSTIFICATION: {
    // Pattern B — conversation
    formal: "The conversation has committed to priority orderings without explicit justification recorded.",
  },
  ABSENCE_USER_STORY_COMPLETENESS: {
    // Pattern C — subject-noun
    formal: "User-story drafts have moved into development without completeness checks for acceptance criteria.",
  },
  ABSENCE_RISK_FLAG: {
    // Pattern A — prompt-referential variant
    formal: "Across recent prompts, project risks have been mentioned but not flagged or tracked.",
  },
  ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT: {
    // Pattern D — activity-noun
    formal: "Scope-change requests have been absorbed without impact assessment on timeline or dependencies.",
  },
  ABSENCE_RETROSPECTIVE_HABIT: {
    // Pattern C — subject-noun
    formal: "Cycle endings have passed without a structured retrospective to capture what worked.",
  },
};

const CLASS_9_FALLBACKS = {
  ABSENCE_DECISION_RECORD_ABSENCE: {
    // Pattern F — inverted
    formal: "Design decisions haven't been recorded; rationale is implicit in recent prompt history only.",
  },
  ABSENCE_OVER_ENGINEERING_CHECK: {
    // L2-flagged per R3-Sub9.6; D-fallback L2-neutral. Pattern B — conversation
    formal: "The conversation has moved toward solution complexity without checking it against problem-size signals.",
  },
  ABSENCE_PAIR_REVIEW_ABSENCE: {
    // Pattern D — activity-noun
    formal: "Solo authoring has continued without pair-review or second-eye checks on changes.",
  },
  ABSENCE_OBSERVABILITY_FIRST: {
    // L2-flagged per R3-Sub9.6; D-fallback L2-neutral. Pattern C — subject-noun
    formal: "Observability instrumentation has remained absent while service work progresses toward production.",
  },
  ABSENCE_FAILURE_MODE_ANALYSIS: {
    // L2-flagged per R3-Sub9.6; D-fallback L2-neutral. Pattern A — prompt-referential
    formal: "Recent prompts have moved into implementation without explicit failure-mode enumeration.",
  },
  ABSENCE_CONTRACT_TESTING_GAP: {
    // Pattern C — subject-noun
    formal: "Service contracts have evolved without consumer-driven contract testing keeping pace.",
  },
  ABSENCE_CAPACITY_PLANNING_GAP: {
    // Pattern B — conversation
    formal: "The conversation has assumed sufficient capacity without explicit planning against load projections.",
  },
  ABSENCE_SECURITY_THREAT_MODELING: {
    // L2-flagged per R3-Sub9.6; D-fallback L2-neutral. Pattern D — activity-noun
    formal: "Security work has continued without an articulated threat model framing decisions.",
  },
  ABSENCE_DATABASE_MIGRATION_SAFETY: {
    // L2-flagged per R3-Sub9.6; D-fallback L2-neutral. Pattern D — activity-noun
    formal: "Schema migration work has progressed without explicit safety analysis or rollback path.",
  },
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE: {
    // L2-flagged per R3-Sub9.6; D-fallback L2-neutral. Pattern F — inverted
    formal: "Deployment strategy hasn't been chosen; risk distribution at release time is currently uncontrolled.",
  },
  ABSENCE_OPERATIONAL_RUNBOOK_GAP: {
    // Pattern A — prompt-referential variant
    formal: "Across recent prompts, service work has matured without operational-runbook documentation.",
  },
  ABSENCE_SLO_DEFINITION_GAP: {
    // Pattern C — subject-noun
    formal: "Service-level objectives have remained undefined while implementation continues toward production.",
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Public export — merged map across all 9 classes.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Merged D-fallback table — covers every signal_type that has at least
 * one D-fallback variant. Lookup via getR5DFallback() with graceful
 * fallback when the (signal_type, register) pair is not authored.
 */
export const R5_D_FALLBACKS: Record<string, RegisterPartial> = {
  ...CLASS_1_FALLBACKS,
  ...CLASS_2_BASE_FALLBACKS,
  ...CLASS_2_ROUTED_FALLBACKS,
  ...CLASS_3_FALLBACKS,
  ...CLASS_4_FALLBACKS,
  ...CLASS_5_FALLBACKS,
  ...CLASS_6_FALLBACKS,
  ...CLASS_7_FALLBACKS,
  ...CLASS_8_FALLBACKS,
  ...CLASS_9_FALLBACKS,
};

/**
 * Runtime lookup — returns the D-fallback string for the (signal_type,
 * register) pair, or `undefined` when no fallback is authored. The
 * caller chooses whether to skip or substitute alternative content.
 */
export function getR5DFallback(
  signalType: string,
  register:   Register,
): string | undefined {
  return R5_D_FALLBACKS[signalType]?.[register];
}
