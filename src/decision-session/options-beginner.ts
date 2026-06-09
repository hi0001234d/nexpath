import type { DecisionContent } from './options.js';
import type { Stage } from '../classifier/types.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from './why-help-by-signal-type.js';

const IDEA_TO_PRD_BEGINNER: DecisionContent = {
  signalType:   "IDEA_TO_PRD",
  question:      'Before building — is the plan written?',
  pinchFallback: 'Before coding.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['IDEA_TO_PRD'],
  L1: [
    {
      option: '1. Help me describe what I\'m building in plain terms — what it does and who it\'s for.\n2. Share your understanding with me before we go further so I can confirm we\'re on the same page.\n3. Then tell me: what\'s the most important thing to figure out before we start building?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I've been talking about my project idea for a few prompts but I haven't written anything down clearly yet."}
I'm at the moment where talking about the idea turns into actually planning it; I need a shared understanding before going further.
The steps walk me through it: I describe, you confirm what you hear, then I pick the most important thing to nail down first.
{R4_CLOSE}`,
    },
    {
      option: 'Help me describe what I want to build in plain terms, then share it back with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "My recent prompts have been about the idea, but nothing concrete is written."}
Same moment, single back-and-forth instead of three steps.
Help me describe, then share back so I can confirm.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Ask me one question to understand what I\'m building better, then summarise what you hear back to me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "I've been talking about the idea but not in enough detail for you to act on it."}
Lighter version: one question, one summary back.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is anything about what I want to build still unclear to you?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea discussed; clarity not confirmed."}
Minimum next step: just tell me what's still unclear.
{R4_CLOSE}`,
    },
  ],
};

const PRD_TO_ARCHITECTURE_BEGINNER: DecisionContent = {
  signalType:   "PRD_TO_ARCHITECTURE",
  question:      'Spec ready — is the architecture decided?',
  pinchFallback: 'Design first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['PRD_TO_ARCHITECTURE'],
  L1: [
    {
      option: '1. List the main parts of what we\'re building and how they connect — in plain language, no technical terms.\n2. Share that list with me before we move on so I can confirm it covers everything.\n3. Then tell me: what\'s the one thing we need to decide before writing any code?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I have a sense of what to build but I don't know how the pieces connect yet."}
The spec feels solid; I need to know how the pieces fit together before any code gets written.
Walk me through it slowly: list the parts in plain language, share for confirmation, then point me at the one decision I need to make first.
{R4_CLOSE}`,
    },
    {
      option: 'Describe the main parts of this system and how they connect — then share it with me before we start building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I know what I want to build but not how it's structured."}
Same moment, single pass: describe the parts and how they connect, then share so I can confirm.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most important decision to make before we start coding? Share your answer with me first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec is there; first big decision not made."}
Lighter version: the single most important decision before coding.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything about the plan that could cause problems when we start coding?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Plan is there; trouble spots not surfaced."}
Minimum next step: anything in the plan that will bite during coding.
{R4_CLOSE}`,
    },
  ],
};

const ARCHITECTURE_TO_TASKS_BEGINNER: DecisionContent = {
  signalType:   "ARCHITECTURE_TO_TASKS",
  question:      'Architecture done — is the task list ordered?',
  pinchFallback: 'Break it down.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ARCHITECTURE_TO_TASKS'],
  L1: [
    {
      option: '1. Break this down into small steps — each one should be something you can build in a single session.\n2. Share the list with me so I can check the order makes sense before you start.\n3. Then tell me: what\'s the first thing to build that shows the whole thing actually works?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I understand the structure now but I don't have a list of steps to actually start."}
I see how the pieces fit; I need this broken into steps I can actually start on, in order.
Walk me through it: small steps, share the list for ordering confirmation, then point out the first thing that proves the whole thing works.
{R4_CLOSE}`,
    },
    {
      option: 'List the first 3 steps to build this in order — then share them with me before you begin.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Structure is clear, no step list yet."}
Same moment, smaller scope: just the first three steps in order.
Share them for confirmation before starting.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the very first thing to build and why? Share your answer with me before we start.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Structure is clear, starting point not chosen."}
Lighter version: just the first thing to build and why.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is the order of these steps clear, or is anything missing before we start?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Step list is here; clarity not confirmed."}
Minimum next step: anything unclear or missing about the order.
{R4_CLOSE}`,
    },
  ],
};

export const TASK_REVIEW_BEGINNER: DecisionContent = {
  signalType:   "TASK_REVIEW",
  question:      'Task done — reviewed and tested?',
  pinchFallback: 'Quick check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['TASK_REVIEW'],
  L1: [
    {
      option: '1. Review what was just built — does it do what this task asked for, in plain terms?\n2. Share your review with me before I mark this done, and flag anything that looks off.\n3. Then check: is there anything that might break something that was already working?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I just finished a task and the last few prompts have been about building it; I haven't reviewed it yet."}
A task just finished; I need a check before I mark it done and move on.
Walk me through it: review in plain terms, flag anything off, then check whether it broke something that was working.
{R4_CLOSE}`,
    },
    {
      option: 'Check if what was just built matches what the task asked for — share what you find with me first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task just finished, no review yet."}
Same moment, simpler: did the build match what the task asked for? Share findings before I move on.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built look right to you? Flag anything that seems off and share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task just finished."}
Lighter check: does the build look right? Flag the off stuff.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that looks wrong or incomplete?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Task just finished."}
Minimum next step: anything wrong or incomplete.
{R4_CLOSE}`,
    },
  ],
};

const IMPLEMENTATION_TO_REVIEW_BEGINNER: DecisionContent = {
  signalType:   "IMPLEMENTATION_TO_REVIEW",
  question:      'Phase done — full review before moving on?',
  pinchFallback: 'Phase done?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['IMPLEMENTATION_TO_REVIEW'],
  L1: [
    {
      option: '1. Go through everything built in this phase — does it all work together the way it should?\n2. Share that with me before we move on and flag anything that looks incomplete or broken.\n3. Then check: is there anything a real person using this could run into that we haven\'t covered?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "I've been building features through this phase across many prompts; no end-of-phase check yet."}
A whole phase just finished; I need to know it all works together before I start the next one.
Walk me through it: full coverage check, flag incomplete or broken pieces, then think about what a real user could hit that we haven't covered.
{R4_CLOSE}`,
    },
    {
      option: 'Check if everything in this phase is working as expected — share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Phase just wrapped, no check yet."}
Same moment, simpler: is everything in the phase working? Share findings before moving on.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most important thing to check before calling this phase done? Share your answer with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Phase just wrapped."}
Lighter check: the single most important thing to verify before calling the phase done.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything obviously broken or missing in what was just built?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Phase just wrapped."}
Minimum next step: anything obviously broken or missing.
{R4_CLOSE}`,
    },
  ],
};

const REVIEW_TO_RELEASE_BEGINNER: DecisionContent = {
  signalType:   "REVIEW_TO_RELEASE",
  question:      'Ready to ship — final checks done?',
  pinchFallback: 'Almost there.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['REVIEW_TO_RELEASE'],
  L1: [
    {
      option: '1. Check that everything still works — go through the main things that need to pass before we ship.\n2. Share the results with me before we release anything.\n3. Then tell me: is there anything that could go wrong once this is live that we haven\'t tested in here?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "Last few prompts: I've been reviewing and testing. Haven't done the final pre-ship gut check yet."}
Review is done; this is the last step before going live, and I need to be sure it's actually ready.
Walk me through it: go through what has to pass, share the results, then think about what could still break in production that we missed in here.
{R4_CLOSE}`,
    },
    {
      option: 'Check if this is ready to ship and share what still needs to be done before we release.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Review wrapped, ship status not yet checked."}
Same moment, simpler: is this ready to ship and what's still missing?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the biggest risk in shipping this right now? Share your answer with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship moment."}
Lighter check: the single biggest risk in shipping right now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything that could break once this is live that we haven\'t tested?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship moment."}
Minimum next step: anything that could break in production we haven't tested.
{R4_CLOSE}`,
    },
  ],
};

const RELEASE_TO_FEEDBACK_BEGINNER: DecisionContent = {
  signalType:   "RELEASE_TO_FEEDBACK",
  question:      'Just shipped — is the feedback loop active?',
  pinchFallback: 'Watch it live.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['RELEASE_TO_FEEDBACK'],
  L1: [
    {
      option: '1. Check that what was just built is actually working now that it\'s live — try the main thing it does and see if it works the way you expected.\n2. Share what you find with me before we move on and flag anything that looks off or unexpected.\n3. Then check: will we know if something breaks after we stop watching, or will it fail without showing an obvious error?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~2 lines first-person — "Just shipped; haven't checked it live and don't know yet if alerts would catch a silent break."}
It just went live; I need to know it actually works in production and that I'll find out if it breaks later.
Walk me through it: try the main thing, flag anything that looks off, then think about whether we'd know if something breaks after we stop watching.
{R4_CLOSE}`,
    },
    {
      option: 'Check if this project is set up to let us know if something goes wrong now that it\'s live — share what\'s in place and what\'s missing with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Just shipped; alerting/monitoring status not checked."}
Same moment, simpler: is the project set up to tell us if something goes wrong? What's there and what's missing?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'How would we find out if something is going wrong for a real person using this feature right now? Share your answer with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Just shipped."}
Lighter check: how would we even find out if a real user hits a problem right now?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could go wrong without showing a clear error?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Just shipped."}
Minimum next step: anything in the build that could fail silently.
{R4_CLOSE}`,
    },
  ],
};

