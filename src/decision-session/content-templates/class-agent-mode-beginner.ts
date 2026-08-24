/**
 * Coding-agent-mode `_BEGINNER` register overrides — plain-language, warm rewrites of the
 * agent-mode content-template records. Structurally divergent (each is a full 5-column ladder in
 * beginner voice, not a vocabulary tweak of the base). Attached via `registerOverrides.beginner`.
 *
 * Voice note: the option is the user's own next message TO the agent, so "you" addresses the
 * agent (whose mode it is), and "I'll switch you" is the user doing the actual mode toggle — the
 * agent never switches its own mode.
 */

import type { LevelForm, RegisterOverride, MaturityLevel } from '../content-template-schema.js';

function form(option: string, whyDesc: string): LevelForm {
  return { kind: 'slot-variant', cell: { option, whyDesc } };
}
function structural(levelForms: Partial<Record<MaturityLevel, LevelForm>>): RegisterOverride {
  return { divergence: 'structurally-divergent', levelForms };
}

/** CODING_AGENT_MODE_MISMATCH (beginner) — plain "let's plan before building". */
export const CODING_AGENT_MODE_MISMATCH_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Let's plan before building — walk me through how you'd approach this first, and wait for my okay before you change anything.", "Just talk me through the plan for now — nothing changed yet; we line it up together first, then you build."),
  2: form("Before you change any code, tell me the plan in a few simple steps, and wait for my okay to start.", "Keep the plan to a few plain steps I can follow — and wait for my okay on the whole thing, not just step one."),
  3: form("This still feels like the planning part, not the building part. Lay out the steps you'd take, point out anything tricky, and wait for my okay before you start changing things.", "Show me the steps and call out the tricky bits early — easier to sort those out now than partway into building."),
  4: form("Let's get the plan down before building: the steps, what might be tricky, and what could go wrong. Once I say okay, start — and check with me before you change anything.", "Don't just list the happy path — where something could go wrong, say so and how you'd handle it, so my okay actually means something."),
  5: form("Write the plan down first — the approach, the steps, what to watch out for, and how we'll know it worked. Then get my okay and go one step at a time. Check with me before changing anything.", "Put it in writing so we can both follow it — and go one step at a time once I okay it, not all in one go."),
});

/** AGENT_MODE_TOO_RESTRICTED (beginner) — plain "you can only look right now; let's get you set to edit". */
export const AGENT_MODE_TOO_RESTRICTED_BEGINNER_OVERRIDE: RegisterOverride = structural({
  1: form("Looks like you're set to look-but-don't-change right now, but we're ready to build. Tell me the steps you'd take and I'll switch you so you can — just check with me before changing anything.", "Spell out the steps you'd take so they're ready the moment I switch you — real actions, not just a rough idea."),
  2: form("We're ready to build, but right now you can only look, not change things. Write out the full plan step by step, and I'll switch you over — check with me before changing anything.", "Get the whole plan written while you're still look-only — the more it's ready now, the smoother it goes once you can edit."),
  3: form("You can only look right now, but we're trying to build. Lay out the whole plan (which files, in what order, anything risky), and I'll switch you so you can make the changes — check with me before changing anything.", "Name the files and the order you'd change them in, and flag the risky ones — so it's ready to run, not just talked about."),
  4: form("You're in look-only mode but the work needs changes. Lay out the full plan (the files, the order, the risky parts, how we'll check each step); I'll switch you to editing and we'll go through it — check with me before changing anything.", "Add how we'll check each step worked, not just what to change — that keeps switching you to editing safe."),
  5: form("Before I let you start building, lay out the full plan and how we'll check each step; I'll switch you to editing and we'll work through it together — check with me before changing anything.", "Make each step something we can check — so once you're editing, we can trust each change as it happens."),
});
