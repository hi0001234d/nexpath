// Render-loop end-to-end integration tests — exercises the full chain
// from DecisionContent + UserProfile down through buildSelectMessage,
// applyRuntimeSubstitutionsAllLevels, optionEntriesToSelectableItems,
// and renderLoop with mock keyEvents.
//
// Distinct from render-loop.test.ts (which tests computeLayout +
// renderLoop in isolation with synthetic options) — this file verifies
// the WIRE-UP between layers using real DecisionContent fixtures, real
// composeWhyHelpBlock output, and the post-Pass-2 substitution
// pipeline.
//
// Scope: layers wired together correctly. Does NOT assert on the styler
// body (still pass-through this phase) or D3 Space-toggle (Bhavnesh
// Phase 6).

import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  buildSelectMessage,
  type BuildSelectMessageOptions,
} from './DecisionSession.js';
import { TASK_REVIEW, type OptionEntry } from './options.js';
import { WHY_HELP_PER_CLASS } from './why-help.js';
import { applyRuntimeSubstitutionsAllLevels } from './runtime-substitutions.js';
import {
  computeLayout,
  optionEntriesToSelectableItems,
  renderLoop,
  type KeyEvent,
  type LayoutState,
  type RenderLoopOptions,
  type SelectableItem,
} from './render-loop.js';
import type { UserProfile } from '../classifier/types.js';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    nature:             'hardcore_pro',
    mood:               'focused',
    depth:              'high',
    precisionScore:     8,
    playfulnessScore:   3,
    precisionOrdinal:   'high',
    playfulnessOrdinal: 'low',
    depthScore:         7,
    computedAt:         1,
    ...overrides,
  };
}

async function* eventsOf(...names: KeyEvent['name'][]): AsyncIterable<KeyEvent> {
  for (const name of names) yield { name };
}

/**
 * Wire the full chain for one popup level. Returns the structured inputs
 * the render-loop consumes, ready to feed into either renderLoop (for
 * interactive flow tests) or computeLayout (for layout-only tests).
 */
async function buildPopupInputs(
  level: 1 | 2 | 3 = 1,
  bsmOptions: BuildSelectMessageOptions = {},
): Promise<{ message: string; items: SelectableItem[] }> {
  const profile = makeProfile();
  const message = buildSelectMessage(
    'Pinch demo',
    TASK_REVIEW.question,
    level,
    {
      whyHelpEntry: WHY_HELP_PER_CLASS.class1_stage_transition,
      register:     'formal',
      mood:         profile.mood,
      ...bsmOptions,
    },
  );
  const generated = await applyRuntimeSubstitutionsAllLevels(
    {
      l1: TASK_REVIEW.L1.map((e) => e.option),
      l2: TASK_REVIEW.L2.map((e) => e.option),
      l3: TASK_REVIEW.L3.map((e) => e.option),
    },
    TASK_REVIEW,
    [],
    TASK_REVIEW.signalType,
    'formal',
  );
  const levelEntries: readonly OptionEntry[] = level === 1 ? generated.l1 : level === 2 ? generated.l2 : generated.l3;
  return {
    message,
    items: optionEntriesToSelectableItems(levelEntries),
  };
}

function withLongDescBase(item: SelectableItem, prefix: string, lineCount = 6): SelectableItem {
  const descBase = Array.from({ length: lineCount }, (_, i) => `${prefix} detail line ${i + 1}.`).join('\n');
  return { ...item, descBase };
}

function getDescEmissions(layout: ReturnType<typeof computeLayout>, itemIndex: number) {
  return layout.emissions.filter(
    (emission) =>
      emission.optionIndex === itemIndex &&
      (emission.kind === 'desc-base-truncated' || emission.kind === 'desc-base-expanded'),
  );
}

