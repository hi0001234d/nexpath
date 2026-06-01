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

const RELEASE_TO_FEEDBACK_BEGINNER: DecisionContent = {
  question:      'Just shipped — is the feedback loop active?',
  pinchFallback: 'Watch it live.',
  L1: [
    '1. Check that what was just built is actually working now that it\'s live — try the main thing it does and see if it works the way you expected.\n2. Share what you find with me before we move on and flag anything that looks off or unexpected.\n3. Then check: will we know if something breaks after we stop watching, or will it fail without showing an obvious error?',
    'Check if this project is set up to let us know if something goes wrong now that it\'s live — share what\'s in place and what\'s missing with me before we continue.',
  ],
  L2: [
    'How would we find out if something is going wrong for a real person using this feature right now? Share your answer with me before we continue.',
  ],
  L3: [
    'Is there anything in what was just built that could go wrong without showing a clear error?',
  ],
};

const BEHAVIOUR_TESTING_BEGINNER: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
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
    '1. Look at what was just built again — but this time, find what might be wrong with it.\n2. Share what you find with me.\n3. Then tell me: does what you found make sense, or does something still seem off?',
    'What\'s the part of what was just built you\'re least sure about? — share what you find with me so we can check together.',
  ],
  L2: [
    'Point out any part of what was just built that might not be right — then share what you find with me.',
  ],
  L3: [
    'Find one thing in what was just built that might be wrong or could be done better.',
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
    '1. Think about what you\'ve been building in this session.\n2. Share with me: have you seen the original plan for what we\'re building, or have you just been following each instruction without knowing the bigger picture?\n3. Then paste the plan or the task description into the conversation and check that what was just built matches what was planned.',
    'Walk me through what you\'ve been working from in this session — have you seen the full plan, or just individual instructions? Check whether what was just built matches the original plan if you have it, and share what you find with me.',
  ],
  L2: [
    'Have you seen the plan or the description of what this feature is supposed to do? If not, ask me for it — then check that what was just built matches and share what you find.',
  ],
  L3: [
    'Do you know what the full plan says for this feature, or have you been building without seeing it?',
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

// ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────────

// Group A — idea signals (beginner)

export const ABSENCE_IDEA_SCOPING_BEGINNER: DecisionContent = {
  question:      'Idea forming — what exactly are we building?',
  pinchFallback: 'Scope unclear.',
  L1: [
    '1. Help me describe this project in plain words — what it does and what problem it solves.\n2. Share your description with me before we go further so I can check it sounds right.\n3. Then tell me: is there anything about what we\'re building that\'s still unclear or not decided yet?',
    'Describe this project in plain language — what it does, what problem it solves, and what we\'re building first. Share your answer with me before we continue.',
  ],
  L2: [
    'Describe this project to me in two sentences: what it does, and what it\'s for. Share it with me before we move on.',
  ],
  L3: [
    'Is it clear what this project is and what it\'s supposed to do?',
  ],
};

export const ABSENCE_IDEA_CONSTRAINT_CHECK_BEGINNER: DecisionContent = {
  question:      'Idea forming — what\'s out of scope?',
  pinchFallback: 'No non-goals set.',
  L1: [
    '1. Think about this project — what is it NOT going to do?\n2. Share a list of at least two things we\'re leaving out of this project on purpose, even if they seem obvious.\n3. Then tell me: why is it helpful to say those things out loud now?',
    'Help me list the things this project is NOT going to do — at least two. Share the list with me before we go further.',
  ],
  L2: [
    'What\'s one thing this project won\'t do? Share your answer with me and tell me why it\'s good to state that now.',
  ],
  L3: [
    'Is there anything this project won\'t do that we haven\'t said out loud yet?',
  ],
};

export const ABSENCE_IDEA_USER_DEFINITION_BEGINNER: DecisionContent = {
  question:      'Idea forming — who is this actually for?',
  pinchFallback: 'User not defined.',
  L1: [
    '1. Think about who will use this project — who is the main person it\'s for?\n2. Share a description of that person with me: who they are and what they\'re trying to do.\n3. Then tell me: what does that mean for how we build this project?',
    'Describe the person who will use this project in plain words — who they are and what they need it to do. Share your description with me before we go further.',
  ],
  L2: [
    'Who is this project for? Describe that person to me in a sentence or two, then share it with me so I can check it sounds right.',
  ],
  L3: [
    'Is it clear who this project is for and what they\'re trying to do?',
  ],
};

// Group B — task_breakdown signals (beginner)

export const ABSENCE_TASK_ORDERING_BEGINNER: DecisionContent = {
  question:      'Tasks listed — what order do we do them in?',
  pinchFallback: 'No order set.',
  L1: [
    '1. Look at the tasks for this project.\n2. Share with me: which one should we do first, and which ones can\'t be done until something else is finished?\n3. Then tell me: what\'s the order we should follow to build this?',
    'Put the tasks for this project in order — which one goes first? Share the order with me before we start building.',
  ],
  L2: [
    'What\'s the first task to work on for this project? Tell me what it is and why it should come first, then share it with me.',
  ],
  L3: [
    'Is the order of tasks for this project clear, or does anything still need to be sorted out?',
  ],
};

export const ABSENCE_TASK_SIZING_BEGINNER: DecisionContent = {
  question:      'Tasks listed — are they small enough to do in one go?',
  pinchFallback: 'Tasks too big.',
  L1: [
    '1. Look at the tasks for this project.\n2. Share with me: is there any task that feels too big to finish in one sitting?\n3. Then tell me: how would you split that task into smaller pieces that are easier to finish one at a time?',
    'Are any tasks in this project too big to do in one session? Share which ones feel too large, and let\'s figure out how to break them down.',
  ],
  L2: [
    'Pick the biggest task for this project. Share it with me, and then tell me how you\'d split it into smaller steps that could each be finished in one sitting.',
  ],
  L3: [
    'Are all the tasks for this project small enough to finish one at a time, or do any of them need to be broken down more?',
  ],
};

export const ABSENCE_TASK_DEFINITION_OF_DONE_BEGINNER: DecisionContent = {
  question:      'Tasks set — how do we know when each one\'s done?',
  pinchFallback: 'Done criteria missing.',
  L1: [
    '1. Pick one task from this project.\n2. Share with me: how would you know when that task is finished? What would you check?\n3. Then do the same for each of the other tasks — for each one, tell me what \'done\' looks like.',
    'For each task in this project, help me write one sentence about what \'done\' means — something you could check to know the task is finished. Share the list with me when you\'re done.',
  ],
  L2: [
    'Pick the first task for this project and tell me: how would you know it\'s finished? Share your answer with me before we start building.',
  ],
  L3: [
    'Is it clear how we\'ll know when each task in this project is done?',
  ],
};

// Group C — feedback_loop signals (beginner)

export const ABSENCE_USER_FEEDBACK_REVIEW_BEGINNER: DecisionContent = {
  question:      'Feedback in — have we actually gone through it?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    '1. Look at the feedback users have given about this project.\n2. Share with me: what are the most common things people are saying? What keeps coming up?\n3. Then tell me: what\'s the one piece of feedback that feels most important to address?',
    'Go through the feedback for this project and share what you find — what are users saying? Pick the most important thing they mentioned and tell me what it is.',
  ],
  L2: [
    'What is the most important piece of feedback about this project? Share it with me and tell me why it matters.',
  ],
  L3: [
    'Have you gone through the feedback for this project yet, or is that still to do?',
  ],
};

