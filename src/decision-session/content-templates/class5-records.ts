/**
 * Session-quality content-template records (class 5). One record per signal; column 3
 * is the existing shipped headline (kept verbatim), and columns 1/2/4/5 escalate the
 * same practice from a quick check up to its heaviest form.
 *
 * These are session / meta-cognitive signals — comprehension, critical pushback,
 * decision fatigue, work rhythm, focus, context recap, session checkpoint, progress
 * consolidation. Six of them produce a written record at the heaviest column: the
 * three session-capture signals (context recap, session checkpoint, progress
 * consolidation) and the three verification-of-output signals (comprehension,
 * pushback, decision fatigue — like the verification class, their heaviest form is a
 * written review/critique/comprehension note). The two pure pacing/sequencing habits
 * (work rhythm, focus drift) have no artifact — their heaviest column stays a
 * behaviour. None concerns a sensitive action, so none carries a confirm-seek, and
 * none threads a separate intensifying spine. All eight are formal-headline signals.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';
import {
  COMPREHENSION_BEGINNER_OVERRIDE, NO_PUSHBACK_BEGINNER_OVERRIDE, CONTEXT_LOSS_BEGINNER_OVERRIDE,
  DECISION_FATIGUE_PATTERN_BEGINNER_OVERRIDE, WORK_RHYTHM_CHECK_BEGINNER_OVERRIDE,
  FOCUS_DRIFT_DETECTION_BEGINNER_OVERRIDE, SESSION_LENGTH_CHECKPOINT_BEGINNER_OVERRIDE,
  PROGRESS_CONSOLIDATION_GAP_BEGINNER_OVERRIDE,
} from './class5-records-beginner.js';
import {
  CONTEXT_LOSS_FOUNDER_OVERRIDE, CONTEXT_LOSS_INDIE_HACKER_OVERRIDE, CONTEXT_LOSS_PM_OVERRIDE,
} from './context-loss-role-overrides.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes a session-quality why-desc grounds (same generic sources as the other classes). */
export const SESSION_QUALITY_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

/** ABSENCE_COMPREHENSION — understand the generated code, keyword "comprehension". Heaviest = a written comprehension note. */
export const ABSENCE_COMPREHENSION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_COMPREHENSION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: COMPREHENSION_BEGINNER_OVERRIDE },
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Spot-check your comprehension of what was just built: pick the one part you understand least and trace it.", "Just the single least-understood part — trace that one to build comprehension, don't audit the whole thing yet."),
    2: form("Review what was just built for comprehension: trace the main path and explain what each key piece does in your own words.", "Scope the comprehension check to the main path — trace it and explain each key piece in your own words, no comments to lean on."),
    3: form("Review what was just built for comprehension: trace through the main execution path and explain what each significant function, class, and data structure does — independently, without relying on comments generated alongside the code.", "Trace the main execution path and explain each significant function, class, and data structure in your own words — independently, not leaning on the comments generated with the code."),
    4: form("Audit your comprehension across what was just built: flag every part you could not explain to another developer without re-reading, and close each comprehension gap.", "Go past the main path — flag every part you couldn't explain to another developer without re-reading, and close each comprehension gap."),
    5: form("Write a comprehension note: trace each significant component end-to-end and document its role, the decisions behind it, and how the pieces fit together — so the understanding is durable and nothing accepted blindly survives.", "Capture a comprehension note — each significant component's role end-to-end, the decisions behind it, and how the pieces fit — so nothing was accepted blindly."),
  },
};

