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

export const ABSENCE_CONTENT_BEGINNER: Partial<Record<string, DecisionContent>> = {
  test_creation:         TASK_REVIEW_BEGINNER,
  regression_check:      TASK_REVIEW_BEGINNER,
  spec_acceptance_check: TASK_REVIEW_BEGINNER,
  cross_confirming:      TASK_REVIEW_BEGINNER,
  behaviour_testing:     BEHAVIOUR_TESTING_BEGINNER,
};

export const TRANSITION_CONTENT_BEGINNER: Partial<Record<Stage, DecisionContent>> = {
  prd:            IDEA_TO_PRD_BEGINNER,
  architecture:   PRD_TO_ARCHITECTURE_BEGINNER,
  task_breakdown: ARCHITECTURE_TO_TASKS_BEGINNER,
  review_testing: IMPLEMENTATION_TO_REVIEW_BEGINNER,
  release:        REVIEW_TO_RELEASE_BEGINNER,
};