export const ABSENCE_ITERATION_PLANNING_BEGINNER: DecisionContent = {
  question:      'Feedback reviewed — what are we building next?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    '1. Look at the feedback for this project.\n2. Share with me: what\'s the most important thing users want fixed or added?\n3. Then tell me: what would you work on first in the next version, and why?',
    'Based on what users said about this project, what do you want to fix or build next? Share your top pick with me before we start planning.',
  ],
  L2: [
    'What is the first thing to fix or build in the next version of this project based on the feedback? Share your answer with me.',
  ],
  L3: [
    'Is it clear what to work on next for this project based on what users said?',
  ],
};

// ── Phase 5 D1-D3 — beginner signals (BEGINNER register) ─────────────────────

export const ABSENCE_INCREMENTAL_BUILD_BEGINNER: DecisionContent = {
  question:      'Building something — verifying each piece as you go?',
  pinchFallback: 'One piece at a time.',
  L1: [
    '1. Before adding the next thing — quickly test what was just built.\n2. Share with me: does it do what you expected, or is something off?\n3. Then tell me: is it safe to move on, or should we fix something first?',
    'Test the part that was just built before adding anything else — tell me if it works the way you expected, and share what you find.',
  ],
  L2: [
    'Does what was just built work the way it should? Try it and tell me before we add anything else.',
  ],
  L3: [
    'Is what was just built working before we continue?',
  ],
};

