// Per-class decision-session content (class5_session_quality). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

export const ABSENCE_COMPREHENSION: DecisionContent = {
  signalType:   "ABSENCE_COMPREHENSION",
  question:      'AI generated it — do you understand it?',
  pinchFallback: 'Comprehension check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_COMPREHENSION'],
  L1: [
    {
      option: 'Review what was just built for comprehension: trace through the main execution path and explain what each significant function, class, and data structure does — independently, without relying on comments generated alongside the code.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: feature implementation accepted. Main-execution-path trace through generated code not performed."}
Comprehension of the main execution path hasn't been verified independently — generated code may carry plausible-but-unverified logic.
Trace each significant function / class / data structure; explain what each does without relying on inline-generated comments. Don't refactor in this pass.
{R4_CLOSE}`,
    },
    {
      option: 'Audit your understanding of what was just built: identify any part of the code you could not explain to a colleague without reading it again. For each such part, either gain that understanding now or flag it as a comprehension debt before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation done; comprehension-debt enumeration not done."}
Comprehension-debt across what was just built hasn't been enumerated.
Per component: explain to a colleague-level audience without re-reading; flag any "could-not-explain" parts as debt. List only.
{R4_CLOSE}`,
    },
    {
      option: 'Check whether what was just built contains any abstractions, design patterns, or external library usage you accepted without fully understanding — verify what each one does and why it was chosen for this specific context.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Implementation accepted; unfamiliar-abstraction / library-usage comprehension not verified."}
Abstraction / pattern / external-library usage accepted without full comprehension hasn't been audited.
Per each: verify what it does + why it was chosen for this specific context. Don't replace yet.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is there any part of what was just built you could not confidently explain to another developer right now? Address that before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done; confident-explanation test not run."}
Lighter: confident-explain-to-developer test hasn't been done.
Identify any part you couldn't explain confidently right now; address that part.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built and identify any code you accepted because it looked correct without actually verifying the logic yourself.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation accepted; looked-correct-without-verification spot-check not done."}
Narrower: looked-correct-without-verification audit.
Walk through and flag any code accepted because it looked correct without verifying the logic.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that you haven\'t manually traced through and fully understood?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done."}
Minimum next step: anything not manually traced through + fully understood.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_NO_PUSHBACK: DecisionContent = {
  signalType:   "ABSENCE_NO_PUSHBACK",
  question:      'AI suggesting — are you evaluating critically?',
  pinchFallback: 'No pushback.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_NO_PUSHBACK'],
  L1: [
    {
      option: 'Review the recent generated outputs used in what was just built: identify any decisions, implementations, or suggestions you accepted without explicitly verifying the reasoning, checking for alternatives, or questioning the assumptions embedded in the response.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: generated output accepted without independent verification of reasoning / alternatives / embedded assumptions."}
The independent-verification audit of recent generated output hasn't been done.
Per significant decision / implementation / suggestion accepted: verify reasoning, check for unexplored alternatives, question embedded assumptions. List findings only.
{R4_CLOSE}`,
    },
    {
      option: 'Audit your acceptance pattern while building this feature: for each significant AI output, ask whether you evaluated it independently or accepted it because it was confident and plausible. Flag any output where you would struggle to justify the implementation choice to a peer reviewer.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent acceptance pattern unevaluated — confidence-plausibility-based acceptance may have replaced critical evaluation."}
The acceptance-pattern audit (confidence-plausibility vs critical-evaluation) hasn't been performed.
Per significant accepted output: would I struggle to justify it to a peer reviewer? Flag those. Listing only.
{R4_CLOSE}`,
    },
    {
      option: 'Cross-confirm the most recent suggestion used in what was just built: what assumptions were made that were not in your prompt, what alternatives were not considered, and is the approach chosen actually the best fit for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Latest accepted output not cross-confirmed — embedded assumptions / un-considered alternatives unaudited."}
Cross-confirmation of the most recently accepted output hasn't been done.
For that output: surface embedded-but-unstated assumptions; identify alternatives it did not consider; assess whether the chosen approach is the best fit for this project. Don't replace — flag.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Take the last significant AI output used in what was just built and evaluate it critically: do you agree with the approach, and if so, can you explain why it is better than the alternatives?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Last significant output accepted without critical evaluation."}
Lighter: critical evaluation of the last significant output hasn't been applied.
Take that output; evaluate the approach; articulate why it's better than alternatives (or flag if not).
{R4_CLOSE}`,
    },
    {
      option: 'Is there any AI output used in what was just built that you accepted because it sounded right rather than because you verified it was right?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Acceptance based on sounded-right pattern not separated from verified-right pattern."}
Narrower: sounded-right vs verified-right separation.
Identify any output accepted because it sounded right rather than verified-right.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any AI suggestion used in what was just built that you accepted without questioning the reasoning or checking for better alternatives?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Implementation done."}
Minimum next step: any accepted output where reasoning wasn't questioned + alternatives weren't checked.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_COMPREHENSION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_COMPREHENSION",
  question:      'AI wrote it — do you actually get it?',
  pinchFallback: 'Comprehension check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_COMPREHENSION'],
  L1: [
    {
      option: 'Look at what was just built — is there any part you couldn\'t explain to someone else right now? Find the bit you\'re least confident about and trace through it until you actually understand what it does.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I went along with what was generated without fully understanding all the parts."}
The least-confident part of what was just built hasn't been traced through.
Find the bit I'm least confident about; trace through until I actually understand what it does. Don't rewrite — just trace.
{R4_CLOSE}`,
    },
    {
      option: 'Walk through what was just built and spot the parts you accepted because they looked right, not because you verified them. Pick the riskiest one and make sure you understand it properly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Accepted some parts of what was just built because they looked right, not because I verified them."}
The looked-right-without-verifying check hasn't been done.
Pick the riskiest accepted-without-verifying piece; trace its logic; confirm I actually get it.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built that uses a library or approach you haven\'t used before? Make sure you understand what it does — not just that it works — before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Used a library / approach I haven't used before in what was just built; only know that it works, not why."}
Comprehension of any unfamiliar library / approach used hasn't been verified.
Confirm what it does and why it fits — not just that it works. Don't broaden into other comprehension gaps.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the part of what was just built you\'re least confident you understand? Trace through it and make sure you get it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it; not sure I understand every part."}
The least-confident-piece comprehension check hasn't been done.
Trace through that one piece; make sure I actually get it.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built you accepted without really checking the logic? Flag it and go back through it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Took some parts as-is without really checking the logic."}
Narrower: accepted-without-checking-logic audit.
Flag the spot; go back through the logic now.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in what was just built that you haven\'t fully understood and verified yourself?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: anything I haven't fully understood + verified myself.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_NO_PUSHBACK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_NO_PUSHBACK",
  question:      'AI keeps suggesting — are you actually evaluating?',
  pinchFallback: 'No pushback.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_NO_PUSHBACK'],
  L1: [
    {
      option: 'Look at the recent responses that produced what was just built — is there anything you accepted without really thinking about whether it was the right call? Pick the one you\'re least sure about and push back on it now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Accepted recent suggestions without really pushing back on whether they were the right call."}
The pushback-on-recent-accepts audit hasn't been done.
Pick the suggestion I'm least sure about; push back on it now; see if it still holds up.
{R4_CLOSE}`,
    },
    {
      option: 'Check how you\'ve been accepting AI suggestions for this feature — have you been approving them because they look reasonable, or because you\'ve actually thought through the alternatives? Flag the ones where you\'re not sure.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Approving suggestions because they looked reasonable, not because I thought through alternatives."}
The looks-reasonable vs alternatives-actually-considered separation hasn't been audited.
Flag spots where I went on "looks reasonable" without checking alternatives. List only.
{R4_CLOSE}`,
    },
    {
      option: 'Take the most recent AI suggestion used in what was just built and challenge it: what assumptions did it make, what did it not consider, and is this actually the best way to do it for this project?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Latest suggestion accepted without challenging its assumptions or fit for this project."}
The challenge-latest-suggestion review hasn't been done.
Take the most recent significant suggestion; surface assumptions it made; identify what it didn't consider; assess whether it's actually the best way to do it here.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the last AI output used in what was just built that you accepted without questioning it? Push back on it now and see if it holds up.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Accepted the last output without really questioning it."}
The last-output question-pushback hasn't been applied.
Push back on it now; check if it holds up.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in what was just built where you accepted a recent suggestion because it sounded confident, not because you verified it yourself?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Accepted some output because it sounded confident, not because I verified it."}
Narrower: sounded-confident vs verified-right separation.
Identify the spot where confidence-plausibility replaced verification.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there any AI suggestion used in what was just built that you accepted without actually evaluating whether it was the right approach?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Built it."}
Minimum next step: any suggestion accepted without evaluating whether the approach was right.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CONTEXT_LOSS: DecisionContent = {
  signalType:   "ABSENCE_CONTEXT_LOSS",
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CONTEXT_LOSS'],
  L1: [
    {
      option: 'Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; constraint / assumption / decision-thread reconstruction not done."}
Active constraints, assumptions, and decision-thread for this session haven't been reconstructed — silent compounding of forgotten context could distort follow-on decisions.
Reconstruct: constraints in play / assumptions still unverified / decision-thread from goal → current work.
{R4_CLOSE}`,
    },
    {
      option: 'Write a session summary for this project: what has been implemented, what the key technical decisions were, what the current blockers are, and what the next two or three steps are.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; decision-log reconstruction not done."}
The decision log for this session hasn't been reconstructed.
Capture: implementation milestones / key tech decisions / current blockers / next 2-3 steps.
{R4_CLOSE}`,
    },
    {
      option: 'Before continuing work on this feature: list every significant decision made in this session, the current working state of the implementation, and what remains to complete the agreed scope — this prevents the session from drifting.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; agreed-scope vs current-work map not done."}
The agreed-scope vs current-work map hasn't been built — session-drift risk.
List: significant decisions in this session / current implementation state / remaining-to-complete vs agreed scope.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the current state of what was just built — what is working, what is still in progress, and what is the immediate next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session; current-state anchor not done."}
Lighter: working / in-progress / immediate next step — but in terms of remaining-constraints lens.
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important technical decision made this session about this feature that must be explicitly carried forward before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session; constraint/assumption carry-forward not flagged."}
Narrower: the single most important constraint or assumption decision that must be carried forward — not "decision" generically, but the one whose loss would silently distort follow-on work.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the one piece of context about this project that must not be lost before continuing — the single most important thing to anchor right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session; decision-thread anchor not identified."}
Minimum next step: the one decision-thread anchor without which follow-on work would silently drift — the single link in the goal-to-current-work chain that cannot be reconstructed if lost.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CONTEXT_LOSS_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_CONTEXT_LOSS",
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CONTEXT_LOSS'],
  L1: [
    {
      option: 'Let\'s get back on the same page — go through what was just built and give me a quick rundown: what\'s done, what\'s working, and what\'s still left to do.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been in this session for a while; I haven't paused to reconstruct what's still in scope and what's been decided."}
The session context hasn't been reconstructed — what's done / working / left is fuzzy.
Quick rundown: what's done, what's working, what's still left.
{R4_CLOSE}`,
    },
    {
      option: 'Take a minute to catch up on this project — what have we actually built this session, what decisions did we make, and what\'s coming next?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; recap of what was built / decided / coming-next not done."}
The catch-up recap hasn't been done.
Tell me: what we built / what decisions we made / what's coming next.
{R4_CLOSE}`,
    },
    {
      option: 'Before going further with this feature — do a quick check: where are we, what\'s working, and what\'s the next thing that actually needs to happen?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; pre-continue check not done."}
The pre-continue check hasn't been done.
Where are we / what's working / what's the next thing that needs to happen.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the situation with what was just built right now — what\'s working and what still needs to happen?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session; current situation unclear."}
Lighter: situation now — working vs still-needs-to-happen.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the most important decision we made about this feature this session that you want to make sure we don\'t lose track of?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session; key-decisions not flagged for carry-forward."}
Narrower: the most important decision I shouldn't lose track of.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What\'s the one thing you most need to remember about where this project is right now before you keep going?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Minimum next step: the one thing I most need to remember before continuing.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 7 F1-F2 — session-quality signals (CASUAL register) ─────────────────
export const ABSENCE_DECISION_FATIGUE_PATTERN_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DECISION_FATIGUE_PATTERN",
  question:      'Long acceptance streak — applied critical review recently?',
  pinchFallback: 'Streak alert.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DECISION_FATIGUE_PATTERN'],
  L1: [
    {
      option: 'Review the last few AI responses critically — especially for edge cases, hidden assumptions, and anything that was accepted without being read carefully.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been accepting AI responses fast without really reviewing them critically."}
The critical-review hasn't been done on recent responses.
Look at recent output for edge cases / hidden assumptions / accepted-without-reading items.
{R4_CLOSE}`,
    },
    {
      option: 'Push back on the last significant AI suggestion: what would you question if you were reviewing this code rather than writing it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Streak of acceptances; pushback not done."}
The pushback on the last significant suggestion hasn't been done.
Question what a reviewer would question.
{R4_CLOSE}`,
    },
    {
      option: 'Check recent AI output for anything that looks right at a glance but might fail — edge cases, incorrect assumptions, or logic that was never validated.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Streak; looks-right-but-might-fail check not done."}
The looks-right-but-might-fail check hasn't been done.
Spot edge cases / incorrect assumptions / never-validated logic.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Look at the last AI response with fresh eyes — is there anything you would question or verify before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Streak; fresh-eyes review not done."}
Lighter: fresh-eyes look at last response — anything to question or verify.
{R4_CLOSE}`,
    },
    {
      option: 'Pick one thing from recent AI output to double-check before the next prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Streak; one-thing double-check not done."}
Narrower: one thing from recent output to double-check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Is there anything in the last AI response worth questioning before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Streak."}
Minimum next step: anything in the last response worth questioning.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_WORK_RHYTHM_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_WORK_RHYTHM_CHECK",
  question:      'Rapid prompting — verified each response before continuing?',
  pinchFallback: 'Slow down.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_WORK_RHYTHM_CHECK'],
  L1: [
    {
      option: 'Read and verify the last AI response before continuing — check for anything that looks right at a glance but might be wrong: logic gaps, unchecked edge cases, incomplete error handling.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been sending prompts fast without really reading the responses."}
The last response hasn't been read and verified.
Spot looks-right-but-might-be-wrong items — logic gaps / unchecked edge cases / incomplete error handling.
{R4_CLOSE}`,
    },
    {
      option: 'Before the next prompt: read the last response fully, identify anything not yet verified, and confirm the generated code is actually correct.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Rapid sends; pre-next-prompt verify not done."}
The pre-next-prompt verify hasn't been done.
Read fully / unverified items / generated-code-correctness check.
{R4_CLOSE}`,
    },
    {
      option: 'Slow down: read the last AI output in full and check for anything unverified before the next message.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Rapid sends; slow-down read not done."}
The slow-down read hasn't been done.
Read in full; check unverified items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Read the last AI response fully before continuing — has everything been verified?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Rapid sends; full read not done."}
Lighter: full read + everything-verified check.
{R4_CLOSE}`,
    },
    {
      option: 'Is there anything in the last response that was accepted without being read carefully?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Rapid sends; carefully-read check not done."}
Narrower: accepted-without-reading-carefully items.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Read the last response before sending the next message.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Rapid sends."}
Minimum next step: read the last response before the next send.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FOCUS_DRIFT_DETECTION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_FOCUS_DRIFT_DETECTION",
  question:      'Multiple areas open — completed any end-to-end?',
  pinchFallback: 'Focus drift.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FOCUS_DRIFT_DETECTION'],
  L1: [
    {
      option: 'Finish one thing before starting another: identify what is open right now, pick the most important one, and close it completely before touching anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been jumping between multiple things this session without finishing any of them."}
Finishing one thing before starting another hasn't been done.
Spot opens; pick most important; close it completely before touching anything else.
{R4_CLOSE}`,
    },
    {
      option: 'List the open concerns in this session, pick the most critical one, and complete it — resist starting anything new until that one is done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Multiple open concerns; resist-new not applied."}
The resist-new discipline hasn't been applied.
List opens / pick critical / complete it / hold the line against starting new.
{R4_CLOSE}`,
    },
    {
      option: 'Close one open thread end-to-end before continuing: what is the most important unfinished thing right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Open threads; close-one-end-to-end not done."}
The close-one-end-to-end discipline hasn't been applied.
Spot the most important unfinished thing; close it; then continue.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the most important open concern to complete right now, before anything else?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple open concerns."}
Lighter: most important open to complete right now.
{R4_CLOSE}`,
    },
    {
      option: 'Pick one thing to finish completely before starting something new.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple open concerns; one-to-finish not picked."}
Narrower: pick one to finish before new.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Complete one thing before opening another.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Multiple open concerns."}
Minimum next step: complete one before opening another.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SESSION_LENGTH_CHECKPOINT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SESSION_LENGTH_CHECKPOINT",
  question:      'Extended session — context checkpoint done?',
  pinchFallback: 'Checkpoint due.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SESSION_LENGTH_CHECKPOINT'],
  L1: [
    {
      option: 'Drop a context checkpoint before continuing: what has been built, what decisions were made, what is still open, and what the current goal is.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; haven't dropped a checkpoint."}
A context checkpoint hasn't been dropped.
Built / decisions / still open / current goal.
{R4_CLOSE}`,
    },
    {
      option: 'Summarize where things stand: what got done, what decisions were made, and what is still open — so the next part of the session starts with clear state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; status summary not done."}
The status summary hasn't been done.
Where-things-stand: done / decisions / still open.
{R4_CLOSE}`,
    },
    {
      option: 'What is the current build state — what works, what is in progress, and what is the next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long session; current build state unclear."}
Current build state hasn't been called out.
Works / in-progress / next step.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What has been built this session — what is working and what is still in progress?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Lighter: what's built — working / in-progress.
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important decision made this session that needs to carry forward?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session; carry-forward decision unclear."}
Narrower: most important carry-forward decision.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the one most important thing to not lose track of before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long session."}
Minimum next step: the one most important thing to not lose track of.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_PROGRESS_CONSOLIDATION_GAP",
  question:      'Extended implementation — progress documented?',
  pinchFallback: 'Document now.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROGRESS_CONSOLIDATION_GAP'],
  L1: [
    {
      option: 'Consolidate: update the README, write a brief description of what was built, or add clarifying comments before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "I've been building a lot in this session and I haven't written any of it down."}
Consolidation hasn't been done.
Update README / write brief description / add clarifying comments.
{R4_CLOSE}`,
    },
    {
      option: 'Lock in the current state: write down what was built, any key decisions made, and what is still open — before the session context is lost.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long build run; current state not locked in."}
The state lock-in hasn't been done.
Write: built / key decisions / still open.
{R4_CLOSE}`,
    },
    {
      option: 'Write a quick progress note — what was built, what decisions were made, and what comes next.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long build run; progress note not written."}
The progress note hasn't been written.
Quick note: built / decisions / what comes next.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Add a brief note or comment documenting what was just built before moving on.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long build run."}
Lighter: brief note or comment documenting what was just built.
{R4_CLOSE}`,
    },
    {
      option: 'Write one sentence about the key decision made in this implementation run.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long build run."}
Narrower: one sentence about the key decision in this implementation run.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write a one-sentence note on what was built before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Long build run."}
Minimum next step: one-sentence note on what was built.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 7 F1-F2 — session-quality signals (FORMAL register) ─────────────────
export const ABSENCE_DECISION_FATIGUE_PATTERN_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_DECISION_FATIGUE_PATTERN",
  question:      'Long acceptance streak — applied critical review recently?',
  pinchFallback: 'Streak alert.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DECISION_FATIGUE_PATTERN'],
  L1: [
    {
      option: 'Apply deliberate critical review to the most recent AI responses: identify any assumptions that have not been validated, logic that could fail under edge cases, and changes made without explicit verification.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: long AI-acceptance streak. No critical review of the streak done."}
A critical review of the recent AI-acceptance streak hasn't been done — assumptions or edge-case failures may have slipped through unchallenged.
Apply deliberate critical review: unvalidated assumptions / edge-case logic / unverified changes.
{R4_CLOSE}`,
    },
    {
      option: 'Self-review the last set of AI-generated changes: flag any hallucinated functions, plausible-but-incorrect logic, or unhandled edge cases before accepting the next response.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Long acceptance streak; self-review on recent changes not performed."}
The self-review on recent AI-generated changes hasn't been performed.
Flag: hallucinated functions / plausible-but-incorrect logic / unhandled edge cases.
{R4_CLOSE}`,
    },
    {
      option: 'Audit recent AI output for correctness: check any state or data assumptions, verify control flow, and identify anything that was accepted without being read carefully.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Acceptance streak; correctness audit not done."}
The correctness audit on recent output hasn't been done.
Check state/data assumptions / verify control flow / identify accepted-but-unread items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Review recent AI responses critically — what would you flag if reviewing this as a senior engineer rather than as the author?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Acceptance streak; senior-reviewer lens not applied."}
Lighter: senior-engineer-reviewer lens — what'd you flag?
{R4_CLOSE}`,
    },
    {
      option: 'Pick the most significant recent AI response and push back on one aspect of it before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Acceptance streak; pushback not exercised."}
Narrower: most-significant recent response + push back on one aspect.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify one thing in recent AI output to verify or question before accepting the next response.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Acceptance streak."}
Minimum next step: one thing to verify or question before next-response acceptance.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_WORK_RHYTHM_CHECK_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_WORK_RHYTHM_CHECK",
  question:      'Rapid prompting — verified each response before continuing?',
  pinchFallback: 'Slow down.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_WORK_RHYTHM_CHECK'],
  L1: [
    {
      option: 'Read and verify the last AI response in full before sending the next prompt: check any logic or state assumptions, confirm any generated code is complete and correct, and identify anything that was not explicitly validated.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: rapid send rate. Last AI response not fully read/verified."}
The last AI response hasn't been read and verified before the next prompt — rapid prompting risks accepting unverified content.
Read fully; check logic / state assumptions / generated-code correctness / unvalidated items.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the last AI-generated change for correctness before proceeding: trace any control flow, check any state transitions, and verify all assumptions are grounded.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Rapid prompting; correctness audit on last change not done."}
The correctness audit on the last AI change hasn't been done.
Trace control flow / check state transitions / verify assumptions grounded.
{R4_CLOSE}`,
    },
    {
      option: 'Pause and review the last response before continuing: identify any part that was generated but not read, any assumption that was not confirmed, and any error handling that may be missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Rapid prompting; pause-and-review not done."}
The pause-and-review on the last response hasn't been done.
Identify generated-but-not-read / unconfirmed assumptions / missing error handling.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Read the last AI response carefully before sending the next prompt — is there anything unread or unverified?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Rapid prompting; careful read not done."}
Lighter: careful read of last response; unread / unverified items.
{R4_CLOSE}`,
    },
    {
      option: 'Check the last generated output for any assumptions or errors before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Rapid prompting; assumption/error check not done."}
Narrower: assumptions or errors in the last generated output.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Pause — read the last response before sending the next message.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Rapid prompting."}
Minimum next step: pause + read last response.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FOCUS_DRIFT_DETECTION_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_FOCUS_DRIFT_DETECTION",
  question:      'Multiple areas open — completed any end-to-end?',
  pinchFallback: 'Focus drift.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FOCUS_DRIFT_DETECTION'],
  L1: [
    {
      option: 'Sequence your work: identify the highest-priority open concern in this session, complete it end-to-end, and define done for that domain before opening any additional concerns.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Recent prompts: multiple concerns touched. No end-to-end completion."}
Multiple open concerns in this session haven't been completed end-to-end — context-switching costs are compounding.
Identify highest-priority open concern; complete it end-to-end; define done; only then open new concerns.
{R4_CLOSE}`,
    },
    {
      option: 'Close one open concern completely before touching another: list the current open concerns, pick the most critical, and do not touch the others until it is resolved.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Multiple open concerns; close-one-before-touching-another discipline not applied."}
The one-at-a-time discipline hasn't been applied.
List current opens / pick most critical / hold off others until resolved.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the current session\'s open concerns: name them all, rank them by criticality, and commit to completing the top one before any other context switch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Multiple open concerns; audit + commitment not done."}
The open-concerns audit hasn't been done.
Name all open concerns / rank by criticality / commit to top one before next context switch.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Pick the single most important open concern in this session and complete it before starting anything else.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Multiple open concerns; pick-one not done."}
Lighter: pick single most-important; complete; only then start anything else.
{R4_CLOSE}`,
    },
    {
      option: 'What is the one thing in this session that must be finished before anything else can be safely started?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Multiple open concerns; finish-before-safe-start not identified."}
Narrower: the one thing to finish before any safe new start.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Complete one open concern end-to-end before opening another.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Multiple open concerns."}
Minimum next step: complete one end-to-end before opening another.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SESSION_LENGTH_CHECKPOINT_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_SESSION_LENGTH_CHECKPOINT",
  question:      'Extended session — context checkpoint done?',
  pinchFallback: 'Checkpoint due.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SESSION_LENGTH_CHECKPOINT'],
  L1: [
    {
      option: 'Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; status checkpoint not done."}
A status checkpoint for this extended session hasn't been done — current state, working pieces, and next steps aren't anchored.
Summarize current build status: decisions made / working / incomplete / changes since start.
{R4_CLOSE}`,
    },
    {
      option: 'Reconstruct the decision log for this session: what tradeoffs were made, what constraints were identified, and what is still unresolved — so the next phase starts with explicit context, not implicit state.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; decision log not reconstructed."}
The decision log for this session hasn't been reconstructed.
Reconstruct: tradeoffs / constraints identified / still unresolved — explicit context, not implicit state.
{R4_CLOSE}`,
    },
    {
      option: 'Audit the current build state against the original goal: what was actually completed, what was deferred, and what decisions may need revisiting before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended session; goal-vs-actual audit not done."}
The original-goal-vs-actual-state audit hasn't been done.
List: actually completed / deferred / decisions to revisit.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What is the current state of what was just built — what is working, what is still in progress, and what is the immediate next step?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session."}
Lighter: current state — working / in-progress / immediate next step.
{R4_CLOSE}`,
    },
    {
      option: 'What is the most important technical decision made this session that must be explicitly carried forward before continuing?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session; carry-forward decision not flagged."}
Narrower: most important decision needing explicit carry-forward.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'What is the one piece of context about this project that must not be lost before continuing — the single most important thing to anchor right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended session."}
Minimum next step: one not-to-be-lost context anchor.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_PROGRESS_CONSOLIDATION_GAP",
  question:      'Extended implementation — progress documented?',
  pinchFallback: 'Document now.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROGRESS_CONSOLIDATION_GAP'],
  L1: [
    {
      option: 'Consolidate the current build state: document what has been implemented, capture the key decisions made, and record any outstanding work before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended implementation; consolidation not done."}
Progress made in this session hasn't been consolidated — implicit state risks being lost as the session continues.
Document: implemented / key decisions / outstanding work.
{R4_CLOSE}`,
    },
    {
      option: 'Update the project documentation to reflect the current state: what was built, why it was designed this way, and what has been deferred — make the implicit state explicit.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended implementation; doc update not done."}
Project docs haven't been updated.
Update: built / design rationale / deferred items — make implicit state explicit.
{R4_CLOSE}`,
    },
    {
      option: 'Write a progress summary covering what was built in this session, what technical decisions were made, and what remains before the feature is complete.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Extended implementation; progress summary not written."}
The progress summary hasn't been written.
Cover: built this session / technical decisions / remaining-before-complete.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Update documentation or comments to reflect the current implementation state before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended implementation; docs not updated."}
Lighter: update docs or comments to reflect current state.
{R4_CLOSE}`,
    },
    {
      option: 'Write a brief note on what was built and what key technical decisions were made.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended implementation; brief-note not written."}
Narrower: brief note — built + key decisions.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write one sentence documenting the most important thing about what was just built before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Extended implementation."}
Minimum next step: one sentence documenting the most important thing.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_COMPREHENSION_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_COMPREHENSION",
  question:      'AI wrote it — do you actually get it?',
  pinchFallback: 'Comprehension check.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_COMPREHENSION'],
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

export const ABSENCE_NO_PUSHBACK_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_NO_PUSHBACK",
  question:      'AI keeps suggesting — are you actually evaluating?',
  pinchFallback: 'No pushback.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_NO_PUSHBACK'],
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

export const ABSENCE_CONTEXT_LOSS_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_CONTEXT_LOSS",
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CONTEXT_LOSS'],
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

// ── Phase 7 F1-F2 — session-quality signals (BEGINNER register) ───────────────
export const ABSENCE_DECISION_FATIGUE_PATTERN_BEGINNER: DecisionContent = {
  signalType:   "ABSENCE_DECISION_FATIGUE_PATTERN",
  question:      'Accepting without reviewing — applied critical check recently?',
  pinchFallback: 'Streak alert.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DECISION_FATIGUE_PATTERN'],
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
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_WORK_RHYTHM_CHECK'],
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
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FOCUS_DRIFT_DETECTION'],
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
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SESSION_LENGTH_CHECKPOINT'],
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
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PROGRESS_CONSOLIDATION_GAP'],
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
