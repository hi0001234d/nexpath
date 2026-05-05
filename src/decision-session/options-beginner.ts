import type { DecisionContent } from './options.js';
import type { Stage } from '../classifier/types.js';

const IDEA_TO_PRD_BEGINNER: DecisionContent = {
  question:      'Before building — is the plan written?',
  pinchFallback: 'Before coding.',
  L1: [
    '1. Help me describe what I\'m building in plain terms — what it does and who it\'s for.\n2. Share your understanding with me before we go further so I can confirm we\'re on the same page.\n3. Then tell me: what\'s the most important thing to figure out before we start building?',
    'Help me describe what I want to build in plain terms, then share it back with me before we continue.',
  ],
  L2: [
    'Ask me one question to understand what I\'m building better, then summarise what you hear back to me.',
  ],
  L3: [
    'Is anything about what I want to build still unclear to you?',
  ],
};

const PRD_TO_ARCHITECTURE_BEGINNER: DecisionContent = {
  question:      'Spec ready — is the architecture decided?',
  pinchFallback: 'Design first.',
  L1: [
    '1. List the main parts of what we\'re building and how they connect — in plain language, no technical terms.\n2. Share that list with me before we move on so I can confirm it covers everything.\n3. Then tell me: what\'s the one thing we need to decide before writing any code?',
    'Describe the main parts of this system and how they connect — then share it with me before we start building.',
  ],
  L2: [
    'What\'s the most important decision to make before we start coding? Share your answer with me first.',
  ],
  L3: [
    'Is there anything about the plan that could cause problems when we start coding?',
  ],
};

const ARCHITECTURE_TO_TASKS_BEGINNER: DecisionContent = {
  question:      'Architecture done — is the task list ordered?',
  pinchFallback: 'Break it down.',
  L1: [
    '1. Break this down into small steps — each one should be something you can build in a single session.\n2. Share the list with me so I can check the order makes sense before you start.\n3. Then tell me: what\'s the first thing to build that shows the whole thing actually works?',
    'List the first 3 steps to build this in order — then share them with me before you begin.',
  ],
  L2: [
    'What\'s the very first thing to build and why? Share your answer with me before we start.',
  ],
  L3: [
    'Is the order of these steps clear, or is anything missing before we start?',
  ],
};

export const TASK_REVIEW_BEGINNER: DecisionContent = {
  question:      'Task done — reviewed and tested?',
  pinchFallback: 'Quick check.',
  L1: [
    '1. Review what was just built — does it do what this task asked for, in plain terms?\n2. Share your review with me before I mark this done, and flag anything that looks off.\n3. Then check: is there anything that might break something that was already working?',
    'Check if what was just built matches what the task asked for — share what you find with me first.',
  ],
  L2: [
    'Does what was just built look right to you? Flag anything that seems off and share it with me.',
  ],
  L3: [
    'Is there anything in what was just built that looks wrong or incomplete?',
  ],
};

const IMPLEMENTATION_TO_REVIEW_BEGINNER: DecisionContent = {
  question:      'Phase done — full review before moving on?',
  pinchFallback: 'Phase done?',
  L1: [
    '1. Go through everything built in this phase — does it all work together the way it should?\n2. Share that with me before we move on and flag anything that looks incomplete or broken.\n3. Then check: is there anything a real person using this could run into that we haven\'t covered?',
    'Check if everything in this phase is working as expected — share what you find with me before we move on.',
  ],
  L2: [
    'What\'s the most important thing to check before calling this phase done? Share your answer with me.',
  ],
  L3: [
    'Is there anything obviously broken or missing in what was just built?',
  ],
};

const REVIEW_TO_RELEASE_BEGINNER: DecisionContent = {
  question:      'Ready to ship — final checks done?',
  pinchFallback: 'Almost there.',
  L1: [
    '1. Check that everything still works — go through the main things that need to pass before we ship.\n2. Share the results with me before we release anything.\n3. Then tell me: is there anything that could go wrong once this is live that we haven\'t tested in here?',
    'Check if this is ready to ship and share what still needs to be done before we release.',
  ],
  L2: [
    'What\'s the biggest risk in shipping this right now? Share your answer with me before we continue.',
  ],
  L3: [
    'Is there anything that could break once this is live that we haven\'t tested?',
  ],
};