const BEHAVIOUR_TESTING_BEGINNER: DecisionContent = {
  signalType:   "BEHAVIOUR_TESTING",
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['BEHAVIOUR_TESTING'],
  L1: [
    {
      option: '1. Walk through this feature as if you\'re a real user — tell me each step, what you\'d click or type, and whether it works the way it should.\n2. Share what you find with me before we move on.\n3. Flag anything that feels wrong or missing along the way.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built this in the last few prompts but I haven't tried it as a user yet."}
I haven't manually used what was just built; automated tests miss the real-user feel.
Walk me through it as if I'm a user: each step, what I'd click or type, what I'd see, what I'd flag.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through this as a real user would — then share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; not walked through as a user."}
Same moment, simpler: walk through as a user, share what works and what doesn't.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most important thing to test by using it like a real person? Share that with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Lighter: the single most important real-user check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything that feels off when you use this yourself?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything that feels off when I use it.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_TEST_CREATION_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_TEST_CREATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_TEST_CREATION",
  question:      'Built something — any tests written yet?',
  pinchFallback: 'Tests missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TEST_CREATION'],
  L1: [
    {
      option: '1. Write a test for what was just built — start with the main thing it\'s supposed to do.\n2. Share the test with me so I can check it covers the right thing.\n3. Then tell me: is there anything else in what was just built that could break without a test catching it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I just built something but I haven't written any tests for it."}
Tests haven't been written; whatever I built could break next time I change something.
Walk me through it: write a test starting with the main thing, share it so I can check coverage, then point out anything else that could break without a test.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me: what\'s the most important thing it does? Then write a test that checks that works correctly, and share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; no tests yet."}
Same moment, simpler: name the most important thing it does, then write a test for that.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write one test for what was just built and share it with me — I want to see what you\'re checking and make sure it covers the right thing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; zero tests."}
Lighter: write one test, share what I'm checking.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that should have a test before we move on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; zero tests."}
Minimum next step: one thing that should have a test before I move on.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_REGRESSION_CHECK_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_REGRESSION_CHECK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_REGRESSION_CHECK",
  question:      'Changed something — did anything break?',
  pinchFallback: 'Regression check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REGRESSION_CHECK'],
  L1: [
    {
      option: '1. Run the existing tests for this project now that what was just built has been added.\n2. Share the results with me — which ones pass, which ones fail.\n3. Then tell me: is there anything that used to work that might not work anymore?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I just added something but I haven't run the existing tests since."}
Whether the changes broke things that used to work hasn't been checked.
Walk me through it: run the existing tests, share pass/fail, then tell me if anything that used to work might not anymore.
{R4_CLOSE}`,
    },
    {
      option: 'Look at what was just built and tell me — what other parts of this project does it touch or depend on? Then check if those parts still work correctly and share what you find.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Made changes; affected-parts not mapped."}
Same moment, deeper: what other parts of this project does my change touch? Check those still work.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Run the tests for this project and share the results with me — I want to know if anything broke after what was just built was added.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made changes; suite not run."}
Lighter: run the suite, tell me what broke.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything that was working before that might have stopped working after what was just built was added?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Made changes."}
Minimum next step: anything that used to work and might not now.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_SPEC_ACCEPTANCE_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_SPEC_ACCEPTANCE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SPEC_ACCEPTANCE",
  question:      'Built something — does it match what was planned?',
  pinchFallback: 'Check the spec.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_ACCEPTANCE'],
  L1: [
    {
      option: '1. Look at what was just built and compare it to what we planned to build.\n2. Share with me: does it do everything it was supposed to, or is something missing or different?\n3. Then check: are there any situations it should handle that it doesn\'t?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something but I haven't compared it back to what we planned."}
Spec-vs-build comparison hasn't been done.
Walk me through it: does each piece match the plan, is something missing or different, are there situations it should handle that it doesn't?
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built step by step and tell me — does each part match what we planned? Share anything that looks different from what we agreed on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; plan-match not verified."}
Same moment, simpler: does each part of the build match the plan?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built do what we planned it to do? Share any differences with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Lighter: does it do what we planned? Share any differences.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that doesn\'t match what we originally planned to build?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything that doesn't match what we originally planned.
{R4_CLOSE}`,
    },
  ],
};

/** ABSENCE_CROSS_CONFIRMING_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_CROSS_CONFIRMING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_CROSS_CONFIRMING",
  question:      'AI wrote it — have you actually checked it?',
  pinchFallback: 'Verify the output.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CROSS_CONFIRMING'],
  L1: [
    {
      option: '1. Read through what was just built carefully — not just to check if it looks right, but to understand what it actually does.\n2. Share with me: is there anything that seems off, confusing, or that you\'re not sure about?\n3. Then tell me: is there anything in what was just built you haven\'t manually checked yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Code was generated for me but I've just been accepting it; I haven't checked the details."}
The piece-by-piece check on generated code hasn't been done.
Walk me through it: read carefully to understand what each part does, flag anything off/confusing, then point to anything I haven't manually checked.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built step by step and tell me — do you understand what each part does? Share anything that looks unclear or that you just accepted without checking.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Generated output present; understanding-check not done."}
Same moment, simpler: do I understand what each part does? Flag anything unclear or accepted without checking.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that you accepted because it looked right, but haven\'t actually checked? Share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated; looks-right-but-not-checked items not flagged."}
Lighter: anything accepted because it looked right, not actually checked.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that you\'re not 100% sure is correct — something you haven\'t manually verified yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated."}
Minimum next step: anything I'm not 100% sure is correct.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SECURITY_CHECK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SECURITY_CHECK",
  question:      'Built something — any security checks done?',
  pinchFallback: 'Security gap.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SECURITY_CHECK'],
  L1: [
    {
      option: '1. Look at what was just built and check if it handles anything a user types in or sends to the app.\n2. Share with me: could someone type something unexpected and cause a problem?\n3. Then check: does anything in what was just built need a login or permission to use, and is that actually enforced?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something that takes user input or uses login; haven't checked it for security."}
Security check hasn't been done; the input-handling and permission paths are unchecked.
Walk me through it: check what handles user input, share what could go wrong with unexpected typing, then check whether login/permission is actually enforced.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — what could go wrong if someone tried to misuse it on purpose? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it with user-input or auth; misuse path not considered."}
Same moment, mistake-on-purpose framing: what could go wrong if someone tried to misuse it on purpose?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that takes input from a user or checks if someone is logged in? Share how that\'s handled with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; input/auth handling unclear."}
Lighter: anything that takes input or checks login — how is that handled?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that a user could misuse or that isn\'t properly protected?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything a user could misuse or that isn't protected.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ERROR_HANDLING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ERROR_HANDLING",
  question:      'Feature built — what happens when it breaks?',
  pinchFallback: 'Error handling.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ERROR_HANDLING'],
  L1: [
    {
      option: '1. Look at what was just built and think: what happens if it doesn\'t work the way it\'s supposed to?\n2. Share with me: is there anything that could break without showing a useful message?\n3. Then check: what happens if a user does something unexpected — does the app handle it or crash?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built a feature but I haven't thought about what happens when it doesn't work."}
The "what happens when it breaks" hasn't been considered.
Walk me through it: anything that could break without a useful message, then check unexpected-user-action handling.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — what\'s the first thing that could go wrong, and what does the user see when that happens? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; first-thing-that-could-go-wrong not identified."}
Same moment, deeper: the first thing that could go wrong, what the user sees when it does.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that could fail without telling the user what went wrong? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Lighter: anything that could fail without telling the user what went wrong.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could crash or fail silently when something unexpected happens?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything that could crash or fail silently on unexpected input.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DOCUMENTATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DOCUMENTATION",
  question:      'Code written — is anything documented?',
  pinchFallback: 'Docs missing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DOCUMENTATION'],
  L1: [
    {
      option: '1. Look at what was just built and find one part that would be hard to understand for someone who didn\'t write it.\n2. Add a short explanation of why it works that way and share it with me.\n3. Then check: is there anything else in what was just built that needs explaining before we move on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built something without writing down why parts of it work the way they do — someone reading it later might be confused."}
A hard-to-understand part explanation hasn't been shared.
Let's find one part that would be hard for someone else to understand; write a short explanation of why it works that way; share it; then check whether anything else needs explaining.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and point out the part that would confuse someone reading it for the first time — then write a short explanation for that part and share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built something but didn't write down the explanation for the parts that would confuse a first-time reader."}
The confusing-part explanation hasn't been shared.
Let's walk through; identify the part that would confuse a first-time reader; write a short explanation; share it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that you\'d have to explain to someone else? Write that explanation as a comment and share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Some parts of what was just built would need explaining to someone else."}
A would-need-explaining-to-someone-else capture hasn't been done.
Let's write that explanation as a comment and share it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that isn\'t obvious — something that would confuse someone who didn\'t write it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything not obvious that would confuse someone who didn't write it.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_OBSERVABILITY_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_OBSERVABILITY",
  question:      'Feature built — will you know when it breaks?',
  pinchFallback: 'No observability.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OBSERVABILITY'],
  L1: [
    {
      option: '1. Think about what was just built running in the real world — if it stopped working, how would you find out?\n2. Share with me: is there anything that records what it\'s doing, or would it just fail without warning?\n3. Then tell me: what\'s the most important thing to log so you\'d know it\'s working?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built a feature but I haven't set up anything to tell me when it breaks."}
Production-failure detection hasn't been set up.
Walk me through it: how would I find out if it stops working, is there any logging, what's most important to log?
Still, before you add logging across the codebase you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — if something went wrong when real users were using it, would you get any warning, or would you find out when users complained? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; warning system not set up."}
Same moment, simpler: would I get a warning on user-facing failure, or find out via complaint?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that could stop working without you noticing? Share with me what would help you detect that.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built; silent-fail detection unclear."}
Lighter: silent-fail risk + what'd detect it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that could fail silently in production without triggering a log entry or alert?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built."}
Minimum next step: silent-fail-without-trace risk.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_COMPREHENSION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_COMPREHENSION",
  question:      'AI wrote it — do you actually get it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    {
      option: '1. Read through what was just built slowly — not to check if it looks right, but to understand what each part actually does.\n2. Share with me: is there anything you\'re not sure about or that doesn\'t make sense to you?\n3. Then tell me: is there any part you just accepted because it looked okay without actually understanding it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something but I'm not sure I understand every part of what was just made."}
A slow read-through and shared comprehension check hasn't happened together yet.
Let's read through it slowly: what each part actually does. I'll share anything that doesn't make sense, and we'll go through any pieces I just accepted without understanding.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built in your own words — explain what it does step by step. Share anything you\'re not able to explain clearly with me and we\'ll go through it together.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I went along with what was generated but couldn't explain it step by step in my own words."}
A step-by-step walkthrough of what was just built (in my own words) hasn't been done.
Let's walk through it together; I'll share anything I can't explain clearly and we'll work through those parts.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any part of what was just built you couldn\'t explain to someone else right now? Share that part with me and we\'ll make sure you understand it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; not sure I could explain every part to someone else."}
A can't-explain-to-someone-else check hasn't been done.
Let's find that part and make sure I understand it before moving on.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that you\'re not sure you fully understand?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything I'm not sure I fully understand.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_REFACTORING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_REFACTORING",
  question:      'Long build run — anything to clean up?',
  pinchFallback: 'Refactor check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REFACTORING'],
  L1: [
    {
      option: '1. Read through what was just built from start to finish — does it still feel organised and easy to follow?\n2. Share with me: is there anything that feels messy, repeated, or harder to understand than it needs to be?\n3. Then tell me: is there anything that should be tidied up before we add more features on top?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built a long stretch of code without checking whether it still feels organised and easy to follow."}
A start-to-finish read-through for organisation + clarity hasn't been shared.
Let's read through start to finish; share anything that feels messy / repeated / harder-than-it-needs-to-be; decide whether to tidy before adding more.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — is there any part that would be confusing or messy to someone who didn\'t write it? Share what you find with me so we can decide whether to clean it up now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it without thinking about whether it'd be confusing or messy to someone who didn't write it."}
The confusing-or-messy-to-outsider spot-check hasn't been shared.
Let's walk through; tell me what's confusing or messy to a new reader; we'll decide whether to clean up now.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that feels messy or repeated? Share it with me and let\'s decide whether to clean it up before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; some parts feel messy or repeated."}
The messy / repeated check hasn't been shared.
Let's spot it; decide whether to clean up before moving on.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that should be cleaned up or simplified before we continue?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything to clean up or simplify before we continue.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_NO_PUSHBACK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_NO_PUSHBACK",
  question:      'AI keeps suggesting — are you actually evaluating?',
  pinchFallback: 'No pushback.',
  L1: [
    {
      option: '1. Look at the last few suggestions made while building this feature.\n2. Share with me: is there anything you accepted just because it sounded right, without checking if it was really the best option?\n3. Then pick one and tell me: why did you go with that suggestion over other ways of doing it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Accepted recent suggestions because they sounded right, without really checking if they were the best option."}
The looked-right-without-checking pushback hasn't been talked through together.
Let's look at the recent suggestions; I'll share any I accepted just because they sounded right, and we'll talk through why one of them got picked over other ways.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the last suggestion used in what was just built — do you actually agree with it, or did you just go with it because it seemed confident? Share your thoughts with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Went with the last suggestion because it sounded confident, not because I checked it myself."}
The agree-vs-just-went-with-it walkthrough hasn't been shared.
Let's walk through the last suggestion together; I'll share whether I actually agree or whether I just went with it.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything suggested for what was just built that you said yes to without really thinking about whether it was the right choice? Share that with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Said yes to some suggestions without really thinking about whether they were right."}
A yes-without-thinking check hasn't been done.
Let's spot that one and look at whether it was actually the right choice.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any AI suggestion used in what was just built that you accepted without questioning whether it was actually the best approach?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: let's check for any suggestion I said yes to without thinking about whether it was the best approach.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CORRECTION_SEEKING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_CORRECTION_SEEKING",
  question:      'Has the AI checked its own work?',
  pinchFallback: 'No verification.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CORRECTION_SEEKING'],
  L1: [
    {
      option: '1. Look at what was just built again — but this time, find what might be wrong with it.\n2. Share what you find with me.\n3. Then tell me: does what you found make sense, or does something still seem off?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it without going back through to find what might be wrong with it."}
A find-what-might-be-wrong critique pass hasn't been shared.
Let's look at it again to find what might be wrong; share what we find; check whether the findings make sense or something still seems off.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the part of what was just built you\'re least sure about? — share what you find with me so we can check together.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; not sure which part I'm least confident about."}
The least-sure-part check hasn't been shared.
Let's spot the least-confident part; share it together; check it together.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Point out any part of what was just built that might not be right — then share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; haven't pointed out what might not be right."}
A might-not-be-right spot-check hasn't been done.
Let's point out the part that might not be right; share it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Find one thing in what was just built that might be wrong or could be done better.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: one thing that might be wrong or could be done better.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROBLEM_CORRECTION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_PROBLEM_CORRECTION",
  question:      'Spotted a bug — did it actually get fixed?',
  pinchFallback: 'Bug unresolved.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROBLEM_CORRECTION'],
  L1: [
    {
      option: '1. Think back through this session — was there anything that didn\'t work or looked wrong earlier on?\n2. Share with me: is that thing actually fixed now, or did we move on without dealing with it?\n3. Then check: are there any other problems in what was just built that haven\'t been properly sorted out?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Earlier in this session something didn't work or looked wrong; not sure if it got fixed."}
A noticed-but-maybe-unfixed issue is hanging over what was just built.
Walk me through it: was there anything broken earlier in this session, is it actually fixed now, then check for other unresolved problems.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — is there anything we said was a problem earlier that still hasn\'t been fixed? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Issues came up earlier; status uncertain."}
Same moment, deeper: anything I said was a problem earlier that still isn't fixed.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that was flagged as broken or wrong earlier in this session but hasn\'t been fixed yet? Share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Earlier issue flagged; status unclear."}
Lighter: anything flagged broken earlier that still isn't fixed.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any bug in what was just built that was noticed earlier but not actually fixed?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Earlier issue noticed."}
Minimum next step: any bug noticed earlier but not actually fixed.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ALTERNATIVES_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ALTERNATIVES",
  question:      'Decision made — any alternatives looked at?',
  pinchFallback: 'No alternatives.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ALTERNATIVES'],
  L1: [
    {
      option: '1. Think about the biggest decision that was made while building this feature.\n2. Share with me: what other ways could it have been done, and why did we go with this one?\n3. Then tell me: is this still the best approach now that you think about it, or would something else have been simpler?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I made a big decision while building this without thinking about other ways to do it."}
The biggest decision's alternatives haven't been talked through together.
Let's walk through it: what other ways could it have been done, why we went with this one, and whether this is still the best fit now.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the most important choice made in what was just built — what were the other options we could have picked, and why did we choose this one? Share your thinking with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Made the most important choice without talking through the options first."}
The most-important-choice's other-options walkthrough hasn't been shared.
Let's go through the other options together and confirm why this one was picked.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any choice made in what was just built where we just went with the first idea without thinking about other ways to do it? Share that with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Went with the first idea on some choices without thinking about other ways."}
A first-idea-without-thinking check hasn't been done.
Let's spot any place I just went with the first option and look at other ways now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any decision in what was just built that was made without thinking about other options first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: let's check for any decision made without thinking about other options first.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ARCH_CONFLICT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ARCH_CONFLICT",
  question:      'Feature added — does it fit the codebase?',
  pinchFallback: 'Arch conflict.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ARCH_CONFLICT'],
  L1: [
    {
      option: '1. Look at what was just built and compare it to how other parts of the project are written.\n2. Share with me: does it feel like it belongs, or does it do things in a different way than everything else?\n3. Then tell me: is there anything that could cause problems when we try to connect it with the rest of the project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something new but I haven't compared it to how other parts of this project are written."}
Codebase-fit check hasn't been done.
Walk me through it: compare what I built to other parts, does it fit or do things differently, would it cause problems connecting with the rest?
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what was just built and tell me — does it fit with the way the rest of the project is structured, or does it work differently from everything else? Share what you notice with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built it; structural-fit unclear."}
Same moment, simpler: does it fit the project's structure, or does it work differently?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in what was just built that looks different from how the rest of the project does things? Share it with me and let\'s check if that\'s a problem.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Lighter: anything that looks different from how the rest of the project does things.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that doesn\'t fit with the rest of the project\'s structure or patterns?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything that doesn't fit the project's patterns or structure.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROMPT_CONTEXT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_PROMPT_CONTEXT",
  question:      'Sending prompts — have you shared the spec?',
  pinchFallback: 'Missing context.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROMPT_CONTEXT'],
  L1: [
    {
      option: '1. Think about what you\'ve been building in this session.\n2. Share with me: have you seen the original plan for what we\'re building, or have you just been following each instruction without knowing the bigger picture?\n3. Then paste the plan or the task description into the conversation and check that what was just built matches what was planned.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building based on individual instructions but I'm not sure I've seen the full plan."}
The full-plan-vs-individual-instructions check hasn't been done.
Walk me through it: think about what I've been building, do I have the full plan or just instructions, then paste the plan and check the build matches.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what you\'ve been working from in this session — have you seen the full plan, or just individual instructions? Check whether what was just built matches the original plan if you have it, and share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Following individual prompts; full plan unclear."}
Same moment, simpler: do I have the full plan, or only individual instructions? Check build vs plan if available.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Have you seen the plan or the description of what this feature is supposed to do? If not, ask me for it — then check that what was just built matches and share what you find.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Following individual prompts."}
Lighter: have I seen the plan or description of this feature? If not, ask for it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you know what the full plan says for this feature, or have you been building without seeing it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Following individual prompts."}
Minimum next step: I know what the full plan says, or building without it?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ROLLBACK_PLANNING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ROLLBACK_PLANNING",
  question:      'Shipping soon — what\'s the rollback plan?',
  pinchFallback: 'No rollback plan.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ROLLBACK_PLANNING'],
  L1: [
    {
      option: '1. Think about what would happen if this feature caused a problem when it went live.\n2. Share with me: what would you do to undo the deployment if something went wrong?\n3. Then check: is there anything in this feature that would be hard to reverse once it\'s live?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm about to ship but I haven't thought about what to do if things go wrong."}
A rollback plan hasn't been thought through.
Walk me through it: live-failure scenario, undo procedure, hard-to-reverse pieces.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what you\'d do if this feature broke in production right after shipping — would you know how to roll it back, or would you need to figure it out under pressure? Share your plan with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; rollback procedure not known."}
Same moment, simpler: rollback procedure known or figure-out-under-pressure?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a plan for what to do if this feature causes a problem after it\'s deployed? Share it with me before we ship.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; post-deploy-problem plan unclear."}
Lighter: post-deploy-problem plan exists?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you know what you\'d do to roll back this feature if something went wrong after shipping?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship."}
Minimum next step: rollback procedure known.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPLOYMENT_PLANNING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DEPLOYMENT_PLANNING",
  question:      'Shipping soon — is the deployment actually planned?',
  pinchFallback: 'No deploy plan.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPLOYMENT_PLANNING'],
  L1: [
    {
      option: '1. Think about how this feature is going to get from your computer to where users will use it.\n2. Share with me: is there a plan for that, or is it still not figured out?\n3. Then check: is there anything the live environment needs that isn\'t set up yet — like settings or secret keys?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built something but I haven't figured out how it'll actually get to users."}
The deploy-to-users path hasn't been figured out.
Walk me through it: deploy plan, missing live-env pieces (settings, secrets).
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through how this feature would actually get deployed — what are the steps, and is there anything that needs to be set up in the live environment before it\'ll work? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-ship; deploy steps unclear."}
Same moment, simpler: deploy steps + live-env prerequisites.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a plan for how this feature gets deployed to where real users will use it? Share it with me so we can check if anything\'s missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship; deploy plan unclear."}
Lighter: deploy plan exists?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you know how this feature is going to be deployed, or is the deployment still not planned out?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Pre-ship."}
Minimum next step: deployment planned or undefined.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DEPENDENCY_MGMT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DEPENDENCY_MGMT",
  question:      'Added packages — any issues checked?',
  pinchFallback: 'Dependency risk.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPENDENCY_MGMT'],
  L1: [
    {
      option: '1. Look at the new packages that were added while building this feature.\n2. Share with me: do any of them have known problems, or did you just install them because they looked like what you needed?\n3. Then check: do they work alongside everything else that\'s already installed, or could they cause a conflict?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I installed some packages while building this but I didn't check them for problems."}
The new-package check hasn't been done.
Walk me through it: known-problem audit + conflict-with-existing check.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the packages added in what was just built — are they the right ones for the job, and have you checked if there are any known problems with the versions you installed? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Packages added; right-fit + known-problem check not done."}
Same moment, simpler: right-fit for job + known-problem check on installed versions.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything about the packages added in what was just built that could cause a problem — like a conflict with existing packages or a known security issue? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added; problem-screen not done."}
Lighter: conflict or known-security-issue screen.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have the new packages added in what was just built been checked to make sure they don\'t cause any conflicts or known issues?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Packages added."}
Minimum next step: conflicts or known-issues on new packages.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_PHASE_TRANSITION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_PHASE_TRANSITION",
  question:      'Been in this phase a while — what comes next?',
  pinchFallback: 'Phase check.',
  L1: [
    {
      option: '1. Think about what phase of development this project is currently in.\n2. Share with me: have you finished what you set out to do in this phase, or are you still in the middle of it?\n3. Then tell me: what needs to be done before it makes sense to move on to the next phase?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long time in this phase; I haven't paused to check where we actually are."}
The phase-status check hasn't been done.
Walk me through: current phase / done or still mid / what's left before moving on.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through where this project stands right now — are you still in the middle of the current phase, or have you finished it without realising it? Share what still needs to be done before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long phase; where-we-stand walk-through not done."}
Same moment, simpler: where we stand / mid or finished / what's left.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in this project that needs to be finished or decided before moving to the next phase? Share what you think is still missing with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase."}
Lighter: anything still needed before next phase — share what's missing.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is this project ready to move to the next phase, or are there things that should be finished first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long phase."}
Minimum next step: ready or things-to-finish-first?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SPEC_CROSS_CONFIRM",
  question:      'Spec exists — has it been checked against the plan?',
  pinchFallback: 'Spec not confirmed.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_CROSS_CONFIRM'],
  L1: [
    {
      option: '1. Read through this project\'s spec and check: does everything in it come from something that was actually decided or agreed on?\n2. Share with me: is there anything in the spec that looks like an assumption rather than a confirmed requirement?\n3. Then tell me: is there anything that could be misunderstood or built in the wrong way because it\'s not specific enough?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have a spec but I'm not sure everything in it was actually agreed on or specific enough."}
Spec-vs-actually-agreed check hasn't been done.
Walk me through it: does everything trace back to a real decision, anything that looks like an assumption, anything not specific enough to build correctly?
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through this project\'s spec and tell me — is there anything in it that you\'re not sure was actually agreed on, or anything that\'s vague enough to be confusing? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spec present; assumption-vs-confirmed not separated."}
Same moment, simpler: anything in the spec I'm not sure was actually agreed, or anything vague enough to confuse?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in this project\'s spec that might be an assumption rather than something that was actually confirmed? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present; assumption check not done."}
Lighter: anything in the spec that might be an assumption rather than confirmed.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in this project\'s spec that hasn\'t been checked against what was actually agreed on?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present."}
Minimum next step: anything in the spec not checked against what was actually agreed.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SPEC_REVISION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SPEC_REVISION",
  question:      'Spec written — has it been updated since the first draft?',
  pinchFallback: 'Spec unrevised.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SPEC_REVISION'],
  L1: [
    {
      option: '1. Look at this project\'s spec and then look at what has actually been built so far.\n2. Share with me: are they still in sync, or have things changed since the spec was first written?\n3. Then tell me: what would need to be updated in the spec to make it match what\'s actually happening?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building from a spec but the spec hasn't been updated as things change."}
Spec-vs-build sync check hasn't been done.
Walk me through it: spec + build side-by-side, are they still in sync, what would need updating to make spec match what's happening?
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through this project\'s spec and tell me — is it still accurate, or have things changed since it was first written that aren\'t in there yet? Share what\'s out of date with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Spec present; current-accuracy unclear."}
Same moment, simpler: is the spec still accurate or out of date?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is this project\'s spec still accurate, or has something changed since it was written that isn\'t reflected in it yet? Share what you find with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present; recent changes not reflected."}
Lighter: anything changed since the spec was written and not in it yet?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does this project\'s spec still match what\'s actually being built, or is it out of date?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Spec present."}
Minimum next step: does the spec still match what's actually being built?
{R4_CLOSE}`,
    },
  ],
};

// ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────────

// Group A — idea signals (beginner)

export const ABSENCE_IDEA_SCOPING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_IDEA_SCOPING",
  question:      'Idea forming — what exactly are we building?',
  pinchFallback: 'Scope unclear.',
  L1: [
    {
      option: '1. Help me describe this project in plain words — what it does and what problem it solves.\n2. Share your description with me before we go further so I can check it sounds right.\n3. Then tell me: is there anything about what we\'re building that\'s still unclear or not decided yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm forming an idea but haven't described it in plain words yet."}
The plain-words description hasn't been done.
Walk me through: what it does / what problem it solves / what's still unclear.
{R4_CLOSE}`,
    },
    {
      option: 'Describe this project in plain language — what it does, what problem it solves, and what we\'re building first. Share your answer with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; plain-language description not done."}
Same moment, simpler: plain-language description — what / problem / building first.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Describe this project to me in two sentences: what it does, and what it\'s for. Share it with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: 2-sentence description — what + what for.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is it clear what this project is and what it\'s supposed to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: is it clear what / what for?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_IDEA_CONSTRAINT_CHECK",
  question:      'Idea forming — what\'s out of scope?',
  pinchFallback: 'No non-goals set.',
  L1: [
    {
      option: '1. Think about this project — what is it NOT going to do?\n2. Share a list of at least two things we\'re leaving out of this project on purpose, even if they seem obvious.\n3. Then tell me: why is it helpful to say those things out loud now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; will-not-do list not made."}
The will-not-do list hasn't been made.
Walk me through: 2+ deliberate omissions / why saying them out loud helps now.
{R4_CLOSE}`,
    },
    {
      option: 'Help me list the things this project is NOT going to do — at least two. Share the list with me before we go further.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; will-not-do list not shared."}
Same moment, simpler: 2+ will-not-do items shared back.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s one thing this project won\'t do? Share your answer with me and tell me why it\'s good to state that now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: one won't-do + why-state-now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything this project won\'t do that we haven\'t said out loud yet?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: any will-not-do still unsaid.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IDEA_USER_DEFINITION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_IDEA_USER_DEFINITION",
  question:      'Idea forming — who is this actually for?',
  pinchFallback: 'User not defined.',
  L1: [
    {
      option: '1. Think about who will use this project — who is the main person it\'s for?\n2. Share a description of that person with me: who they are and what they\'re trying to do.\n3. Then tell me: what does that mean for how we build this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; main-user description not done."}
The main-user description hasn't been done.
Walk me through: who / what they're trying to do / what that means for how we build.
{R4_CLOSE}`,
    },
    {
      option: 'Describe the person who will use this project in plain words — who they are and what they need it to do. Share your description with me before we go further.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Idea forming; plain-words user description not shared."}
Same moment, simpler: plain-words who-they-are and what-they-need.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who is this project for? Describe that person to me in a sentence or two, then share it with me so I can check it sounds right.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Lighter: 1-2 sentence user description shared back.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is it clear who this project is for and what they\'re trying to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Idea forming."}
Minimum next step: is it clear who + trying-to-do?
{R4_CLOSE}`,
    },
  ],
};

// Group B — task_breakdown signals (beginner)

export const ABSENCE_TASK_ORDERING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_TASK_ORDERING",
  question:      'Tasks listed — what order do we do them in?',
  pinchFallback: 'No order set.',
  L1: [
    {
      option: '1. Look at the tasks for this project.\n2. Share with me: which one should we do first, and which ones can\'t be done until something else is finished?\n3. Then tell me: what\'s the order we should follow to build this?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have tasks but haven't put them in order yet."}
The task ordering hasn't been done.
Walk me through: which first / which can't start yet / overall order to follow.
{R4_CLOSE}`,
    },
    {
      option: 'Put the tasks for this project in order — which one goes first? Share the order with me before we start building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tasks unordered."}
Same moment, simpler: order them — which first — share before building.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the first task to work on for this project? Tell me what it is and why it should come first, then share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks unordered."}
Lighter: first task + why-first — share it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is the order of tasks for this project clear, or does anything still need to be sorted out?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks unordered."}
Minimum next step: order clear or still to sort?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_SIZING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_TASK_SIZING",
  question:      'Tasks listed — are they small enough to do in one go?',
  pinchFallback: 'Tasks too big.',
  L1: [
    {
      option: '1. Look at the tasks for this project.\n2. Share with me: is there any task that feels too big to finish in one sitting?\n3. Then tell me: how would you split that task into smaller pieces that are easier to finish one at a time?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I haven't checked if any tasks feel too big to finish in one sitting."}
The too-big-to-finish-in-one-sitting check hasn't been done.
Walk me through: any too-big / split it into easier-one-at-a-time pieces.
{R4_CLOSE}`,
    },
    {
      option: 'Are any tasks in this project too big to do in one session? Share which ones feel too large, and let\'s figure out how to break them down.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Task sizing not checked."}
Same moment, simpler: which feel too large + break-down plan.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Pick the biggest task for this project. Share it with me, and then tell me how you\'d split it into smaller steps that could each be finished in one sitting.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks defined."}
Lighter: biggest task + split-into-single-sitting-steps.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Are all the tasks for this project small enough to finish one at a time, or do any of them need to be broken down more?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks defined."}
Minimum next step: all small enough vs any-needing-break-down.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_TASK_DEFINITION_OF_DONE",
  question:      'Tasks set — how do we know when each one\'s done?',
  pinchFallback: 'Done criteria missing.',
  L1: [
    {
      option: '1. Pick one task from this project.\n2. Share with me: how would you know when that task is finished? What would you check?\n3. Then do the same for each of the other tasks — for each one, tell me what \'done\' looks like.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I have tasks but haven't said per task how I'd know each is done."}
The per-task done-check hasn't been pinned.
Walk me through: pick one / how to know finished / what to check / repeat for each.
{R4_CLOSE}`,
    },
    {
      option: 'For each task in this project, help me write one sentence about what \'done\' means — something you could check to know the task is finished. Share the list with me when you\'re done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Per-task DoD list not written."}
Same moment, simpler: per-task one-sentence DoD list — checkable.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Pick the first task for this project and tell me: how would you know it\'s finished? Share your answer with me before we start building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks defined."}
Lighter: first-task DoD before building.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is it clear how we\'ll know when each task in this project is done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Tasks defined."}
Minimum next step: per-task done clarity check.
{R4_CLOSE}`,
    },
  ],
};

// Group C — feedback_loop signals (beginner)

export const ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_USER_FEEDBACK_REVIEW",
  question:      'Feedback in — have we actually gone through it?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    {
      option: '1. Look at the feedback users have given about this project.\n2. Share with me: what are the most common things people are saying? What keeps coming up?\n3. Then tell me: what\'s the one piece of feedback that feels most important to address?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback in; I haven't gone through it yet."}
The feedback walk-through hasn't been done.
Walk me through: most common + most important to address.
{R4_CLOSE}`,
    },
    {
      option: 'Go through the feedback for this project and share what you find — what are users saying? Pick the most important thing they mentioned and tell me what it is.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback not gone through."}
Same moment, simpler: what users say + most important mention.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the most important piece of feedback about this project? Share it with me and tell me why it matters.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Lighter: most important feedback + why-matters.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have you gone through the feedback for this project yet, or is that still to do?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Minimum next step: gone-through or still-to-do?
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ITERATION_PLANNING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ITERATION_PLANNING",
  question:      'Feedback reviewed — what are we building next?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    {
      option: '1. Look at the feedback for this project.\n2. Share with me: what\'s the most important thing users want fixed or added?\n3. Then tell me: what would you work on first in the next version, and why?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feedback in; haven't decided what to build next."}
The what-to-build-next decision hasn't been made.
Walk me through: most important user ask + what to work on first + why.
{R4_CLOSE}`,
    },
    {
      option: 'Based on what users said about this project, what do you want to fix or build next? Share your top pick with me before we start planning.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Top next-iteration pick not shared."}
Same moment, simpler: top next-iteration pick shared before planning.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the first thing to fix or build in the next version of this project based on the feedback? Share your answer with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Lighter: first next-version item from feedback.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is it clear what to work on next for this project based on what users said?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feedback in."}
Minimum next step: clear-what-next or still-deciding?
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 5 D1-D3 — beginner signals (BEGINNER register) ─────────────────────

export const ABSENCE_INCREMENTAL_BUILD_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_INCREMENTAL_BUILD",
  question:      'Building something — verifying each piece as you go?',
  pinchFallback: 'One piece at a time.',
  L1: [
    {
      option: '1. Before adding the next thing — quickly test what was just built.\n2. Share with me: does it do what you expected, or is something off?\n3. Then tell me: is it safe to move on, or should we fix something first?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building piece by piece; I haven't tested the last piece yet."}
The pre-next-piece test hasn't been done.
Walk me through: quick test / works-as-expected or off / safe-to-move-on or fix-first.
{R4_CLOSE}`,
    },
    {
      option: 'Test the part that was just built before adding anything else — tell me if it works the way you expected, and share what you find.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Last-piece test not done."}
Same moment, simpler: test last piece / share findings.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built work the way it should? Try it and tell me before we add anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building piece by piece."}
Lighter: try-it-before-more.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is what was just built working before we continue?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building piece by piece."}
Minimum next step: working-before-continuing check.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ERROR_UNDERSTANDING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ERROR_UNDERSTANDING",
  question:      'Got an error — do you know what it means?',
  pinchFallback: 'Understand the error.',
  L1: [
    {
      option: '1. Before asking to fix this error — read the error message carefully.\n2. Share with me: what do you think it\'s saying went wrong?\n3. Then tell me: does your explanation match where the problem is in the code?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Got an error; about to ask to fix it without understanding it."}
The error message hasn't been read and explained — fixing without understanding leads to repeating the same class of error.
Walk me through: read carefully / what it's saying / does explanation match code location.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the error message — what does it say, where is it pointing, and what do you think caused it? Share your understanding before we fix anything.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Got an error; understanding-before-fix not shared."}
Same moment, simpler: walk-through of message + understanding-before-fix.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What do you think this error means? Share your best guess with me — even if you\'re not sure — before we fix it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Got an error."}
Lighter: best-guess meaning before fix.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you understand what this error is telling you, or does it need more explaining before we fix it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Got an error."}
Minimum next step: understand-or-needs-explaining check.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DOCUMENTATION_BEFORE_ASK",
  question:      'About to ask — have you checked the docs?',
  pinchFallback: 'Docs first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DOCUMENTATION_BEFORE_ASK'],
  L1: [
    {
      option: '1. Before asking me this question — check the official documentation for this library or API.\n2. Share with me: what did you find, and is the answer there?\n3. Then ask me what you still couldn\'t find in the docs.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to ask without first checking the official documentation."}
An official-docs check before asking hasn't been shared.
Let's check the docs first; share what we find; then we'll handle anything not in them.
{R4_CLOSE}`,
    },
    {
      option: 'Look up the official docs for what you\'re asking about, then share what you found — I\'ll fill in anything the docs didn\'t make clear.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to ask without looking up the official docs for this topic."}
The official-docs lookup walkthrough hasn't been shared.
Let's look up the official docs together; share what we found; clarify what was unclear.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there official documentation for what you\'re asking about? Check it first and share what you find — then tell me what\'s still unclear.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Haven't checked official docs for the topic I'm about to ask about."}
The docs-first check hasn't been done.
Let's check the docs first; tell me what's still unclear after.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have you checked the documentation for this before asking?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ask a question."}
Minimum next step: docs check before asking.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_OUTPUT_VERIFICATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_OUTPUT_VERIFICATION",
  question:      'Code generated — have you actually tried it?',
  pinchFallback: 'Test it first.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OUTPUT_VERIFICATION'],
  L1: [
    {
      option: '1. Before moving on from what was just built — actually run it or try it.\n2. Share with me: does it behave the way you expected?\n3. If anything looks off, tell me what happened and we\'ll look at it together.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Code was generated for me but I haven't actually tried running it."}
Whether the generated code actually works hasn't been verified.
Walk me through it: run or try it, share what happens vs what I expected, then we look at anything off together.
{R4_CLOSE}`,
    },
    {
      option: 'Try what was just built and share what happens — does it do what you expected, or is something different?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Code generated; not tried yet."}
Same moment, simpler: try it and tell me what happens.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Have you run or tried what was just built? Tell me what it does when you use it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Code generated; not tried."}
Lighter: have I actually run or tried it, and what does it do when I do?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Have you actually tested what was just built to see if it works?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Code generated."}
Minimum next step: actually test it to see if it works.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_REQUIREMENT_CLARITY_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_REQUIREMENT_CLARITY",
  question:      'About to build — is the requirement clear?',
  pinchFallback: 'Clarify first.',
  L1: [
    {
      option: '1. Before I build this — tell me specifically what you want it to do.\n2. Share with me: what does it look like when it\'s working correctly?\n3. Then tell me: what should NOT happen — is there anything it should avoid doing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to build but haven't said specifically what 'working' looks like."}
What 'working' looks like hasn't been described — building proceeds without a target.
Walk me through: what to do specifically / what working looks like / what should NOT happen.
{R4_CLOSE}`,
    },
    {
      option: 'Describe what you want built in your own words — what it should do, and how you\'d know it\'s working right. Share that with me before we start.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building this; plain-words description not shared."}
Same moment, simpler: plain-words description — what + how-I'd-know-working.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What exactly should this do, and how will you know when it\'s working? Be specific — not just "make it work" but what does "working" look like.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Lighter: exact-do + working-looks-like — specific, not 'make it work'.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What do you want this to do? In plain words — what\'s the goal?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Minimum next step: plain-words goal.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_COPY_PASTE_AWARENESS_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_COPY_PASTE_AWARENESS",
  question:      'Code generated — do you understand it before using it?',
  pinchFallback: 'Understand first.',
  L1: [
    {
      option: '1. Before adding the generated code to your project — read through it.\n2. Share with me: what does each part do in plain words?\n3. If there\'s a part you\'re not sure about, point it out and we\'ll go through it together before it goes in.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to paste generated code without reading it for understanding."}
Generated code hasn't been read for understanding — using code one can't explain creates future-debugging debt.
Walk me through: read through / plain-words per part / point out unsure parts.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through the code that was just generated — what does it do and how does it work? Share your understanding before we add it to the project.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Generated code about to be added."}
Same moment, simpler: walk-through of generated + understanding before add.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any part of the code that was just generated that you\'re not sure you understand? Point it out and we\'ll go through it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated code reviewed."}
Lighter: any-unsure parts to walk through together.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do you understand what the generated code does before adding it to your project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Generated code."}
Minimum next step: understand-before-add check.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DEBUGGING_OBSERVATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DEBUGGING_OBSERVATION",
  question:      'Something\'s broken — what did you actually see?',
  pinchFallback: 'Describe it first.',
  L1: [
    {
      option: '1. Before I look at the bug — describe what happened.\n2. Share with me: what did you expect to happen, and what actually happened instead?\n3. Then tell me: is there an error message, and if so, what does it say?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Something's broken; haven't described what I saw vs expected."}
What happened vs expected hasn't been described — fixing without observation guesses at the bug.
Walk me through: what happened / expected vs actual / error message text.
{R4_CLOSE}`,
    },
    {
      option: 'Walk me through what\'s broken — what did you expect to happen, what actually happened, and what error or weird behaviour did you see? Share that with me and we\'ll figure it out.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Something's broken; symptom-vs-expectation not shared."}
Same moment, simpler: walk-through — expected / actual / error or weird behaviour.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What happened when you ran this? Describe what you expected vs what you actually saw — I need to know the difference before we fix it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Something's broken."}
Lighter: expected-vs-actual delta before fix.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What exactly went wrong — what did you see happen, and what were you expecting?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Something's broken."}
Minimum next step: what-went-wrong + saw vs expected.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_LEARNING_CONSOLIDATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_LEARNING_CONSOLIDATION",
  question:      'We\'ve built a lot — do you feel like you understood it?',
  pinchFallback: 'Recap learning.',
  L1: [
    {
      option: '1. We\'ve covered a lot in this session — take a moment and think about what you actually learned.\n2. Share with me: what\'s the most important thing you now understand that you didn\'t before?\n3. Then tell me: is there anything we covered that still feels unclear or confusing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session of building; haven't paused to recap what I learned."}
Session learning hasn't been recapped — built code without understanding becomes a maintenance problem.
Walk me through: think about learned / most important now-understood / what still unclear.
{R4_CLOSE}`,
    },
    {
      option: 'Recap what you learned in this session in your own words — what did we build, how does it work, and what new thing do you understand now that you didn\'t before? Share that with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; recap-in-own-words not done."}
Same moment, simpler: own-words recap — built / how-it-works / new-understanding.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the one thing from this session that you feel like you actually understood — not just copied, but actually understood? Share it with me.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Lighter: one-thing actually-understood (not just copied).
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there something we built in this session that you\'re confident you understand well enough to explain to someone else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Minimum next step: anything understood well enough to explain to someone else.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SIMPLE_SOLUTION_FIRST",
  question:      'Building this — is there a simpler way to do it?',
  pinchFallback: 'Simplest first.',
  L1: [
    {
      option: '1. Before building something complex — ask: is there a simpler way to get the same result? The simplest solution that works is almost always the right one to start with.\n2. Share what you\'re trying to do in plain terms. Let\'s find the simple version first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to build complex; simpler-first not asked."}
Simple-first solution hasn't been tried — complexity-first creates code that can't be unsimplified.
Walk me through: simpler way to same result? / what I'm trying to do, plain terms.
{R4_CLOSE}`,
    },
    {
      option: 'The KISS principle in engineering: if the simple solution works, use it. You can always make things more complex later — you can\'t unsimplify them. What\'s the simplest version of what you\'re building?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to build; KISS check not done."}
Same moment, simpler: KISS — simplest version of what's being built.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a simpler way to do this? Describe what you need — let\'s find the smallest solution.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Lighter: simpler way + smallest solution.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the simplest way to get this done? Start there.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Minimum next step: simplest way to get this done.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING",
  question:      'Asking a lot at once — let\'s do one thing at a time',
  pinchFallback: 'One thing at a time.',
  L1: [
    {
      option: '1. When you send several things at once, the results get messy and hard to check. Try focusing on just one thing per message.\n2. What\'s the most important thing to do right now? Start with that — then we\'ll move to the next.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I'm asking several things at once; single-responsibility prompting not applied."}
Single-responsibility prompting hasn't been applied — multiple things asked in one message make responses harder to verify and harder to fix.
Walk me through: one thing per message / most important to do right now / then next.
{R4_CLOSE}`,
    },
    {
      option: 'One task per message works better than many — it\'s easier to see if it worked, easier to fix if it didn\'t, and easier to understand what happened. What\'s the single next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Combined requests becoming hard to verify."}
Same moment, simpler: one-task-per-message — easier to see/fix/understand.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the one thing to do right now? Focus on that first — we\'ll do the rest after.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Asking multiple things."}
Lighter: one-thing-right-now + focus + then-rest.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'One thing at a time — what\'s the most important next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Asking multiple things."}
Minimum next step: most important single-next-step.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ROLLBACK_AWARENESS_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ROLLBACK_AWARENESS",
  question:      'About to change things — do you know how to undo it?',
  pinchFallback: 'Save before changing.',
  L1: [
    {
      option: '1. Before making a big change to your code — do a git commit first. This saves a snapshot you can always go back to if something breaks.\n2. Not sure how? Try: git add . then git commit -m \'working before change\'. Then make your change safely.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to make a big change without saving current state."}
Current working state hasn't been committed to git — change-without-snapshot leaves no return path.
Walk me through: git commit first / git add . + git commit -m 'working before change' / then change safely.
{R4_CLOSE}`,
    },
    {
      option: 'Git is your safety net. Always commit a working version of your code before changing something significant. If the change breaks everything, you can get back to where things worked with one command.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Big change pending; safety-net commit not done."}
Same moment, simpler: git as safety net — commit working before significant change.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Do a git commit before making this change — save a working snapshot first, then change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to change code."}
Lighter: commit + snapshot before change.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Commit your current code before changing it — so you can get back if needed.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to change code."}
Minimum next step: commit before change.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_BUILD_VS_UNDERSTAND_RATIO",
  question:      'We\'ve been building — do you understand what we\'ve built?',
  pinchFallback: 'Pause and understand.',
  L1: [
    {
      option: '1. We\'ve added a lot of code — can you explain in your own words what it does? Even a rough description is fine.\n2. Understanding what you\'ve built is as important as building it. Code you don\'t understand becomes a problem you can\'t fix later.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Lots of code added; understanding-of-built not verified."}
Built code understanding hasn't been verified — code one can't explain becomes a problem one can't fix.
Walk me through: explain in own words / understanding as important as building.
{R4_CLOSE}`,
    },
    {
      option: 'Pick one part of what we just built and walk me through what it does. Not how I explained it — how YOU understand it. This is how you turn building into learning.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Lots built; one-part walk-through-in-own-words not done."}
Same moment, simpler: pick one part / own-understanding walk-through / building-into-learning.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Can you explain in your own words what the code we just wrote does? Take a moment.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Lots built."}
Lighter: own-words explanation of what was written.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Walk me through what we just built — in your own words.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Lots built."}
Minimum next step: own-words walk-through.
{R4_CLOSE}`,
    },
  ],
};


// ── Sub-7 — beginner content sets ─────────────────────────────────────────────

export const ABSENCE_SCOPE_CREEP_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SCOPE_CREEP",
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    {
      option: '1. Look at what was just built and make a list of everything it does now. 2. Compare that list to what you originally planned to build. 3. Share anything that wasn\'t in the original plan with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I haven't checked whether anything extra got added beyond the original plan."}
The original-plan-vs-now check hasn't been done.
Walk me through: list of what it does now / compare to original / share extras.
{R4_CLOSE}`,
    },
    {
      option: 'Go through this feature and check — did anything extra get added that wasn\'t part of the original plan? Share what you find with me before we keep going.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Extras-check not done."}
Same moment, simpler: extras-check shared before continuing.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in this feature that you didn\'t originally plan to build? Tell me what it is and we\'ll decide what to do with it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Lighter: any unplanned items — decide together.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Can you name one thing in this feature that ended up there but wasn\'t part of the original plan?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Build progressed."}
Minimum next step: name one extra item.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CONTEXT_LOSS_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_CONTEXT_LOSS",
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    {
      option: '1. Think about everything we\'ve done with what was just built this session. 2. Write down what\'s working and what still needs to be done. 3. Share that with me before we keep going — it\'ll help us stay on track.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session and I haven't paused to think about where we are with this feature."}
Where we are with this feature hasn't been thought through.
Walk me through it: review the session, write down what's working / what's still to do, share so we stay on track.
{R4_CLOSE}`,
    },
    {
      option: 'Take a moment and catch up on this project — what have we built so far, what choices did we make, and what\'s next? Share your summary with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; project catch-up not done."}
Same moment, simpler: catch-up summary — built / choices / what's next.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Can you tell me where this feature is right now in your own words — what\'s done and what still needs to happen?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session; feature status unclear."}
Lighter: where this feature is — in plain words.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one thing you want to make sure we don\'t forget about where this project is right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Minimum next step: the one thing I don't want us to forget right now.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_API_DESIGN_REVIEW_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_API_DESIGN_REVIEW",
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_API_DESIGN_REVIEW'],
  L1: [
    {
      option: '1. Look at what was just built and check whether it could break anything that\'s already using this API. 2. List any changes to how it works — what it expects and what it sends back. 3. Share your list with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built API endpoints but I haven't checked if they might break things already using the API."}
Breaking-change check on the API hasn't been done.
Walk me through it: changes to how endpoints work, what they expect, what they return — anything that'd surprise existing callers?
{R4_CLOSE}`,
    },
    {
      option: 'Go through this feature\'s API and check — could anything about how it works change after other code starts depending on it? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; change-stability unclear."}
Same moment, simpler: could anything about how it works change after other code depends on it?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built change the API in a way that might break something that\'s already using it? Tell me what changed and we\'ll figure out if it\'s a problem.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Lighter: any change in the API that might break something already using it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one thing about how this feature\'s API works that might need to change later — and could that cause a problem for anything depending on it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Minimum next step: one thing about the API that might need to change later + risk to dependents.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ACCESSIBILITY_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ACCESSIBILITY",
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ACCESSIBILITY'],
  L1: [
    {
      option: '1. Go through what was just built and check that every button and link has a clear label describing what it does. 2. Try tabbing through the whole feature using only the keyboard — no mouse. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built UI without checking labels on buttons and links, and without trying keyboard-only navigation."}
A clear-label + keyboard-only walkthrough hasn't been shared together.
Let's go through it: every button and link has a clear label; tab through with keyboard only; share what we find before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'Think about someone who can\'t see the screen trying to use this feature — would a screen reader be able to tell them what everything does? Go through it and share what you notice with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Didn't think about how someone who can't see the screen would use this feature."}
The screen-reader user-perspective walkthrough hasn't been shared.
Let's imagine someone using a screen reader; go through the feature; share what we notice (announced clearly vs silent / confusing).
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Can you go through this feature and find one thing that someone with a disability might struggle to use — and tell me what it is?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Didn't check what a user with a disability might struggle with."}
A disability-impact spot check hasn't been done.
Let's find one thing someone with a disability might struggle to use and identify it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that someone might have trouble using if they couldn\'t use a mouse or couldn\'t see the screen clearly?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built the UI."}
Minimum next step: anything mouse-only or sight-dependent that could trouble some users.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_ENV_AND_SECRETS_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_ENV_AND_SECRETS",
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ENV_AND_SECRETS'],
  L1: [
    {
      option: '1. Go through what was just built and check — are any passwords, API keys, or other secrets written directly in the code? 2. If they are, those need to be moved to a separate `.env` file. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I used some passwords and API keys while building but I haven't checked if they're hardcoded."}
The hardcoded-secrets check hasn't been done.
Walk me through it: find inline secrets + move to \`.env\` + share what's found.
{R4_CLOSE}`,
    },
    {
      option: 'Check whether this feature has a `.env.example` file that lists every secret or config value it needs to run — without the real values. Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature uses env vars; .env.example status unclear."}
Same moment, simpler: \`.env.example\` lists every required secret/config?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there a password, API key, or any other secret in what was just built that\'s written directly into the code? Tell me what it is and we\'ll figure out how to move it somewhere safe.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses credentials; inline-secret check not done."}
Lighter: any inline secret in source.
Still, before you move any inline secret out of source you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one secret or password this feature uses — and where is it stored right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature uses credentials."}
Minimum next step: one secret + its current storage location.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_DATA_VALIDATION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DATA_VALIDATION",
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DATA_VALIDATION'],
  L1: [
    {
      option: '1. Think about what happens in this feature if someone sends the wrong data — a missing field, a number where text is expected, or something completely unexpected. 2. Try sending some bad data and see what happens. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built input handling without trying bad data to see what happens."}
A bad-data behavior probe hasn't been done together.
Let's try sending some bad data (missing field / wrong type / unexpected value); see what happens; share findings before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'Go through what was just built and check — is there anything checking that the data coming in is actually in the right format before the app tries to use it? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Didn't check that incoming data is in the right format before the app uses it."}
The right-format input check hasn't been shared.
Let's go through and check whether anything verifies incoming data shape before use; share what we find before continuing.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What happens in this feature if someone sends a missing or wrong value — does it give a clear error message, or does it just break? Try it and tell me what you see.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Didn't try sending a missing or wrong value to see what happens."}
The missing / wrong-value behavior probe hasn't been done.
Let's try it; tell me whether it gives a clear error or just breaks.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one piece of data this feature accepts that isn\'t being checked before it gets used?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: one piece of data accepted without being checked first.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CI_PIPELINE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_CI_PIPELINE",
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CI_PIPELINE'],
  L1: [
    {
      option: '1. Check whether this project has anything set up to run the tests automatically whenever code is pushed. 2. If not, this is a good time to set that up so mistakes get caught before they reach the final code. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been pushing code but I haven't checked if tests run automatically."}
Auto-test-on-push hasn't been set up or verified.
Walk me through it: check current status + set up if missing.
{R4_CLOSE}`,
    },
    {
      option: 'Go through what happens when code gets pushed to this feature — do the tests run automatically, or does someone have to remember to run them by hand? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Project; auto-vs-manual test trigger unclear."}
Same moment, simpler: tests run auto on push or manual?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this project have something that automatically runs the tests whenever code is pushed — and does it stop bad code from getting merged if the tests fail?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Project; CI status unclear."}
Lighter: CI auto-tests + bad-merge block.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything that runs automatically when new code is added to this project — like the tests? Tell me what happens and we\'ll figure out if anything is missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Project."}
Minimum next step: anything that runs auto on new code; any gaps.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_RATE_LIMITING_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_RATE_LIMITING",
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_RATE_LIMITING'],
  L1: [
    {
      option: '1. Think about what would happen if someone sent a huge number of requests to this feature very quickly. 2. Check whether the app has any limit on how many times it can be called in a short period. 3. Share what you find with me before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I built an API endpoint but I haven't set any limit on how often it can be called."}
A request limit hasn't been set.
Walk me through it: hammer-traffic scenario + current limit status + add if missing.
{R4_CLOSE}`,
    },
    {
      option: 'Go through what was just built and check — if someone calls this API endpoint hundreds of times in a row, does the app handle that, or would it start having problems? Share what you find with me before we move on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "API present; hammer-test not done."}
Same moment, simpler: hundreds-of-requests handling + problem-points.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this feature have any kind of limit on how many times someone can call it in a short period — and what happens if they go over that limit?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present; limit + over-limit behaviour unclear."}
Lighter: limit + over-limit behaviour status.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s one way someone could use this feature too much — and is there anything currently stopping that from happening?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "API present."}
Minimum next step: one overuse path + current prevention.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_FEATURE_SCOPE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_FEATURE_SCOPE",
  question:      'Building this — what should it actually do?',
  pinchFallback: 'Scope first.',
  L1: [
    {
      option: '1. Before we keep going — help me describe in plain words what this part of the app should do and what \'finished\' looks like for it.\n2. Share that back with me so we\'re both on the same page.\n3. Then tell me: is there anything about what I want that is still unclear to you?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building this part of the app but I haven't said clearly what it should do."}
The plain-words description + finished-state hasn't been done.
Walk me through: what it should do / what finished looks like / what's still unclear.
{R4_CLOSE}`,
    },
    {
      option: 'Help me write one sentence about what we\'re building right now and how I\'d know it\'s done — then share it with me before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "What we're building + done-check unwritten."}
Same moment, simpler: one-sentence what + how-I'd-know-done.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the one thing this part of the app is supposed to do — and how will I know when it\'s working the way I want? Share your answer with me first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Lighter: one thing it does + how-I'd-know-working.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'In plain words — what exactly are we building here and how will we know it\'s done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Feature in progress."}
Minimum next step: plain-words what + how-done.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_IMPLEMENTATION_CHECKPOINT",
  question:      'Built something new — does it actually work?',
  pinchFallback: 'Quick check.',
  L1: [
    {
      option: '1. Before adding anything else — can you quickly try out what was just built?\n2. Tell me: does it do what we expected, or is something not working yet?\n3. If something\'s off, let\'s fix it before we keep going — it\'s easier to catch now than after more code is added on top.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Built something but haven't tried it yet."}
The quick try-it hasn't been done.
Walk me through: try it / does it work as expected / fix-before-more if off.
{R4_CLOSE}`,
    },
    {
      option: 'Try what was just built and share what happens — does it work the way we want it to? One quick test before we continue building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Quick test on last build not done."}
Same moment, simpler: try it / share what happens / continue-or-fix.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does what was just built actually work? Try it and tell me what you see before we add anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built something new."}
Lighter: try and tell me before more.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Does this work yet? Quick check before we keep building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built something new."}
Minimum next step: quick check before continuing.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SPEC_BEFORE_CODE_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SPEC_BEFORE_CODE",
  question:      'Coding this — what\'s it supposed to do?',
  pinchFallback: 'Spec first.',
  L1: [
    {
      option: '1. Before we write more code — describe in plain words what this is supposed to do.\n2. What should happen when it works correctly? Share that with me first.\n3. Then we\'ll write it — having that clear makes the code much simpler.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Coding this but haven't said in plain words what it's supposed to do."}
The plain-words what-it-should-do hasn't been said.
Walk me through: what it's supposed to do / what happens when correct / then write.
{R4_CLOSE}`,
    },
    {
      option: 'Tell me what you want this to do — in plain English, step by step — before we start coding it. What happens when it works? Share that first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Plain-English step-by-step unwritten."}
Same moment, simpler: plain-English step-by-step + what-happens-when-works.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What should this do and how will I know it\'s working? Describe it in plain words before we write the code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Lighter: what it should do + how-I'd-know-working.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'In plain words — what should this do? Tell me before we start coding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this."}
Minimum next step: plain-words what-it-should-do.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 7 F1-F2 — session-quality signals (BEGINNER register) ───────────────

export const ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DECISION_FATIGUE_PATTERN",
  question:      'Accepting without reviewing — applied critical check recently?',
  pinchFallback: 'Streak alert.',
  L1: [
    {
      option: 'Look back at the last few suggestions made — is there anything that looks right but you have not double-checked?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been accepting recent suggestions without double-checking them."}
The double-check on recent suggestions hasn't been done.
Look back at recent suggestions for anything not yet double-checked.
{R4_CLOSE}`,
    },
    {
      option: 'Review what was built recently and identify one thing to verify or question before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Recent session work; one-thing-to-verify not flagged."}
Same moment, simpler: review recent and identify one thing to verify or question.
{R4_CLOSE}`,
    },
    {
      option: 'Check the last few responses: is there anything you would like to confirm is correct before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Last few responses; confirm-correctness check not done."}
Same moment, deeper: confirm-correctness check on recent responses.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there anything in the recent suggestions you would like to double-check before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Recent session work."}
Lighter: anything in recent session work to double-check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Pick one thing from the recent responses to verify before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Recent session work."}
Minimum next step: one thing to verify before continuing.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_WORK_RHYTHM_CHECK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_WORK_RHYTHM_CHECK",
  question:      'Sending fast — read the last response fully before continuing?',
  pinchFallback: 'Slow down.',
  L1: [
    {
      option: 'Read the last response carefully before continuing — is there anything that looks right but you have not actually checked?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been sending prompts fast without reading the responses carefully."}
The careful read on the last response hasn't been done.
Read carefully; spot looks-right-but-not-checked items.
{R4_CLOSE}`,
    },
    {
      option: 'Go back and read the last response — does everything look correct?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Rapid sends; haven't read the last response."}
Same moment, simpler: go back, read, check correctness.
{R4_CLOSE}`,
    },
    {
      option: 'Before continuing: read the last response and verify that everything there is correct.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Rapid sends; pre-continue verify not done."}
Same moment, deeper: pre-continue verify on last response.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Read the last response carefully before sending the next message.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Rapid sends."}
Lighter: careful read before next send.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Pause and read the last response before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Rapid sends."}
Minimum next step: pause and read the last response.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_FOCUS_DRIFT_DETECTION",
  question:      'Working on many things — finished any of them yet?',
  pinchFallback: 'Focus drift.',
  L1: [
    {
      option: 'Let us focus on one thing at a time — what is the most important thing to finish in this session before we start anything new?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been jumping around this session and nothing is finished yet."}
The one-thing-at-a-time discipline hasn't been applied.
Pick the most important thing to finish; complete it; then start new.
{R4_CLOSE}`,
    },
    {
      option: 'Pick the most important thing that is not finished yet and complete it before we continue with anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Multiple open things; pick-and-complete not done."}
Same moment, simpler: pick most important unfinished; complete; then continue.
{R4_CLOSE}`,
    },
    {
      option: 'What is the one thing we should complete right now before starting something else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Multiple opens; one-to-complete-right-now not identified."}
Same moment, deeper: the one thing to complete right now before something else.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the most important thing to finish before we start anything new?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple opens."}
Lighter: most important thing to finish before new start.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Complete one thing before we open anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple opens."}
Minimum next step: complete one before opening anything else.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_SESSION_LENGTH_CHECKPOINT",
  question:      'Working for a while — what have you built so far?',
  pinchFallback: 'Checkpoint due.',
  L1: [
    {
      option: 'Summarize what we have built so far in this session — what is working, what is still in progress, and what we still need to do.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been at this for a while and I haven't summed up what we've built."}
A session summary hasn't been done.
What we built / working / in progress / still to do.
{R4_CLOSE}`,
    },
    {
      option: 'Write a quick update on where we are — what has been done and what still needs to happen.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; update not written."}
Same moment, simpler: quick update — done / still-needs.
{R4_CLOSE}`,
    },
    {
      option: 'What is the current state of what we are building and what comes next?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; current-state unclear."}
Same moment, deeper: current state + what comes next.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the current state of what we are building — what works and what still needs to be done?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Lighter: current state — works / still-needs.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the most important thing to remember about where we are right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Minimum next step: the most important thing to remember about where we are.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_PROGRESS_CONSOLIDATION_GAP",
  question:      'Built a lot — have you written down what you made?',
  pinchFallback: 'Document now.',
  L1: [
    {
      option: 'Write a short note about what we built in this session, even just a few sentences, before we continue.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've built a lot this session and I haven't written any of it down."}
A short note about what we built hasn't been written.
Write a few sentences before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'Add a quick update to the README or a comment in the code describing what was just built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long build run; README/comment update not done."}
Same moment, simpler: README update or code comment describing what was built.
{R4_CLOSE}`,
    },
    {
      option: 'Summarize what was built in this session so the progress is captured somewhere.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long build run; progress not captured."}
Same moment, deeper: summarize so progress is captured somewhere.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Add a brief comment or note describing what was just built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long build run."}
Lighter: brief comment or note about what was just built.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write one sentence about what was just built before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long build run."}
Minimum next step: one sentence about what was just built.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CONTENT_BEGINNER: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION_BEGINNER,
  regression_check:      ABSENCE_REGRESSION_CHECK_BEGINNER,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE_BEGINNER,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING_BEGINNER,
  behaviour_testing:     BEHAVIOUR_TESTING_BEGINNER,
  security_check:        ABSENCE_SECURITY_CHECK_BEGINNER,
  error_handling:        ABSENCE_ERROR_HANDLING_BEGINNER,
  documentation:         ABSENCE_DOCUMENTATION_BEGINNER,
  observability:         ABSENCE_OBSERVABILITY_BEGINNER,
  comprehension:         ABSENCE_COMPREHENSION_BEGINNER,
  refactoring_review:      ABSENCE_REFACTORING_BEGINNER,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK_BEGINNER,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING_BEGINNER,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION_BEGINNER,
  alternatives_seeking:    ABSENCE_ALTERNATIVES_BEGINNER,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT_BEGINNER,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT_BEGINNER,
  rollback_planning:       ABSENCE_ROLLBACK_PLANNING_BEGINNER,
  deployment_planning:     ABSENCE_DEPLOYMENT_PLANNING_BEGINNER,
  dependency_management:   ABSENCE_DEPENDENCY_MGMT_BEGINNER,
  phase_transition:        ABSENCE_PHASE_TRANSITION_BEGINNER,
  spec_cross_confirm:      ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER,
  spec_revision:           ABSENCE_SPEC_REVISION_BEGINNER,
  idea_scoping:            ABSENCE_IDEA_SCOPING_BEGINNER,
  idea_constraint_check:   ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER,
  idea_user_definition:    ABSENCE_IDEA_USER_DEFINITION_BEGINNER,
  task_ordering:           ABSENCE_TASK_ORDERING_BEGINNER,
  task_sizing:             ABSENCE_TASK_SIZING_BEGINNER,
  task_definition_of_done: ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER,
  user_feedback_review:    ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER,
  iteration_planning:      ABSENCE_ITERATION_PLANNING_BEGINNER,
  scope_creep:             ABSENCE_SCOPE_CREEP_BEGINNER,
  context_loss:            ABSENCE_CONTEXT_LOSS_BEGINNER,
  api_design_review:       ABSENCE_API_DESIGN_REVIEW_BEGINNER,
  accessibility:           ABSENCE_ACCESSIBILITY_BEGINNER,
  environment_and_secrets: ABSENCE_ENV_AND_SECRETS_BEGINNER,
  data_validation:         ABSENCE_DATA_VALIDATION_BEGINNER,
  ci_pipeline:             ABSENCE_CI_PIPELINE_BEGINNER,
  rate_limiting:           ABSENCE_RATE_LIMITING_BEGINNER,
  feature_scope_before_build:    ABSENCE_FEATURE_SCOPE_BEGINNER,
  implementation_checkpoint:     ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER,
  spec_before_code:              ABSENCE_SPEC_BEFORE_CODE_BEGINNER,
  incremental_build:              ABSENCE_INCREMENTAL_BUILD_BEGINNER,
  error_understanding:            ABSENCE_ERROR_UNDERSTANDING_BEGINNER,
  documentation_before_ask:       ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER,
  output_verification:            ABSENCE_OUTPUT_VERIFICATION_BEGINNER,
  requirement_clarity_before_ask: ABSENCE_REQUIREMENT_CLARITY_BEGINNER,
  copy_paste_awareness:           ABSENCE_COPY_PASTE_AWARENESS_BEGINNER,
  debugging_observation_gap:      ABSENCE_DEBUGGING_OBSERVATION_BEGINNER,
  learning_consolidation:         ABSENCE_LEARNING_CONSOLIDATION_BEGINNER,
  simple_solution_first:          ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER,
  single_responsibility_prompting: ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER,
  rollback_awareness:             ABSENCE_ROLLBACK_AWARENESS_BEGINNER,
  build_vs_understand_ratio:      ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER,
  decision_fatigue_pattern:       ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER,
  work_rhythm_check:              ABSENCE_WORK_RHYTHM_CHECK_BEGINNER,
  focus_drift_detection:          ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER,
  session_length_checkpoint:      ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER,
  progress_consolidation_gap:     ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER,
};

export const TRANSITION_CONTENT_BEGINNER: Partial<Record<Stage, DecisionContent>> = {
  prd:            IDEA_TO_PRD_BEGINNER,
  architecture:   PRD_TO_ARCHITECTURE_BEGINNER,
  task_breakdown: ARCHITECTURE_TO_TASKS_BEGINNER,
  review_testing: IMPLEMENTATION_TO_REVIEW_BEGINNER,
  release:        REVIEW_TO_RELEASE_BEGINNER,
  feedback_loop:  RELEASE_TO_FEEDBACK_BEGINNER,
};