export const ABSENCE_ERROR_UNDERSTANDING_BEGINNER: DecisionContent = {
  question:      'Got an error — do you know what it means?',
  pinchFallback: 'Understand the error.',
  L1: [
    '1. Before asking to fix this error — read the error message carefully.\n2. Share with me: what do you think it\'s saying went wrong?\n3. Then tell me: does your explanation match where the problem is in the code?',
    'Walk me through the error message — what does it say, where is it pointing, and what do you think caused it? Share your understanding before we fix anything.',
  ],
  L2: [
    'What do you think this error means? Share your best guess with me — even if you\'re not sure — before we fix it.',
  ],
  L3: [
    'Do you understand what this error is telling you, or does it need more explaining before we fix it?',
  ],
};

export const ABSENCE_DOCUMENTATION_BEFORE_ASK_BEGINNER: DecisionContent = {
  question:      'About to ask — have you checked the docs?',
  pinchFallback: 'Docs first.',
  L1: [
    '1. Before asking me this question — check the official documentation for this library or API.\n2. Share with me: what did you find, and is the answer there?\n3. Then ask me what you still couldn\'t find in the docs.',
    'Look up the official docs for what you\'re asking about, then share what you found — I\'ll fill in anything the docs didn\'t make clear.',
  ],
  L2: [
    'Is there official documentation for what you\'re asking about? Check it first and share what you find — then tell me what\'s still unclear.',
  ],
  L3: [
    'Have you checked the documentation for this before asking?',
  ],
};

export const ABSENCE_OUTPUT_VERIFICATION_BEGINNER: DecisionContent = {
  question:      'Code generated — have you actually tried it?',
  pinchFallback: 'Test it first.',
  L1: [
    '1. Before moving on from what was just built — actually run it or try it.\n2. Share with me: does it behave the way you expected?\n3. If anything looks off, tell me what happened and we\'ll look at it together.',
    'Try what was just built and share what happens — does it do what you expected, or is something different?',
  ],
  L2: [
    'Have you run or tried what was just built? Tell me what it does when you use it.',
  ],
  L3: [
    'Have you actually tested what was just built to see if it works?',
  ],
};

export const ABSENCE_REQUIREMENT_CLARITY_BEGINNER: DecisionContent = {
  question:      'About to build — is the requirement clear?',
  pinchFallback: 'Clarify first.',
  L1: [
    '1. Before I build this — tell me specifically what you want it to do.\n2. Share with me: what does it look like when it\'s working correctly?\n3. Then tell me: what should NOT happen — is there anything it should avoid doing?',
    'Describe what you want built in your own words — what it should do, and how you\'d know it\'s working right. Share that with me before we start.',
  ],
  L2: [
    'What exactly should this do, and how will you know when it\'s working? Be specific — not just "make it work" but what does "working" look like.',
  ],
  L3: [
    'What do you want this to do? In plain words — what\'s the goal?',
  ],
};