/** ABSENCE_NO_PUSHBACK — critically evaluate AI output, keyword "question". Heaviest = a written pushback note. */
export const ABSENCE_NO_PUSHBACK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_NO_PUSHBACK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: NO_PUSHBACK_BEGINNER_OVERRIDE },
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Question the one AI suggestion in what was just built you accepted most readily — was it actually right?", "Just the single suggestion you accepted most readily — question whether it was actually right, before anything broader."),
    2: form("Question the main decisions in what was just built: for each, was the reasoning verified or just accepted because it sounded right?", "Scope it to the main decisions — for each, question whether the reasoning was verified or just accepted because it sounded right."),
    3: form("Review the recent generated outputs used in what was just built: identify any decisions, implementations, or suggestions you accepted without explicitly verifying the reasoning, checking for alternatives, or questioning the assumptions embedded in the response.", "Find any decision, implementation, or suggestion you accepted without verifying the reasoning, checking for an alternative, or questioning the assumptions it embeds."),
    4: form("Question every significant AI output and verify it independently: for each, state the assumption it rests on, find one alternative it skipped, and check the claim against the docs or a quick test rather than trusting the explanation.", "For each significant output, question the assumption it rests on, find one alternative it skipped, and check the claim against the docs or a quick test — not just its explanation."),
    5: form("Write a pushback note: per significant decision, the assumption you questioned, the skipped alternative, the independent check you ran, and your verdict to keep or change it — so nothing stands on plausibility alone.", "Capture a pushback note — per decision: the assumption you questioned, the skipped alternative, the independent check you ran, and your keep-or-change verdict — so nothing stands on plausibility alone."),
  },
};

/** ABSENCE_CONTEXT_LOSS — reconstruct the session's constraint/assumption/decision-thread, keyword "decision". Produces a written note. */
export const ABSENCE_CONTEXT_LOSS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CONTEXT_LOSS', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: CONTEXT_LOSS_BEGINNER_OVERRIDE },
  // B11: role-tailored variants the register-only engine could not serve before (the B6 guard kept
  // them static). Served by role → register → base; supersedes the frozen context-loss-role-variants.ts.
  roleOverrides: {
    founder:      CONTEXT_LOSS_FOUNDER_OVERRIDE,
    indie_hacker: CONTEXT_LOSS_INDIE_HACKER_OVERRIDE,
    pm:           CONTEXT_LOSS_PM_OVERRIDE,
  },
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Note the single most important decision and constraint from this session in one line before continuing — what was decided and what the next step now depends on.", "Just one line — the single most important decision and constraint from this session, and what the next step now depends on."),
    2: form("Summarize the decisions made this session and the constraints they set — the main ones and what still depends on them, as a quick re-anchor.", "Keep it to the main decisions and the constraints they set — a quick re-anchor of what still depends on them, not the full thread."),
    3: form("Reconstruct the constraints, assumptions, and decision-thread for this session: list every constraint that was decided, every assumption baked in, and every decision the next step depends on — these need to be explicit and carried forward before continuing.", "List every constraint decided, every assumption baked in, and every decision the next step depends on — make them explicit and carry them forward before continuing."),
    4: form("Reconstruct the full session state: the constraints in play, the assumptions still unverified, and the decision-thread from the goal to the current work — so nothing silently distorts what comes next.", "Take the full session state — the constraints in play, the still-unverified assumptions, and the decision-thread from the goal to the current work — so nothing silently distorts what comes next."),
    5: form("Write a session-state summary note: the decisions made, the working state, the open constraints and assumptions, and the next two or three steps — kept as the re-anchor for the rest of the session.", "Capture a session-state note — the decisions made, the working state, the open constraints and assumptions, and the next two or three steps — as the re-anchor for the rest of the session."),
  },
};

