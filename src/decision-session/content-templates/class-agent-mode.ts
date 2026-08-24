/**
 * Coding-agent-mode content-template records.
 *
 * Two signals from the mistake-category registry, one per mismatch direction between the
 * agent's operating mode and the current development stage:
 *
 *  - ABSENCE_CODING_AGENT_MODE_MISMATCH — an autonomous execute mode while the work is still
 *    in a planning stage (the "barreling ahead" case): pause and plan first.
 *  - ABSENCE_AGENT_MODE_TOO_RESTRICTED — a read-only/plan mode during implementation, where the
 *    agent is blocked from acting: lay out the plan and switch to an edit mode.
 *
 * Both are sensitive — one restrains the agent before it changes anything, the other precedes
 * loosening it toward edits — so each is `l2SafeguardRequired` with an action-named
 * `l2SafeguardLine` (the engine appends it as the last line of whichever column is served).
 *
 * Voice: the option is the user's own next message TO the agent. An agent cannot switch its
 * own permission mode, so the option prompts the agent to pause / lay out a plan and leaves the
 * actual mode toggle to the user ("I'll switch you"), never a fake self-switch. No record echoes
 * prompt text — the content is static and the fire-time grounding runs the sanitize gate.
 */

import type { ContentTemplateRecord, LevelForm, ParamAxisTag } from '../content-template-schema.js';
import {
  CODING_AGENT_MODE_MISMATCH_BEGINNER_OVERRIDE,
  AGENT_MODE_TOO_RESTRICTED_BEGINNER_OVERRIDE,
} from './class-agent-mode-beginner.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}

/** The param axes an agent-mode why-desc grounds (the same generic sources as the other classes). */
export const AGENT_MODE_PARAM_AXES: Readonly<Record<string, ParamAxisTag>> = {
  workflow_pattern: 'extensible',
  decision_making_rhythm: 'closed-ordinal',
  explanation_learning_depth: 'closed-ordinal',
  abstraction_level_orientation: 'closed-ordinal',
  project_framework: 'open',
};

/**
 * ABSENCE_CODING_AGENT_MODE_MISMATCH — an autonomous execute mode while the work is still in a
 * planning stage. HIGH-severity, immediate: the corrective is to pause and agree the approach
 * before any changes → `l2SafeguardRequired` + a make-any-changes safeguard line.
 */
export const ABSENCE_CODING_AGENT_MODE_MISMATCH_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_CODING_AGENT_MODE_MISMATCH', source: 'shipped', schemaVersion: 1, slots: [],
  question: 'This still looks like planning — pause before I start making changes?',
  pinchFallback: 'Planning, not building yet.',
  registerOverrides: { beginner: CODING_AGENT_MODE_MISMATCH_BEGINNER_OVERRIDE },
  paramAxes: AGENT_MODE_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before you make any changes.',
  levelForms: {
    1: form("Before you make any changes, pause — this still looks like planning to me. Walk me through the approach first, and wait for my go-ahead before you start building.", "Keep this to talking through the approach — no edits or scaffolding yet; we agree the direction first, then build."),
    2: form("Hold on before editing anything — we're still working out what to build. Lay out the approach in a few steps for me, and wait for my go-ahead before you make any changes.", "Give me the approach as a few clear steps I can react to, and hold every edit until we've agreed on it — not just the first one."),
    3: form("This still looks like planning, not building — pause before you make any changes. Outline the approach step by step, call out anything risky or unclear, and wait for my go-ahead before you start.", "Spell out the approach and flag the risky or unclear parts up front — I'd rather resolve those now than have them surface mid-build."),
    4: form("We're still in planning here — before any changes, lay out the approach as a short plan (the steps, the trade-offs, what could go wrong), get my sign-off, and only then start building. Ask me for go-ahead before you make any changes.", "Make the trade-offs explicit, not just the happy path — where two approaches compete, tell me which you'd pick and why, so the sign-off is a real decision."),
    5: form("Before building, capture the plan for this: the approach, the steps, the main risks, and how we'll check it — then get my go-ahead and work through it one step at a time. Ask me for go-ahead before you make any changes.", "Write the plan down as something we can work against — steps, risks, and the check for each — then move through it one step at a time, not all at once."),
  },
};

/**
 * ABSENCE_AGENT_MODE_TOO_RESTRICTED — a read-only/plan mode during implementation, blocking the
 * agent from acting. MEDIUM-severity: the corrective lays out the plan and precedes switching to
 * an edit mode. Because that switch loosens the agent toward changes, the record still carries the
 * `l2SafeguardRequired` make-any-changes safeguard, so a confirm-seek survives the switch.
 */
export const ABSENCE_AGENT_MODE_TOO_RESTRICTED_RECORD: ContentTemplateRecord = {
  signalType: 'ABSENCE_AGENT_MODE_TOO_RESTRICTED', source: 'shipped', schemaVersion: 1, slots: [],
  question: "You're in read-only mode but we're building — get ready to switch?",
  pinchFallback: 'Read-only during build.',
  registerOverrides: { beginner: AGENT_MODE_TOO_RESTRICTED_BEGINNER_OVERRIDE },
  paramAxes: AGENT_MODE_PARAM_AXES, l2SafeguardRequired: true,
  l2SafeguardLine: 'Ask me for go-ahead before you make any changes.',
  levelForms: {
    1: form("It looks like you're in a read-only mode but we're ready to build. Lay out the exact steps you'd take, and I'll switch you to an edit mode to run them — ask me for go-ahead before you make any changes.", "List the exact steps you'd run so they're ready the moment I switch you — concrete actions, not a general description."),
    2: form("We're ready to build, but you're in a read-only/plan mode so you can't edit yet. Write out the full step-by-step plan so it's ready to go, then I'll switch you over — ask me for go-ahead before you make any changes.", "Get the whole step-by-step plan down while you're still read-only — the more complete it is now, the less back-and-forth once you can edit."),
    3: form("You're held in a read-only mode while we're trying to implement. Lay out the complete plan (files to touch, the order, anything risky), and I'll switch you to an edit mode to carry it out — ask me for go-ahead before you make any changes.", "Name the files you'd touch and the order you'd take them in, and flag the risky edits — so the plan is ready to run, not just described."),
    4: form("You're in a read-only mode but the work needs edits. Lay out the full plan (the files, the order, the risky parts, how we'll check each step); I'll move you to an edit mode and we'll work through it — ask me for go-ahead before you make any changes.", "Pair each step with how we'll check it worked, not just what to change — that way switching you to edit stays low-risk."),
    5: form("Before we switch you loose to build, lay out the full plan and how we'll verify each step; I'll move you to an edit mode and we'll work through it together — ask me for go-ahead before you make any changes.", "Make the plan verifiable — every step with a way to confirm it — so once you're switched to edit, we can trust each change as it lands."),
  },
};

/** Both coding-agent-mode records. */
export const CLASS_AGENT_MODE_RECORDS: readonly ContentTemplateRecord[] = [
  ABSENCE_CODING_AGENT_MODE_MISMATCH_RECORD,
  ABSENCE_AGENT_MODE_TOO_RESTRICTED_RECORD,
];