export const ABSENCE_COPY_PASTE_AWARENESS_BEGINNER: DecisionContent = {
  question:      'Code generated — do you understand it before using it?',
  pinchFallback: 'Understand first.',
  L1: [
    '1. Before adding the generated code to your project — read through it.\n2. Share with me: what does each part do in plain words?\n3. If there\'s a part you\'re not sure about, point it out and we\'ll go through it together before it goes in.',
    'Walk me through the code that was just generated — what does it do and how does it work? Share your understanding before we add it to the project.',
  ],
  L2: [
    'Is there any part of the code that was just generated that you\'re not sure you understand? Point it out and we\'ll go through it.',
  ],
  L3: [
    'Do you understand what the generated code does before adding it to your project?',
  ],
};

export const ABSENCE_DEBUGGING_OBSERVATION_BEGINNER: DecisionContent = {
  question:      'Something\'s broken — what did you actually see?',
  pinchFallback: 'Describe it first.',
  L1: [
    '1. Before I look at the bug — describe what happened.\n2. Share with me: what did you expect to happen, and what actually happened instead?\n3. Then tell me: is there an error message, and if so, what does it say?',
    'Walk me through what\'s broken — what did you expect to happen, what actually happened, and what error or weird behaviour did you see? Share that with me and we\'ll figure it out.',
  ],
  L2: [
    'What happened when you ran this? Describe what you expected vs what you actually saw — I need to know the difference before we fix it.',
  ],
  L3: [
    'What exactly went wrong — what did you see happen, and what were you expecting?',
  ],
};

export const ABSENCE_LEARNING_CONSOLIDATION_BEGINNER: DecisionContent = {
  question:      'We\'ve built a lot — do you feel like you understood it?',
  pinchFallback: 'Recap learning.',
  L1: [
    '1. We\'ve covered a lot in this session — take a moment and think about what you actually learned.\n2. Share with me: what\'s the most important thing you now understand that you didn\'t before?\n3. Then tell me: is there anything we covered that still feels unclear or confusing?',
    'Recap what you learned in this session in your own words — what did we build, how does it work, and what new thing do you understand now that you didn\'t before? Share that with me.',
  ],
  L2: [
    'What\'s the one thing from this session that you feel like you actually understood — not just copied, but actually understood? Share it with me.',
  ],
  L3: [
    'Is there something we built in this session that you\'re confident you understand well enough to explain to someone else?',
  ],
};

export const ABSENCE_SIMPLE_SOLUTION_FIRST_BEGINNER: DecisionContent = {
  question:      'Building this — is there a simpler way to do it?',
  pinchFallback: 'Simplest first.',
  L1: [
    '1. Before building something complex — ask: is there a simpler way to get the same result? The simplest solution that works is almost always the right one to start with.\n2. Share what you\'re trying to do in plain terms. Let\'s find the simple version first.',
    'The KISS principle in engineering: if the simple solution works, use it. You can always make things more complex later — you can\'t unsimplify them. What\'s the simplest version of what you\'re building?',
  ],
  L2: [
    'Is there a simpler way to do this? Describe what you need — let\'s find the smallest solution.',
  ],
  L3: [
    'What\'s the simplest way to get this done? Start there.',
  ],
};

export const ABSENCE_SINGLE_RESPONSIBILITY_PROMPTING_BEGINNER: DecisionContent = {
  question:      'Asking a lot at once — let\'s do one thing at a time',
  pinchFallback: 'One thing at a time.',
  L1: [
    '1. When you send several things at once, the results get messy and hard to check. Try focusing on just one thing per message.\n2. What\'s the most important thing to do right now? Start with that — then we\'ll move to the next.',
    'One task per message works better than many — it\'s easier to see if it worked, easier to fix if it didn\'t, and easier to understand what happened. What\'s the single next step?',
  ],
  L2: [
    'What\'s the one thing to do right now? Focus on that first — we\'ll do the rest after.',
  ],
  L3: [
    'One thing at a time — what\'s the most important next step?',
  ],
};

