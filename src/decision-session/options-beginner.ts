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

export const ABSENCE_SECURITY_CHECK_BEGINNER: DecisionContent = {
  question:      'Built something — any security checks done?',
  pinchFallback: 'Security gap.',
  L1: [
    '1. Look at what was just built and check if it handles anything a user types in or sends to the app.\n2. Share with me: could someone type something unexpected and cause a problem?\n3. Then check: does anything in what was just built need a login or permission to use, and is that actually enforced?',
    'Walk me through what was just built and tell me — what could go wrong if someone tried to misuse it on purpose? Share what you find with me before we move on.',
  ],
  L2: [
    'Is there anything in what was just built that takes input from a user or checks if someone is logged in? Share how that\'s handled with me.',
  ],
  L3: [
    'Is there anything in what was just built that a user could misuse or that isn\'t properly protected?',
  ],
};

export const ABSENCE_ERROR_HANDLING_BEGINNER: DecisionContent = {
  question:      'Feature built — what happens when it breaks?',
  pinchFallback: 'Error handling.',
  L1: [
    '1. Look at what was just built and think: what happens if it doesn\'t work the way it\'s supposed to?\n2. Share with me: is there anything that could break without showing a useful message?\n3. Then check: what happens if a user does something unexpected — does the app handle it or crash?',
    'Walk me through what was just built and tell me — what\'s the first thing that could go wrong, and what does the user see when that happens? Share what you find with me.',
  ],
  L2: [
    'Is there anything in what was just built that could fail without telling the user what went wrong? Share what you find with me.',
  ],
  L3: [
    'Is there anything in what was just built that could crash or fail silently when something unexpected happens?',
  ],
};

export const ABSENCE_DOCUMENTATION_BEGINNER: DecisionContent = {
  question:      'Code written — is anything documented?',
  pinchFallback: 'Docs missing.',
  L1: [
    '1. Look at what was just built and find one part that would be hard to understand for someone who didn\'t write it.\n2. Add a short explanation of why it works that way and share it with me.\n3. Then check: is there anything else in what was just built that needs explaining before we move on?',
    'Walk me through what was just built and point out the part that would confuse someone reading it for the first time — then write a short explanation for that part and share it with me.',
  ],
  L2: [
    'Is there anything in what was just built that you\'d have to explain to someone else? Write that explanation as a comment and share it with me.',
  ],
  L3: [
    'Is there anything in what was just built that isn\'t obvious — something that would confuse someone who didn\'t write it?',
  ],
};

export const ABSENCE_OBSERVABILITY_BEGINNER: DecisionContent = {
  question:      'Feature built — will you know when it breaks?',
  pinchFallback: 'No observability.',
  L1: [
    '1. Think about what was just built running in the real world — if it stopped working, how would you find out?\n2. Share with me: is there anything that records what it\'s doing, or would it just fail without warning?\n3. Then tell me: what\'s the most important thing to log so you\'d know it\'s working?',
    'Walk me through what was just built and tell me — if something went wrong when real users were using it, would you get any warning, or would you find out when users complained? Share what you find with me.',
  ],
  L2: [
    'Is there anything in what was just built that could stop working without you noticing? Share with me what would help you detect that.',
  ],
  L3: [
    'Is there anything in what was just built that could fail silently in production without triggering a log entry or alert?',
  ],
};

export const ABSENCE_COMPREHENSION_BEGINNER: DecisionContent = {
  question:      'AI wrote it — do you actually get it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    '1. Read through what was just built slowly — not to check if it looks right, but to understand what each part actually does.\n2. Share with me: is there anything you\'re not sure about or that doesn\'t make sense to you?\n3. Then tell me: is there any part you just accepted because it looked okay without actually understanding it?',
    'Walk me through what was just built in your own words — explain what it does step by step. Share anything you\'re not able to explain clearly with me and we\'ll go through it together.',
  ],
  L2: [
    'Is there any part of what was just built you couldn\'t explain to someone else right now? Share that part with me and we\'ll make sure you understand it.',
  ],
  L3: [
    'Is there anything in what was just built that you\'re not sure you fully understand?',
  ],
};