const BEHAVIOUR_TESTING_BEGINNER: DecisionContent = {
  question:      'Phase done — any real-user scenario tested?',
  pinchFallback: 'User scenario?',
  L1: [
    '1. Walk through this feature as if you\'re a real user — tell me each step, what you\'d click or type, and whether it works the way it should.\n2. Share what you find with me before we move on.\n3. Flag anything that feels wrong or missing along the way.',
    'Walk through this as a real user would — then share what you find with me before we continue.',
  ],
  L2: [
    'What\'s the most important thing to test by using it like a real person? Share that with me.',
  ],
  L3: [
    'Is there anything that feels off when you use this yourself?',
  ],
};

/** ABSENCE_TEST_CREATION_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_TEST_CREATION_BEGINNER: DecisionContent = {
  question:      'Built something — any tests written yet?',
  pinchFallback: 'Tests missing.',
  L1: [
    '1. Write a test for what was just built — start with the main thing it\'s supposed to do.\n2. Share the test with me so I can check it covers the right thing.\n3. Then tell me: is there anything else in what was just built that could break without a test catching it?',
    'Walk me through what was just built and tell me: what\'s the most important thing it does? Then write a test that checks that works correctly, and share it with me.',
  ],
  L2: [
    'Write one test for what was just built and share it with me — I want to see what you\'re checking and make sure it covers the right thing.',
  ],
  L3: [
    'Is there anything in what was just built that should have a test before we move on?',
  ],
};

/** ABSENCE_REGRESSION_CHECK_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_REGRESSION_CHECK_BEGINNER: DecisionContent = {
  question:      'Changed something — did anything break?',
  pinchFallback: 'Regression check.',
  L1: [
    '1. Run the existing tests for this project now that what was just built has been added.\n2. Share the results with me — which ones pass, which ones fail.\n3. Then tell me: is there anything that used to work that might not work anymore?',
    'Look at what was just built and tell me — what other parts of this project does it touch or depend on? Then check if those parts still work correctly and share what you find.',
  ],
  L2: [
    'Run the tests for this project and share the results with me — I want to know if anything broke after what was just built was added.',
  ],
  L3: [
    'Is there anything that was working before that might have stopped working after what was just built was added?',
  ],
};

/** ABSENCE_SPEC_ACCEPTANCE_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_SPEC_ACCEPTANCE_BEGINNER: DecisionContent = {
  question:      'Built something — does it match what was planned?',
  pinchFallback: 'Check the spec.',
  L1: [
    '1. Look at what was just built and compare it to what we planned to build.\n2. Share with me: does it do everything it was supposed to, or is something missing or different?\n3. Then check: are there any situations it should handle that it doesn\'t?',
    'Walk through what was just built step by step and tell me — does each part match what we planned? Share anything that looks different from what we agreed on.',
  ],
  L2: [
    'Does what was just built do what we planned it to do? Share any differences with me before we move on.',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t match what we originally planned to build?',
  ],
};

/** ABSENCE_CROSS_CONFIRMING_BEGINNER — beginner-register variant (L1×2 / L2×1 / L3×1) */
export const ABSENCE_CROSS_CONFIRMING_BEGINNER: DecisionContent = {
  question:      'AI wrote it — have you actually checked it?',
  pinchFallback: 'Verify the output.',
  L1: [
    '1. Read through what was just built carefully — not just to check if it looks right, but to understand what it actually does.\n2. Share with me: is there anything that seems off, confusing, or that you\'re not sure about?\n3. Then tell me: is there anything in what was just built you haven\'t manually checked yet?',
    'Walk through what was just built step by step and tell me — do you understand what each part does? Share anything that looks unclear or that you just accepted without checking.',
  ],
  L2: [
    'Is there anything in what was just built that you accepted because it looked right, but haven\'t actually checked? Share it with me.',
  ],
  L3: [
    'Is there anything in what was just built that you\'re not 100% sure is correct — something you haven\'t manually verified yet?',
  ],
};

export const ABSENCE_CONTENT_BEGINNER: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION_BEGINNER,
  regression_check:      ABSENCE_REGRESSION_CHECK_BEGINNER,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE_BEGINNER,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING_BEGINNER,
  behaviour_testing:     BEHAVIOUR_TESTING_BEGINNER,
};

export const TRANSITION_CONTENT_BEGINNER: Partial<Record<Stage, DecisionContent>> = {
  prd:            IDEA_TO_PRD_BEGINNER,
  architecture:   PRD_TO_ARCHITECTURE_BEGINNER,
  task_breakdown: ARCHITECTURE_TO_TASKS_BEGINNER,
  review_testing: IMPLEMENTATION_TO_REVIEW_BEGINNER,
  release:        REVIEW_TO_RELEASE_BEGINNER,
};