export const ABSENCE_ROLLBACK_AWARENESS_BEGINNER: DecisionContent = {
  question:      'About to change things — do you know how to undo it?',
  pinchFallback: 'Save before changing.',
  L1: [
    '1. Before making a big change to your code — do a git commit first. This saves a snapshot you can always go back to if something breaks.\n2. Not sure how? Try: git add . then git commit -m \'working before change\'. Then make your change safely.',
    'Git is your safety net. Always commit a working version of your code before changing something significant. If the change breaks everything, you can get back to where things worked with one command.',
  ],
  L2: [
    'Do a git commit before making this change — save a working snapshot first, then change.',
  ],
  L3: [
    'Commit your current code before changing it — so you can get back if needed.',
  ],
};

export const ABSENCE_BUILD_VS_UNDERSTAND_RATIO_BEGINNER: DecisionContent = {
  question:      'We\'ve been building — do you understand what we\'ve built?',
  pinchFallback: 'Pause and understand.',
  L1: [
    '1. We\'ve added a lot of code — can you explain in your own words what it does? Even a rough description is fine.\n2. Understanding what you\'ve built is as important as building it. Code you don\'t understand becomes a problem you can\'t fix later.',
    'Pick one part of what we just built and walk me through what it does. Not how I explained it — how YOU understand it. This is how you turn building into learning.',
  ],
  L2: [
    'Can you explain in your own words what the code we just wrote does? Take a moment.',
  ],
  L3: [
    'Walk me through what we just built — in your own words.',
  ],
};


// ── Sub-7 — beginner content sets ─────────────────────────────────────────────

export const ABSENCE_SCOPE_CREEP_BEGINNER: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    '1. Look at what was just built and make a list of everything it does now. 2. Compare that list to what you originally planned to build. 3. Share anything that wasn\'t in the original plan with me before we continue.',
    'Go through this feature and check — did anything extra get added that wasn\'t part of the original plan? Share what you find with me before we keep going.',
  ],
  L2: [
    'Is there anything in this feature that you didn\'t originally plan to build? Tell me what it is and we\'ll decide what to do with it.',
  ],
  L3: [
    'Can you name one thing in this feature that ended up there but wasn\'t part of the original plan?',
  ],
};

export const ABSENCE_CONTEXT_LOSS_BEGINNER: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    '1. Think about everything we\'ve done with what was just built this session. 2. Write down what\'s working and what still needs to be done. 3. Share that with me before we keep going — it\'ll help us stay on track.',
    'Take a moment and catch up on this project — what have we built so far, what choices did we make, and what\'s next? Share your summary with me before we continue.',
  ],
  L2: [
    'Can you tell me where this feature is right now in your own words — what\'s done and what still needs to happen?',
  ],
  L3: [
    'What\'s one thing you want to make sure we don\'t forget about where this project is right now?',
  ],
};

export const ABSENCE_API_DESIGN_REVIEW_BEGINNER: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    '1. Look at what was just built and check whether it could break anything that\'s already using this API. 2. List any changes to how it works — what it expects and what it sends back. 3. Share your list with me before we continue.',
    'Go through this feature\'s API and check — could anything about how it works change after other code starts depending on it? Share what you find with me before we move on.',
  ],
  L2: [
    'Does what was just built change the API in a way that might break something that\'s already using it? Tell me what changed and we\'ll figure out if it\'s a problem.',
  ],
  L3: [
    'What\'s one thing about how this feature\'s API works that might need to change later — and could that cause a problem for anything depending on it?',
  ],
};

export const ABSENCE_ACCESSIBILITY_BEGINNER: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    '1. Go through what was just built and check that every button and link has a clear label describing what it does. 2. Try tabbing through the whole feature using only the keyboard — no mouse. 3. Share what you find with me before we continue.',
    'Think about someone who can\'t see the screen trying to use this feature — would a screen reader be able to tell them what everything does? Go through it and share what you notice with me before we move on.',
  ],
  L2: [
    'Can you go through this feature and find one thing that someone with a disability might struggle to use — and tell me what it is?',
  ],
  L3: [
    'Is there anything in what was just built that someone might have trouble using if they couldn\'t use a mouse or couldn\'t see the screen clearly?',
  ],
};