export const ABSENCE_REFACTORING_BEGINNER: DecisionContent = {
  question:      'Long build run — anything to clean up?',
  pinchFallback: 'Refactor check.',
  L1: [
    '1. Read through what was just built from start to finish — does it still feel organised and easy to follow?\n2. Share with me: is there anything that feels messy, repeated, or harder to understand than it needs to be?\n3. Then tell me: is there anything that should be tidied up before we add more features on top?',
    'Walk me through what was just built and tell me — is there any part that would be confusing or messy to someone who didn\'t write it? Share what you find with me so we can decide whether to clean it up now.',
  ],
  L2: [
    'Is there anything in what was just built that feels messy or repeated? Share it with me and let\'s decide whether to clean it up before moving on.',
  ],
  L3: [
    'Is there anything in what was just built that should be cleaned up or simplified before we continue?',
  ],
};

export const ABSENCE_NO_PUSHBACK_BEGINNER: DecisionContent = {
  question:      'AI keeps suggesting — are you actually evaluating?',
  pinchFallback: 'No pushback.',
  L1: [
    '1. Look at the last few things the AI suggested while building this feature.\n2. Share with me: is there anything you accepted just because it sounded right, without checking if it was really the best option?\n3. Then pick one and tell me: why did you go with that suggestion over other ways of doing it?',
    'Walk me through the last AI suggestion used in what was just built — do you actually agree with it, or did you just go with it because the AI seemed confident? Share your thoughts with me.',
  ],
  L2: [
    'Is there anything the AI suggested for what was just built that you said yes to without really thinking about whether it was the right choice? Share that with me.',
  ],
  L3: [
    'Is there any AI suggestion used in what was just built that you accepted without questioning whether it was actually the best approach?',
  ],
};

export const ABSENCE_CORRECTION_SEEKING_BEGINNER: DecisionContent = {
  question:      'Has the AI checked its own work?',
  pinchFallback: 'No verification.',
  L1: [
    '1. Ask the AI to look at what was just built again — but this time, ask it to find what might be wrong with it.\n2. Share with me what it says.\n3. Then tell me: does its answer make sense to you, or does something still seem off?',
    'Ask the AI: "what\'s the part of what was just built you\'re least sure about?" — then share what it says with me so we can check together.',
  ],
  L2: [
    'Ask the AI to point out any part of what was just built that might not be right — then share what it says with me.',
  ],
  L3: [
    'Ask the AI to find one thing in what was just built that might be wrong or could be done better.',
  ],
};

export const ABSENCE_PROBLEM_CORRECTION_BEGINNER: DecisionContent = {
  question:      'Spotted a bug — did it actually get fixed?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    '1. Think back through this session — was there anything that didn\'t work or looked wrong earlier on?\n2. Share with me: is that thing actually fixed now, or did we move on without dealing with it?\n3. Then check: are there any other problems in what was just built that haven\'t been properly sorted out?',
    'Walk me through what was just built and tell me — is there anything we said was a problem earlier that still hasn\'t been fixed? Share what you find with me.',
  ],
  L2: [
    'Is there anything in what was just built that was flagged as broken or wrong earlier in this session but hasn\'t been fixed yet? Share it with me.',
  ],
  L3: [
    'Is there any bug in what was just built that was noticed earlier but not actually fixed?',
  ],
};

