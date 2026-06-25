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
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Spot-check your comprehension of what was just built: pick the one part you understand least and trace it.", "The lightest comprehension check: trace the single least-understood part."),
    2: form("Review what was just built for comprehension: trace the main path and explain what each key piece does in your own words.", "A light comprehension pass: the main path traced and explained independently."),
    3: form("Review what was just built for comprehension: trace through the main execution path and explain what each significant function, class, and data structure does — independently, without relying on comments generated alongside the code.", "Comprehension of the main execution path hasn't been verified independently — generated code may carry plausible-but-unverified logic."),
    4: form("Audit your comprehension across what was just built: flag every part you could not explain to another developer without re-reading, and close each comprehension gap.", "Beyond the main path: every low-comprehension part flagged and closed."),
    5: form("Write a comprehension note: trace each significant component end-to-end and document its role, the decisions behind it, and how the pieces fit together — so the understanding is durable and nothing accepted blindly survives.", "A durable comprehension note of how each component works and why."),
  },
};

/** ABSENCE_NO_PUSHBACK — critically evaluate AI output, keyword "question". Heaviest = a written pushback note. */
export const ABSENCE_NO_PUSHBACK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_NO_PUSHBACK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Question the one AI suggestion in what was just built you accepted most readily — was it actually right?", "The lightest pushback: question the single most-readily-accepted suggestion."),
    2: form("Question the main decisions in what was just built: for each, was the reasoning verified or just accepted because it sounded right?", "A light pushback pass: the main decisions questioned for real reasoning."),
    3: form("Review the recent generated outputs used in what was just built: identify any decisions, implementations, or suggestions you accepted without explicitly verifying the reasoning, checking for alternatives, or questioning the assumptions embedded in the response.", "The independent-verification audit of recent generated output hasn't been done."),
    4: form("Question every significant AI output and verify it independently: for each, state the assumption it rests on, find one alternative it skipped, and check the claim against the docs or a quick test rather than trusting the explanation.", "Beyond identifying gaps: every output questioned and checked against an independent source, not just its explanation."),
    5: form("Write a pushback note: per significant decision, the assumption you questioned, the skipped alternative, the independent check you ran, and your verdict to keep or change it — so nothing stands on plausibility alone.", "A durable pushback note of the assumptions questioned and the keep-or-change verdicts."),
  },
};

/** ABSENCE_CONTEXT_LOSS — recap session state, keyword "state". Produces a written note. */
export const ABSENCE_CONTEXT_LOSS_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CONTEXT_LOSS', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Note the current state of what was just built in one line before continuing — what is done and what is next.", "The lightest state recap: one line on done-and-next."),
    2: form("Summarize the working state of this session: the main decisions made and what remains, as a quick re-anchor.", "A light state summary: the main decisions and what remains."),
    3: form("Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.", "Active constraints, assumptions, and decision-thread for this session haven't been reconstructed — silent compounding of forgotten context could distort follow-on decisions."),
    4: form("Reconstruct the full session state: the constraints in play, the assumptions still unverified, and the decision-thread from the goal to the current work — so nothing silently distorts what comes next.", "Beyond a quick recap: the full state of constraints, assumptions, and decisions reconstructed."),
    5: form("Write a session-state summary note: the decisions made, the working state, the open constraints and assumptions, and the next two or three steps — kept as the re-anchor for the rest of the session.", "A durable session-state note of decisions, constraints, and next steps."),
  },
};

/** ABSENCE_DECISION_FATIGUE_PATTERN — break the acceptance streak with review, keyword "review". Heaviest = a written review note. */
export const ABSENCE_DECISION_FATIGUE_PATTERN_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_DECISION_FATIGUE_PATTERN', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Review the most recent change in what was just built with fresh eyes — the acceptance streak may have let something slip.", "The lightest review: one fresh-eyes pass on the latest change after a long streak."),
    2: form("Review the recent AI responses critically: flag any assumption or edge case that slipped through while accepting quickly.", "A light review: the recent streak checked for slipped assumptions and edge cases."),
    3: form("Apply deliberate critical review to the most recent AI responses: identify any assumptions that have not been validated, logic that could fail under edge cases, and changes made without explicit verification.", "A critical review of the recent AI-acceptance streak hasn't been done — assumptions or edge-case failures may have slipped through unchallenged."),
    4: form("Review the whole acceptance streak and re-run the checks: re-test the changed paths, re-derive the key assumptions from scratch, and diff what was accepted against what you would write fresh — flag every divergence.", "Beyond a re-read: the streak reviewed by re-testing and re-deriving, with divergences from a fresh take flagged."),
    5: form("Write a review note from the streak: the changes re-checked, the assumptions re-derived, the edge cases re-tested, and what needs fixing — then reset to a deliberate review-each-change rhythm rather than accepting on momentum.", "A durable review note of the re-checked streak, plus the review rhythm reset."),
  },
};