export const ABSENCE_ENV_AND_SECRETS_BEGINNER: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    '1. Go through what was just built and check — are any passwords, API keys, or other secrets written directly in the code? 2. If they are, those need to be moved to a separate `.env` file. 3. Share what you find with me before we continue.',
    'Check whether this feature has a `.env.example` file that lists every secret or config value it needs to run — without the real values. Share what you find with me before we move on.',
  ],
  L2: [
    'Is there a password, API key, or any other secret in what was just built that\'s written directly into the code? Tell me what it is and we\'ll figure out how to move it somewhere safe.',
  ],
  L3: [
    'What\'s one secret or password this feature uses — and where is it stored right now?',
  ],
};

export const ABSENCE_DATA_VALIDATION_BEGINNER: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    '1. Think about what happens in this feature if someone sends the wrong data — a missing field, a number where text is expected, or something completely unexpected. 2. Try sending some bad data and see what happens. 3. Share what you find with me before we continue.',
    'Go through what was just built and check — is there anything checking that the data coming in is actually in the right format before the app tries to use it? Share what you find with me before we move on.',
  ],
  L2: [
    'What happens in this feature if someone sends a missing or wrong value — does it give a clear error message, or does it just break? Try it and tell me what you see.',
  ],
  L3: [
    'What\'s one piece of data this feature accepts that isn\'t being checked before it gets used?',
  ],
};

export const ABSENCE_CI_PIPELINE_BEGINNER: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    '1. Check whether this project has anything set up to run the tests automatically whenever code is pushed. 2. If not, this is a good time to set that up so mistakes get caught before they reach the final code. 3. Share what you find with me before we continue.',
    'Go through what happens when code gets pushed to this feature — do the tests run automatically, or does someone have to remember to run them by hand? Share what you find with me before we move on.',
  ],
  L2: [
    'Does this project have something that automatically runs the tests whenever code is pushed — and does it stop bad code from getting merged if the tests fail?',
  ],
  L3: [
    'Is there anything that runs automatically when new code is added to this project — like the tests? Tell me what happens and we\'ll figure out if anything is missing.',
  ],
};

export const ABSENCE_RATE_LIMITING_BEGINNER: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    '1. Think about what would happen if someone sent a huge number of requests to this feature very quickly. 2. Check whether the app has any limit on how many times it can be called in a short period. 3. Share what you find with me before we continue.',
    'Go through what was just built and check — if someone calls this API endpoint hundreds of times in a row, does the app handle that, or would it start having problems? Share what you find with me before we move on.',
  ],
  L2: [
    'Does this feature have any kind of limit on how many times someone can call it in a short period — and what happens if they go over that limit?',
  ],
  L3: [
    'What\'s one way someone could use this feature too much — and is there anything currently stopping that from happening?',
  ],
};

export const ABSENCE_FEATURE_SCOPE_BEGINNER: DecisionContent = {
  question:      'Building this — what should it actually do?',
  pinchFallback: 'Scope first.',
  L1: [
    '1. Before we keep going — help me describe in plain words what this part of the app should do and what \'finished\' looks like for it.\n2. Share that back with me so we\'re both on the same page.\n3. Then tell me: is there anything about what I want that is still unclear to you?',
    'Help me write one sentence about what we\'re building right now and how I\'d know it\'s done — then share it with me before continuing.',
  ],
  L2: [
    'What is the one thing this part of the app is supposed to do — and how will I know when it\'s working the way I want? Share your answer with me first.',
  ],
  L3: [
    'In plain words — what exactly are we building here and how will we know it\'s done?',
  ],
};

export const ABSENCE_IMPLEMENTATION_CHECKPOINT_BEGINNER: DecisionContent = {
  question:      'Built something new — does it actually work?',
  pinchFallback: 'Quick check.',
  L1: [
    '1. Before adding anything else — can you quickly try out what was just built?\n2. Tell me: does it do what we expected, or is something not working yet?\n3. If something\'s off, let\'s fix it before we keep going — it\'s easier to catch now than after more code is added on top.',
    'Try what was just built and share what happens — does it work the way we want it to? One quick test before we continue building.',
  ],
  L2: [
    'Does what was just built actually work? Try it and tell me what you see before we add anything else.',
  ],
  L3: [
    'Does this work yet? Quick check before we keep building.',
  ],
};