export const ABSENCE_ALTERNATIVES_BEGINNER: DecisionContent = {
  question:      'Decision made — any alternatives looked at?',
  pinchFallback: 'No alternatives.',
  L1: [
    '1. Think about the biggest decision that was made while building this feature.\n2. Share with me: what other ways could it have been done, and why did we go with this one?\n3. Then tell me: is this still the best approach now that you think about it, or would something else have been simpler?',
    'Walk me through the most important choice made in what was just built — what were the other options we could have picked, and why did we choose this one? Share your thinking with me.',
  ],
  L2: [
    'Is there any choice made in what was just built where we just went with the first idea without thinking about other ways to do it? Share that with me.',
  ],
  L3: [
    'Is there any decision in what was just built that was made without thinking about other options first?',
  ],
};

export const ABSENCE_ARCH_CONFLICT_BEGINNER: DecisionContent = {
  question:      'Feature added — does it fit the codebase?',
  pinchFallback: 'Arch conflict.',
  L1: [
    '1. Look at what was just built and compare it to how other parts of the project are written.\n2. Share with me: does it feel like it belongs, or does it do things in a different way than everything else?\n3. Then tell me: is there anything that could cause problems when we try to connect it with the rest of the project?',
    'Walk me through what was just built and tell me — does it fit with the way the rest of the project is structured, or does it work differently from everything else? Share what you notice with me.',
  ],
  L2: [
    'Is there anything in what was just built that looks different from how the rest of the project does things? Share it with me and let\'s check if that\'s a problem.',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t fit with the rest of the project\'s structure or patterns?',
  ],
};

export const ABSENCE_PROMPT_CONTEXT_BEGINNER: DecisionContent = {
  question:      'Sending prompts — have you shared the spec?',
  pinchFallback: 'Missing context.',
  L1: [
    '1. Think about what you\'ve been asking the AI to build in this session.\n2. Share with me: has it seen the original plan for what we\'re building, or has it just been following each instruction without knowing the bigger picture?\n3. Then paste the plan or the task description into the conversation and ask it to check that what was just built matches what was planned.',
    'Walk me through what the AI has been working from in this session — has it seen the full plan, or just individual instructions? Share the original plan with it now and ask it to check if what was just built matches up, then share what it says with me.',
  ],
  L2: [
    'Has the AI seen the plan or the description of what this feature is supposed to do? If not, share it now and ask it to check that what was just built matches — then share what it says with me.',
  ],
  L3: [
    'Does the AI know what the full plan says for this feature, or has it been building without seeing it?',
  ],
};

export const ABSENCE_ROLLBACK_PLANNING_BEGINNER: DecisionContent = {
  question:      'Shipping soon — what\'s the rollback plan?',
  pinchFallback: 'No rollback plan.',
  L1: [
    '1. Think about what would happen if this feature caused a problem when it went live.\n2. Share with me: what would you do to undo the deployment if something went wrong?\n3. Then check: is there anything in this feature that would be hard to reverse once it\'s live?',
    'Walk me through what you\'d do if this feature broke in production right after shipping — would you know how to roll it back, or would you need to figure it out under pressure? Share your plan with me.',
  ],
  L2: [
    'Is there a plan for what to do if this feature causes a problem after it\'s deployed? Share it with me before we ship.',
  ],
  L3: [
    'Do you know what you\'d do to roll back this feature if something went wrong after shipping?',
  ],
};

export const ABSENCE_DEPLOYMENT_PLANNING_BEGINNER: DecisionContent = {
  question:      'Shipping soon — is the deployment actually planned?',
  pinchFallback: 'No deploy plan.',
  L1: [
    '1. Think about how this feature is going to get from your computer to where users will use it.\n2. Share with me: is there a plan for that, or is it still not figured out?\n3. Then check: is there anything the live environment needs that isn\'t set up yet — like settings or secret keys?',
    'Walk me through how this feature would actually get deployed — what are the steps, and is there anything that needs to be set up in the live environment before it\'ll work? Share what you find with me.',
  ],
  L2: [
    'Is there a plan for how this feature gets deployed to where real users will use it? Share it with me so we can check if anything\'s missing.',
  ],
  L3: [
    'Do you know how this feature is going to be deployed, or is the deployment still not planned out?',
  ],
};