/** ABSENCE_WORK_RHYTHM_CHECK — verify each response before the next prompt, keyword "verif". Behavioural. */
export const ABSENCE_WORK_RHYTHM_CHECK_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_WORK_RHYTHM_CHECK', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Verify the last AI response before sending the next prompt — read it in full and confirm it is correct.", "The lightest rhythm check: the last response verified before the next prompt."),
    2: form("Verify the last generated change: trace the main logic and confirm the assumptions hold before continuing.", "A light verification pass: the last change's logic and assumptions confirmed."),
    3: form("Read and verify the last AI response in full before sending the next prompt: check any logic or state assumptions, confirm any generated code is complete and correct, and identify anything that was not explicitly validated.", "The last AI response hasn't been read and verified before the next prompt — rapid prompting risks accepting unverified content."),
    4: form("Verify each response before moving on: trace the control flow, check the state transitions, confirm the error handling, and flag anything generated-but-unread — do not let rapid prompting outrun verification.", "Beyond the last change: every response verified before the next, no unread output."),
    5: form("Make verify-before-continue the rhythm: read every AI response in full, verify its logic, assumptions, and completeness, and only then send the next prompt — so no unverified change ever compounds into the next.", "A standing rhythm: every response fully verified before the next prompt."),
  },
};

/** ABSENCE_FOCUS_DRIFT_DETECTION — one concern at a time, keyword "concern". Behavioural. */
export const ABSENCE_FOCUS_DRIFT_DETECTION_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_FOCUS_DRIFT_DETECTION', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Pick the single most important open concern in this session and finish it before touching another.", "The lightest focus check: one concern finished before the next is opened."),
    2: form("List the open concerns in this session, pick the most critical, and hold off the others until it is done.", "A light focus pass: the open concerns named and one prioritized."),
    3: form("Sequence your work: identify the highest-priority open concern in this session, complete it end-to-end, and define done for that domain before opening any additional concerns.", "Multiple open concerns in this session haven't been completed end-to-end — context-switching costs are compounding."),
    4: form("Audit the session's open concerns: name them all, rank by criticality, define done for the top one, and commit to finishing it before any context switch.", "Beyond picking one: every open concern ranked and the top one committed to completion."),
    5: form("Hold a strict one-concern-at-a-time discipline: finish the current concern end-to-end to its defined done, resist every new concern until it is closed, and only then sequence the next — so context-switching stops compounding.", "A standing focus discipline: one concern carried to done before any other is opened."),
  },
};

/** ABSENCE_SESSION_LENGTH_CHECKPOINT — checkpoint an extended session, keyword "session". Produces a written note. */
export const ABSENCE_SESSION_LENGTH_CHECKPOINT_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_SESSION_LENGTH_CHECKPOINT', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Note a quick checkpoint for this session: what is done and what the next step is.", "The lightest session checkpoint: done-and-next noted."),
    2: form("Checkpoint this session: summarize the decisions made and what remains, as an explicit anchor before continuing.", "A light session checkpoint: the decisions and remaining work summarized."),
    3: form("Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.", "A status checkpoint for this extended session hasn't been done — current state, working pieces, and next steps aren't anchored."),
    4: form("Audit this extended session against its original goal: what was completed, what was deferred, the tradeoffs and constraints identified, and the decisions to revisit — so the next phase starts from explicit context.", "Beyond a quick checkpoint: the session audited against its goal, with decisions and deferrals named."),
    5: form("Write a session checkpoint note: the decisions made, the working state, the deferred items, the open constraints, and the next steps — the explicit anchor the next phase of the session builds from.", "A durable session checkpoint note of decisions, state, and next steps."),
  },
};

/** ABSENCE_PROGRESS_CONSOLIDATION_GAP — document progress, keyword "document". Produces a written record. */
export const ABSENCE_PROGRESS_CONSOLIDATION_GAP_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_PROGRESS_CONSOLIDATION_GAP', source: 'shipped', schemaVersion: 1, slots: [],
  paramAxes: SESSION_QUALITY_PARAM_AXES,
  levelForms: {
    1: form("Document the one most important thing about what was just built before continuing.", "The lightest consolidation: the single most important point documented."),
    2: form("Document the current progress: what was implemented and the key decisions made, before the session continues.", "A light consolidation: the implemented work and key decisions documented."),
    3: form("Consolidate the current build state: document what has been implemented, capture the key decisions made, and record any outstanding work before continuing.", "Progress made in this session hasn't been consolidated — implicit state risks being lost as the session continues."),
    4: form("Document the full progress of what was just built: the implemented features, the design rationale, the deferred items, and the outstanding work — make the implicit session state explicit.", "Beyond the basics: the full progress and rationale documented, implicit state made explicit."),
    5: form("Document the session's progress into the project docs: what was built, why it was designed this way, what was deferred, and what remains before complete — a durable record, not implicit state.", "A durable progress document of what was built, why, and what remains."),
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