export const ABSENCE_SPEC_BEFORE_CODE_BEGINNER: DecisionContent = {
  question:      'Coding this — what\'s it supposed to do?',
  pinchFallback: 'Spec first.',
  L1: [
    '1. Before we write more code — describe in plain words what this is supposed to do.\n2. What should happen when it works correctly? Share that with me first.\n3. Then we\'ll write it — having that clear makes the code much simpler.',
    'Tell me what you want this to do — in plain English, step by step — before we start coding it. What happens when it works? Share that first.',
  ],
  L2: [
    'What should this do and how will I know it\'s working? Describe it in plain words before we write the code.',
  ],
  L3: [
    'In plain words — what should this do? Tell me before we start coding.',
  ],
};

// ── Phase 7 F1-F2 — session-quality signals (BEGINNER register) ───────────────

export const ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER: DecisionContent = {
  question:      'Accepting without reviewing — applied critical check recently?',
  pinchFallback: 'Streak alert.',
  L1: [
    'You haven\'t questioned any of Claude\'s suggestions in a while.',
  ],
  L2: [
    'Even good suggestions can be wrong or not quite right for your specific situation. It\'s healthy to occasionally say \'wait, is this actually correct?\' before accepting. Checking suggestions helps you catch mistakes before they build up.',
  ],
  L3: [
    'Look back at the last few suggestions Claude made — is there anything you\'d like to double-check or question before continuing?',
  ],
};

export const ABSENCE_WORK_RHYTHM_CHECK_BEGINNER: DecisionContent = {
  question:      'Sending fast — read the last response fully before continuing?',
  pinchFallback: 'Slow down.',
  L1: [
    'You\'re sending messages very quickly.',
  ],
  L2: [
    'When you send messages faster than you have time to read the responses, it\'s easy to miss errors or misunderstand what Claude built. Taking a moment to read each response fully before sending the next one leads to better results and fewer mistakes to fix later.',
  ],
  L3: [
    'Pause and read through Claude\'s last response before continuing.',
  ],
};

export const ABSENCE_FOCUS_DRIFT_DETECTION_BEGINNER: DecisionContent = {
  question:      'Working on many things — finished any of them yet?',
  pinchFallback: 'Focus drift.',
  L1: [
    'You\'ve started a lot of different things in this session.',
  ],
  L2: [
    'Working on too many different things at once without finishing any of them makes it harder to do any of them well. Every time you switch to something new, it takes time to get back into what you were doing before. Finishing one thing completely before starting the next leads to better results.',
  ],
  L3: [
    'Pick the most important thing from this session and focus on finishing it before starting anything else.',
  ],
};

export const ABSENCE_SESSION_LENGTH_CHECKPOINT_BEGINNER: DecisionContent = {
  question:      'Working for a while — what have you built so far?',
  pinchFallback: 'Checkpoint due.',
  L1: [
    'You\'ve been working for a while — what have you built so far?',
  ],
  L2: [
    'After a long session, it\'s easy to lose track of what was done and what still needs doing. Writing a quick summary helps you and Claude stay in sync for the rest of the session.',
  ],
  L3: [
    'Tell Claude: here\'s what we\'ve built so far, and here\'s what we still need to do.',
  ],
};

export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_BEGINNER: DecisionContent = {
  question:      'Built a lot — have you written down what you made?',
  pinchFallback: 'Document now.',
  L1: [
    'You\'ve built a lot — have you written down what you made?',
  ],
  L2: [
    'When you build a lot without documenting it, it gets hard to remember what was done and why it was done that way. A short README update or code comment keeps the project understandable later.',
  ],
  L3: [
    'Take a moment to write down what you built in this session, even just a few sentences.',
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