/** ABSENCE_DECISION_FATIGUE_PATTERN — break the acceptance streak with review, keyword "review". Heaviest = a written review note. */
export const ABSENCE_DECISION_FATIGUE_PATTERN_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DECISION_FATIGUE_PATTERN', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: DECISION_FATIGUE_PATTERN_BEGINNER_OVERRIDE },
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Review the most recent change in what was just built with fresh eyes — the acceptance streak may have let something slip.", "Just one fresh-eyes review of the latest change — a long acceptance streak may have let something slip."),
    2: form("Review the recent AI responses critically: flag any assumption or edge case that slipped through while accepting quickly.", "Scope the review to the recent streak — flag any assumption or edge case that slipped through while accepting quickly."),
    3: form("Apply deliberate critical review to the most recent AI responses: identify any assumptions that have not been validated, logic that could fail under edge cases, and changes made without explicit verification.", "Deliberately re-check the recent responses — unvalidated assumptions, logic that could fail on edge cases, and changes made without explicit verification."),
    4: form("Review the whole acceptance streak and re-run the checks: re-test the changed paths, re-derive the key assumptions from scratch, and diff what was accepted against what you would write fresh — flag every divergence.", "Take the whole streak past a re-read — re-test the changed paths, re-derive the key assumptions from scratch, and diff what was accepted against what you'd write fresh; flag every divergence in the review."),
    5: form("Write a review note from the streak: the changes re-checked, the assumptions re-derived, the edge cases re-tested, and what needs fixing — then reset to a deliberate review-each-change rhythm rather than accepting on momentum.", "Capture a review note from the streak — the changes re-checked, assumptions re-derived, edge cases re-tested, and what needs fixing — then reset to reviewing each change instead of accepting on momentum."),
  },
};

/** ABSENCE_WORK_RHYTHM_CHECK — verify each response before the next prompt, keyword "verif". Behavioural. */
export const ABSENCE_WORK_RHYTHM_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_WORK_RHYTHM_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: WORK_RHYTHM_CHECK_BEGINNER_OVERRIDE },
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Verify the last AI response before sending the next prompt — read it in full and confirm it is correct.", "Read the last response in full and confirm it's correct before the next prompt — just that one, verified."),
    2: form("Verify the last generated change: trace the main logic and confirm the assumptions hold before continuing.", "Scope the verification to the last change — trace its main logic and confirm the assumptions hold before continuing."),
    3: form("Read and verify the last AI response in full before sending the next prompt: check any logic or state assumptions, confirm any generated code is complete and correct, and identify anything that was not explicitly validated.", "Check the logic and state assumptions, confirm the generated code is complete and correct, and flag anything not explicitly validated — before the next prompt goes out."),
    4: form("Verify each response before moving on: trace the control flow, check the state transitions, confirm the error handling, and flag anything generated-but-unread — do not let rapid prompting outrun verification.", "Extend verification to every response — trace the control flow, check state transitions, confirm error handling, and flag anything generated-but-unread; don't let rapid prompting outrun it."),
    5: form("Make verify-before-continue the rhythm: read every AI response in full, verify its logic, assumptions, and completeness, and only then send the next prompt — so no unverified change ever compounds into the next.", "Set verify-before-continue as the standing rhythm — read every response in full, verify its logic, assumptions, and completeness, and only then send the next prompt."),
  },
};

/** ABSENCE_FOCUS_DRIFT_DETECTION — one concern at a time, keyword "concern". Behavioural. */
export const ABSENCE_FOCUS_DRIFT_DETECTION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FOCUS_DRIFT_DETECTION', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: FOCUS_DRIFT_DETECTION_BEGINNER_OVERRIDE },
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Pick the single most important open concern in this session and finish it before touching another.", "Just the single most important open concern — finish that one before opening another."),
    2: form("List the open concerns in this session, pick the most critical, and hold off the others until it is done.", "Name the open concerns, pick the most critical, and hold the others off until it's done."),
    3: form("Sequence your work: identify the highest-priority open concern in this session, complete it end-to-end, and define done for that domain before opening any additional concerns.", "Take the highest-priority open concern end-to-end and define done for it before opening any additional one — stop the context-switching from compounding."),
    4: form("Audit the session's open concerns: name them all, rank by criticality, define done for the top one, and commit to finishing it before any context switch.", "Go past picking one — name every open concern, rank by criticality, define done for the top one, and commit to finishing it before any context switch."),
    5: form("Hold a strict one-concern-at-a-time discipline: finish the current concern end-to-end to its defined done, resist every new concern until it is closed, and only then sequence the next — so context-switching stops compounding.", "Keep a strict one-concern-at-a-time discipline — finish the current concern to its defined done, resist every new one until it's closed, then sequence the next."),
  },
};