describe('render-loop end-to-end — buildSelectMessage + substitution + render-loop (Phase 7 D2)', () => {
  it('happy path — Enter on the focused option returns the matching SelectableItem with substituted desc-base', async () => {
    const { items }   = await buildPopupInputs(1);
    expect(items.length).toBeGreaterThan(0);

    const out          = new PassThrough();
    const firstOption  = items[0];
    const result = await renderLoop({
      layout: {
        pinchLabel: 'P', question: 'Q',
        options:    items,
        rows:       60, cols: 100,
      },
      out,
      keyEvents: eventsOf('enter'),
    });
    // Enter on initial focus (index 0) returns that option.
    expect(result).not.toBeNull();
    expect(result!.value).toBe(firstOption.value);
    // The desc-base has been substituted — no placeholders remain.
    expect(result!.descBase).not.toContain('{R5_INJECT');
    expect(result!.descBase).not.toContain('{R4_OPEN}');
    expect(result!.descBase).not.toContain('{R4_CLOSE}');
  });

  it('arrow-down → Enter selects the SECOND option, with its substituted desc-base', async () => {
    const { items } = await buildPopupInputs(1);
    expect(items.length).toBeGreaterThan(1);

    const out = new PassThrough();
    const result = await renderLoop({
      layout: { pinchLabel: 'P', question: 'Q', options: items, rows: 60, cols: 100 },
      out,
      keyEvents: eventsOf('arrow-down', 'enter'),
    });
    expect(result!.value).toBe(items[1].value);
  });

  it('Escape returns null (cancel path) without throwing', async () => {
    const { items } = await buildPopupInputs(1);
    const out = new PassThrough();
    const result = await renderLoop({
      layout: { pinchLabel: 'P', question: 'Q', options: items, rows: 60, cols: 100 },
      out,
      keyEvents: eventsOf('escape'),
    });
    expect(result).toBeNull();
  });

  it('renders the composed why-help block in the popup message (R4 open + R6 content + R4 close)', async () => {
    const { message } = await buildPopupInputs(1);
    expect(message).toContain("You're seeing this because");
    expect(message).toContain('— review the options below to determine the next step.');
    // R6 content for class1_stage_transition formal register:
    expect(message).toContain('Recent prompts indicate a transition from one development stage to the next.');
  });

  it('renders all 3 cascade levels — each level produces its own substituted items', async () => {
    const l1 = await buildPopupInputs(1);
    const l2 = await buildPopupInputs(2);
    const l3 = await buildPopupInputs(3);

    expect(l1.items.length).toBe(TASK_REVIEW.L1.length);
    expect(l2.items.length).toBe(TASK_REVIEW.L2.length);
    expect(l3.items.length).toBe(TASK_REVIEW.L3.length);

    // No placeholders remain in any level's items.
    for (const set of [l1.items, l2.items, l3.items]) {
      for (const it of set) {
        if (it.descBase) {
          expect(it.descBase).not.toContain('{R5_INJECT');
          expect(it.descBase).not.toContain('{R4_OPEN}');
        }
      }
    }
  });

  it('graceful-fail — when whyHelpEntry is omitted, the popup still renders (header pair + options)', async () => {
    // Build buildSelectMessage WITHOUT whyHelp options.
    const profile = makeProfile();
    const message = buildSelectMessage('Pinch demo', TASK_REVIEW.question, 1);
    // No whyHelp content in the message.
    expect(message).not.toContain("You're seeing this because");
    expect(message).toContain('Pinch demo');
    expect(message).toContain(TASK_REVIEW.question);

    // Render-loop still drives an option selection cleanly.
    const generated = await applyRuntimeSubstitutionsAllLevels(
      {
        l1: TASK_REVIEW.L1.map((e) => e.option),
        l2: TASK_REVIEW.L2.map((e) => e.option),
        l3: TASK_REVIEW.L3.map((e) => e.option),
      },
      TASK_REVIEW,
      [],
      TASK_REVIEW.signalType,
      'formal',
    );
    const items = optionEntriesToSelectableItems(generated.l1);
    const out = new PassThrough();
    const result = await renderLoop({
      layout: { pinchLabel: 'P', question: 'Q', options: items, rows: 60, cols: 100 },
      out,
      keyEvents: eventsOf('enter'),
    });
    expect(result).not.toBeNull();
    void profile;
  });

  it('shortcut-hint appears under the focused option throughout the chain', async () => {
    // Verify the shortcut-hint LineKind is emitted by the layout when the
    // post-substitution items reach render-loop. Capture frame output via
    // a PassThrough sink and look for the hint text.
    const { items } = await buildPopupInputs(1);
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));

    await renderLoop({
      layout: { pinchLabel: 'P', question: 'Q', options: items, rows: 60, cols: 100 },
      out,
      keyEvents: eventsOf('enter'),
    });
    const written = Buffer.concat(chunks).toString('utf8');
    expect(written).toContain('press Space to toggle details');
  });

  it('expands only the focused option when generated items carry long desc-bases', async () => {
    const { items } = await buildPopupInputs(1);
    expect(items.length).toBeGreaterThan(1);

    const longItems = items.map((item, index) =>
      index < 2 ? withLongDescBase(item, `option-${index + 1}`) : item,
    );

    const layoutOpts: RenderLoopOptions = {
      pinchLabel: 'P',
      question:   'Q',
      options:    longItems,
      rows:       40,
      cols:       100,
    };
    const collapsedState: LayoutState = {
      focusedIndex:    0,
      expandedOptions: new Set<number>(),
      scrollOffset:    0,
    };
    const expandedState: LayoutState = {
      focusedIndex:    0,
      expandedOptions: new Set<number>([0]),
      scrollOffset:    0,
    };

    const collapsed = computeLayout(layoutOpts, collapsedState);
    const expanded = computeLayout(layoutOpts, expandedState);

    const focusedCollapsed = getDescEmissions(collapsed, 0);
    const focusedExpanded = getDescEmissions(expanded, 0);
    const siblingCollapsed = getDescEmissions(collapsed, 1);
    const siblingExpanded = getDescEmissions(expanded, 1);

    expect(focusedCollapsed).toHaveLength(2);
    expect(focusedExpanded.length).toBeGreaterThan(focusedCollapsed.length);
    expect(focusedExpanded.every((emission) => emission.kind === 'desc-base-expanded')).toBe(true);
    expect(focusedExpanded.map((emission) => emission.text)).not.toEqual(
      focusedCollapsed.map((emission) => emission.text),
    );

    expect(siblingCollapsed).toHaveLength(2);
    expect(siblingExpanded).toHaveLength(siblingCollapsed.length);
    expect(siblingExpanded.every((emission) => emission.kind === 'desc-base-truncated')).toBe(true);
    expect(siblingExpanded.map((emission) => emission.text)).toEqual(
      siblingCollapsed.map((emission) => emission.text),
    );
  });

  it('second Space collapses the same focused generated option and retains focus', async () => {
    const { items } = await buildPopupInputs(1);
    const longItems = items.map((item, index) =>
      index === 0 ? withLongDescBase(item, 'focus-target') : item,
    );
    const out = new PassThrough();
    const telemetry: Array<Record<string, unknown>> = [];

    const result = await renderLoop({
      layout: {
        pinchLabel: 'P',
        question:   'Q',
        options:    longItems,
        rows:       40,
        cols:       100,
      },
      out,
      keyEvents: eventsOf('space', 'space', 'enter'),
      telemetryHook: (_event, payload) => telemetry.push(payload),
    });

    expect(result).not.toBeNull();
    expect(result!.value).toBe(longItems[0].value);
    expect(telemetry).toHaveLength(2);

    expect(telemetry[0]).toMatchObject({
      optionIndex:   0,
      prevExpanded:  false,
      nowExpanded:   true,
      focusRetained: true,
    });
    expect(telemetry[1]).toMatchObject({
      optionIndex:   0,
      prevExpanded:  true,
      nowExpanded:   false,
      focusRetained: true,
    });
  });

  it('auto-scroll keeps the expanded focused generated option visible on a short terminal', async () => {
    const { items } = await buildPopupInputs(1);
    const repeated = Array.from({ length: 6 }, (_, index) => {
      const base = items[index % items.length];
      return {
        ...withLongDescBase(base, `option-${index + 1}`),
        value: `${base.value}::${index}`,
        label: index === 4 ? 'Focus target option' : `${base.label} ${index + 1}`,
      };
    });

    const focusedIndex = 4;
    repeated[focusedIndex] = {
      ...withLongDescBase(repeated[focusedIndex], 'focus-target', 9),
      label: 'Focus target option',
    };

    const layout = computeLayout(
      {
        pinchLabel: 'P',
        question:   'Q',
        options:    repeated,
        rows:       12,
        cols:       40,
      },
      {
        focusedIndex,
        expandedOptions: new Set<number>([focusedIndex]),
        scrollOffset:    0,
      },
    );

    const visible = layout.viewport.visibleStyledLines.join('\n');
    expect(layout.viewport.appliedScrollOffset).toBeGreaterThan(0);
    expect(visible).toContain('Focus target option');
    expect(visible).toContain('focus-target detail line 1.');
  });
});