export const ABSENCE_DEPENDENCY_MGMT_BEGINNER: DecisionContent = {
  question:      'Added packages — any issues checked?',
  pinchFallback: 'Dependency risk.',
  L1: [
    '1. Look at the new packages that were added while building this feature.\n2. Share with me: do any of them have known problems, or did you just install them because they looked like what you needed?\n3. Then check: do they work alongside everything else that\'s already installed, or could they cause a conflict?',
    'Walk me through the packages added in what was just built — are they the right ones for the job, and have you checked if there are any known problems with the versions you installed? Share what you find with me.',
  ],
  L2: [
    'Is there anything about the packages added in what was just built that could cause a problem — like a conflict with existing packages or a known security issue? Share what you find with me.',
  ],
  L3: [
    'Have the new packages added in what was just built been checked to make sure they don\'t cause any conflicts or known issues?',
  ],
};

export const ABSENCE_PHASE_TRANSITION_BEGINNER: DecisionContent = {
  question:      'Been in this phase a while — what comes next?',
  pinchFallback: 'Phase check.',
  L1: [
    '1. Think about what phase of development this project is currently in.\n2. Share with me: have you finished what you set out to do in this phase, or are you still in the middle of it?\n3. Then tell me: what needs to be done before it makes sense to move on to the next phase?',
    'Walk me through where this project stands right now — are you still in the middle of the current phase, or have you finished it without realising it? Share what still needs to be done before moving on.',
  ],
  L2: [
    'Is there anything in this project that needs to be finished or decided before moving to the next phase? Share what you think is still missing with me.',
  ],
  L3: [
    'Is this project ready to move to the next phase, or are there things that should be finished first?',
  ],
};

export const ABSENCE_SPEC_CROSS_CONFIRM_BEGINNER: DecisionContent = {
  question:      'Spec exists — has it been checked against the plan?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    '1. Read through this project\'s spec and check: does everything in it come from something that was actually decided or agreed on?\n2. Share with me: is there anything in the spec that looks like an assumption rather than a confirmed requirement?\n3. Then tell me: is there anything that could be misunderstood or built in the wrong way because it\'s not specific enough?',
    'Walk me through this project\'s spec and tell me — is there anything in it that you\'re not sure was actually agreed on, or anything that\'s vague enough to be confusing? Share what you find with me.',
  ],
  L2: [
    'Is there anything in this project\'s spec that might be an assumption rather than something that was actually confirmed? Share what you find with me.',
  ],
  L3: [
    'Is there anything in this project\'s spec that hasn\'t been checked against what was actually agreed on?',
  ],
};

export const ABSENCE_SPEC_REVISION_BEGINNER: DecisionContent = {
  question:      'Spec written — has it been updated since the first draft?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    '1. Look at this project\'s spec and then look at what has actually been built so far.\n2. Share with me: are they still in sync, or have things changed since the spec was first written?\n3. Then tell me: what would need to be updated in the spec to make it match what\'s actually happening?',
    'Walk me through this project\'s spec and tell me — is it still accurate, or have things changed since it was first written that aren\'t in there yet? Share what\'s out of date with me.',
  ],
  L2: [
    'Is this project\'s spec still accurate, or has something changed since it was written that isn\'t reflected in it yet? Share what you find with me.',
  ],
  L3: [
    'Does this project\'s spec still match what\'s actually being built, or is it out of date?',
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
};

export const TRANSITION_CONTENT_BEGINNER: Partial<Record<Stage, DecisionContent>> = {
  prd:            IDEA_TO_PRD_BEGINNER,
  architecture:   PRD_TO_ARCHITECTURE_BEGINNER,
  task_breakdown: ARCHITECTURE_TO_TASKS_BEGINNER,
  review_testing: IMPLEMENTATION_TO_REVIEW_BEGINNER,
  release:        REVIEW_TO_RELEASE_BEGINNER,
};