/** ABSENCE_SESSION_LENGTH_CHECKPOINT — checkpoint an extended session, keyword "session". Produces a written note. */
export const ABSENCE_SESSION_LENGTH_CHECKPOINT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SESSION_LENGTH_CHECKPOINT', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: SESSION_LENGTH_CHECKPOINT_BEGINNER_OVERRIDE },
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Note a quick checkpoint for this session: what is done and what the next step is.", "Just a quick session checkpoint — what's done and what the next step is, one line each."),
    2: form("Checkpoint this session: summarize the decisions made and what remains, as an explicit anchor before continuing.", "Summarize this session's decisions and what remains, as an explicit anchor before continuing."),
    3: form("Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.", "Capture what decisions are made, what's working, what remains incomplete, and what's changed since the session started — as a re-anchor before continuing."),
    4: form("Audit this extended session against its original goal: what was completed, what was deferred, the tradeoffs and constraints identified, and the decisions to revisit — so the next phase starts from explicit context.", "Weigh this extended session against its original goal — what was completed, what was deferred, the tradeoffs and constraints found, and the decisions to revisit — so the next phase starts from explicit context."),
    5: form("Write a session checkpoint note: the decisions made, the working state, the deferred items, the open constraints, and the next steps — the explicit anchor the next phase of the session builds from.", "Capture a session checkpoint note — the decisions made, the working state, the deferred items, the open constraints, and the next steps — the anchor the next phase builds from."),
  },
};

/** ABSENCE_PROGRESS_CONSOLIDATION_GAP — document progress, keyword "document". Produces a written record. */
export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_PROGRESS_CONSOLIDATION_GAP', source: 'shipped', schemaVersion: 1, slots: [],
  registerOverrides: { beginner: PROGRESS_CONSOLIDATION_GAP_BEGINNER_OVERRIDE },
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Document the one most important thing about what was just built before continuing.", "Write down just the single most important thing about what was built before moving on — one point, documented."),
    2: form("Document the current progress: what was implemented and the key decisions made, before the session continues.", "Capture the current progress — what was implemented and the key decisions — documented before the session continues."),
    3: form("Consolidate the current build state: document what has been implemented, capture the key decisions made, and record any outstanding work before continuing.", "Write down what's been implemented, capture the key decisions, and record any outstanding work before continuing — make the session state explicit."),
    4: form("Document the full progress of what was just built: the implemented features, the design rationale, the deferred items, and the outstanding work — make the implicit session state explicit.", "Go past the basics — get the implemented features, the design rationale, the deferred items, and the outstanding work documented; make the implicit session state explicit."),
    5: form("Document the session's progress into the project docs: what was built, why it was designed this way, what was deferred, and what remains before complete — a durable record, not implicit state.", "Capture the session's progress into the project docs as a document — what was built, why it was designed this way, what was deferred, and what remains — a lasting record, not implicit state."),
  },
};

/** All class-5 session-quality records = the 8 signals (all formal-headline). */
export const CLASS5_RECORDS: readonly ContentTemplateRecord[] = [
  ABSENCE_COMPREHENSION_RECORD,
  ABSENCE_NO_PUSHBACK_RECORD,
  ABSENCE_CONTEXT_LOSS_RECORD,
  ABSENCE_DECISION_FATIGUE_PATTERN_RECORD,
  ABSENCE_WORK_RHYTHM_CHECK_RECORD,
  ABSENCE_FOCUS_DRIFT_DETECTION_RECORD,
  ABSENCE_SESSION_LENGTH_CHECKPOINT_RECORD,
  ABSENCE_PROGRESS_CONSOLIDATION_GAP_RECORD,
];
