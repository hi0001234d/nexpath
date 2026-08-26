// @vitest-environment jsdom
//
// D5 — directional rows and the refinement view.
//
// The references are not all equal, and the tests say which is which:
//   PE refinement    LIVE parity — the CLI's renderer takes `refinement: true`
//                    today and the test calls it.
//   PE directional   structural — the CLI's loop is UI-off (commented verbatim,
//                    `cli-submit-popup.ts:641-664`); the block is the spec.
//   MPS-1 both       structural — reverted in the CLI; the blueprint doc rules.

import { describe, it, expect } from 'vitest';
import { renderSurface } from './surface-view.js';
import { DIRECTIONAL_LABELS, GO_BACK_LABEL, withoutDirectionalRows, buildRefinementModel, withBodyText } from './refinement.js';
import {
  PE_REFINEMENT_FIXTURE,
  MPS_FIRST_REFINEMENT_FIXTURE,
  PE_REFINED_TEXT,
  MPS_REFINED_TEXT,
} from './fixtures/directional.js';
import { PE_FIXTURE, EDIT_KEYS_HINT } from './fixtures/pe.js';
import { MPS_FIRST_FIXTURE, MPS_CANCEL_LABEL, MPS_FIRST_FOOTER } from './fixtures/mps.js';
import type { SurfaceModel } from './surface-model.js';

import { renderPromptEnhancementPopupFrameV1 } from '../../../prompt-enhancement/cli-submit-popup.js';
import { createSurfaceController } from './surface-controller.js';
import { createRefinementTransitions } from './refinement-transitions.js';

// ── extraction (same rules as parity.test.ts) ────────────────────────────────

function rowText(row: Element): string {
  return [...row.children].map((cell) => cell.textContent ?? '').join(' ').trimEnd();
}

function domLines(frame: HTMLElement): string[] {
  const out: string[] = [];
  for (const row of frame.querySelectorAll('.np-row')) {
    // A hidden scroll marker is not a line on screen. It is in the DOM so it
    // can appear the moment the field windows, and `display: none` is what the
    // reader actually sees — jsdom computes no layout, so the class is the
    // only honest signal here.
    if (row.classList.contains('np-marker-hidden')) continue;
    const field = row.querySelector('textarea');
    if (field) {
      const shown = field.value || field.placeholder;
      for (const line of shown.split('\n')) out.push(line.trimEnd());
      continue;
    }
    out.push(rowText(row));
  }
  return out;
}

function cliLines(frame: string): string[] {
  return frame.split('\n').map((line) => line.replace(/^│ ?/, '').trim());
}

/**
 * The browser advertises the Alt+Shift chords where the CLI keeps Ctrl/Cmd — a
 * strayed-focus Ctrl+J is Chrome's own Downloads shortcut. Normalised for the
 * live-CLI comparison exactly as `parity.test.ts` normalises it, and nothing
 * else, so any other hint drift still fails.
 */
const CLI_EDIT_KEYS_HINT =
  typeof process !== 'undefined' && process.platform === 'darwin'
    ? 'Cmd+J new line · Cmd+↑/↓ move line'
    : 'Ctrl+J new line · Ctrl+↑/↓ move line';

function ours(model: SurfaceModel, focusIndex: number): string[] {
  return domLines(renderSurface(document, model, { focusIndex }))
    .map((l) => l.trim())
    .map((l) => l.split(EDIT_KEYS_HINT).join(CLI_EDIT_KEYS_HINT));
}

function labelsOf(model: SurfaceModel, focusIndex = 0): string[] {
  return [...renderSurface(document, model, { focusIndex }).querySelectorAll('.np-label')]
    .map((el) => el.textContent ?? '');
}

// ── PE refinement: LIVE parity ───────────────────────────────────────────────

function peRefinementCli(focusIndex: number): string[] {
  const model = {
    title: 'Nexpath · Prompt enhancement',
    editorHeading: 'Use enhanced prompt',
    identity: { enhancementId: 'e1', currentBodyId: 'b1', bodyRevision: 1, validationDecisionId: 'v1' },
    body: { editable: true },
    pinchLabel: { text: PE_FIXTURE.pinch!, derivedFrom: 'family' },
    whyHelp: { text: PE_FIXTURE.whyHelp!, reasonKind: 'risk_or_rollback' },
    publicCopy: { trustCues: PE_FIXTURE.trustCues!.map((t) => ({ publicSafeText: t })), diagnostics: [] },
    controls: {
      additionalDetails: { availability: 'available' }, directional: [],
      feedback: { availability: 'available' }, original: { availability: 'available' },
      currentBody: { availability: 'available' }, close: { availability: 'available' },
    },
  };
  return cliLines(renderPromptEnhancementPopupFrameV1(
    { model, editedBodyText: PE_REFINED_TEXT, additionalDetailsText: '' } as never,
    { focusIndex, helpExpanded: false, refinement: true } as never,
  ));
}

describe('PE refinement view — parity with the LIVE CLI', () => {
  // The refinement path ships in the CLI today — `{ refinement: true }` returns
  // exactly body + Go back — so this reference cannot go stale.

  it.each([
    ['the recomposed body', 0],
    ['← Go back', 1],
  ])('matches line for line, focus on %s', (_label, focusIndex) => {
    expect(ours(PE_REFINEMENT_FIXTURE, focusIndex)).toEqual(peRefinementCli(focusIndex));
  });

  it('is comparing something real', () => {
    const lines = peRefinementCli(0);

    expect(lines.length).toBeGreaterThan(6);
    expect(lines).toContain(`○ ${GO_BACK_LABEL}`);
    expect(lines.join('\n')).toContain(PE_REFINED_TEXT);
  });
});

// ── directional rows: structural, per the documented decisions ───────────────

describe.each([
  ['PE', PE_FIXTURE, 'Use original prompt'],
  ['MPS-1', MPS_FIRST_FIXTURE, MPS_CANCEL_LABEL],
] as const)('%s refinement rows are part of the surface', (_name, fixture, successorLabel) => {
  it('renders the three labels, in the CLI\'s order, immediately before the successor', () => {
    const labels = labelsOf(fixture);
    const at = labels.indexOf('Shorter');

    expect(at).toBeGreaterThan(0);
    expect(labels.slice(at, at + 4)).toEqual([...DIRECTIONAL_LABELS, successorLabel]);
  });

  it('carries no description line and never an (unavailable) marker', () => {
    // Both are explicit owner decisions recorded in the commented CLI block.
    const frame = renderSurface(document, fixture, { focusIndex: 0 });

    expect(frame.textContent).not.toContain('(unavailable)');
    for (const label of DIRECTIONAL_LABELS) {
      const row = [...frame.querySelectorAll('.np-label')].find((el) => el.textContent === label)!
        .closest('.np-row')!;
      // A directional row is its bullet and its label — nothing else follows
      // inside it, and no helper note trails it.
      expect(row.nextElementSibling?.classList.contains('np-dim') ?? false).toBe(false);
    }
  });

  it('opens the block with one blank and keeps none inside it', () => {
    const lines = ours(fixture, 0);
    const shorterAt = lines.indexOf('○ Shorter');

    expect(lines[shorterAt - 1]).toBe('');                       // a blank opens the block
    expect(lines[shorterAt + 1]).toBe('○ More thorough');        // contiguous
    expect(lines[shorterAt + 2]).toBe('○ More project-grounded');
  });

  it('is followed by its successor, with whatever blank that surface prints', () => {
    // PE goes straight into `Use original prompt`; MPS-1 prints a blank before
    // Cancel. The two surfaces genuinely differ, and the CLI comparison in
    // parity.test.ts is what pins each of them.
    const lines = ours(fixture, 0);
    const after = lines.slice(lines.indexOf('○ More project-grounded') + 1);

    expect(after.filter((l) => l !== '')[0]).toBe(`○ ${successorLabel}`);
  });

  it('focus reaches every directional row', () => {
    const interactive = fixture.rows.filter((r) => r.kind !== 'note').length;

    for (const label of DIRECTIONAL_LABELS) {
      const focusIndex = labelsOf(fixture).indexOf(label);
      const frame = renderSurface(document, fixture, { focusIndex });
      const focused = frame.querySelector('.np-row.np-focused .np-label');

      expect(focused?.textContent, `focus ${focusIndex}`).toBe(label);
    }
    expect(interactive).toBe(withoutDirectionalRows(fixture).rows.filter((r) => r.kind !== 'note').length + 3);
  });

  it('the parity comparison can strip them back out', () => {
    // The CLI renders none of these rows today, so the parity suite compares a
    // stripped model. Stripping must leave the surface otherwise untouched.
    const stripped = withoutDirectionalRows(fixture);

    for (const label of DIRECTIONAL_LABELS) {
      expect(stripped.rows.some((r) => r.kind !== 'note' && r.label === label)).toBe(false);
    }
    expect(stripped.rows.length).toBe(fixture.rows.length - 3);
    expect(stripped.footer).toBe(fixture.footer);
  });
});

describe('MPS-1 specifics', () => {
  it('the Cancel row keeps its tone and its own blank', () => {
    // MPS-1 prints a blank before Cancel where PE goes straight into
    // `Use original prompt` — the surfaces differ, and parity pins both.
    const frame = renderSurface(document, MPS_FIRST_FIXTURE, { focusIndex: 0 });
    const cancel = [...frame.querySelectorAll('.np-label')].find((el) => el.textContent === MPS_CANCEL_LABEL)!;

    expect(cancel.classList.contains('np-cancel')).toBe(true);

    const lines = ours(MPS_FIRST_FIXTURE, 0);
    expect(lines[lines.indexOf(`○ ${MPS_CANCEL_LABEL}`) - 1]).toBe('');
  });

  it('the Sequence plan block is untouched', () => {
    const lines = ours(MPS_FIRST_FIXTURE, 0);

    expect(lines).toContain('Sequence plan');
    expect(lines).toContain('Total: 3');
    expect(lines).toContain('Types: implement, verify, document');
  });
});

// ── the refinement view, structurally ────────────────────────────────────────

describe('refinement view', () => {
  it('offers exactly two things: the recomposed body and ← Go back', () => {
    for (const [fixture, text] of [
      [PE_REFINEMENT_FIXTURE, PE_REFINED_TEXT],
      [MPS_FIRST_REFINEMENT_FIXTURE, MPS_REFINED_TEXT],
    ] as const) {
      const labels = labelsOf(fixture);

      expect(labels).toHaveLength(2);
      expect(labels[1]).toBe(GO_BACK_LABEL);
      const frame = renderSurface(document, fixture, { focusIndex: 0 });
      expect(frame.querySelector('textarea')!.value).toBe(text);
    }
  });

  it('contains no directional row — a second Shorter is unreachable', () => {
    // The CLI captures savedMain only on the FIRST directional action and its
    // refinement view renders none; one refinement, then send or go back.
    for (const fixture of [PE_REFINEMENT_FIXTURE, MPS_FIRST_REFINEMENT_FIXTURE]) {
      for (const label of DIRECTIONAL_LABELS) {
        expect(labelsOf(fixture)).not.toContain(label);
      }
    }
  });

  it('keeps the header block and footer of the surface it refines', () => {
    expect(PE_REFINEMENT_FIXTURE.pinch).toBe(PE_FIXTURE.pinch);
    expect(PE_REFINEMENT_FIXTURE.footer).toBe(PE_FIXTURE.footer);
    expect(MPS_FIRST_REFINEMENT_FIXTURE.footer).toBe(MPS_FIRST_FOOTER);
  });

  it('MPS-1 keeps its Sequence plan visible — the plan is never re-planned', () => {
    const lines = ours(MPS_FIRST_REFINEMENT_FIXTURE, 0);

    expect(lines).toContain('Sequence plan');
    expect(lines).toContain('Total: 3');
    // …while PE, which has no notes, gains none.
    expect(ours(PE_REFINEMENT_FIXTURE, 0)).not.toContain('Sequence plan');
  });
});

// ── the Go-back restore ──────────────────────────────────────────────────────

describe('Go back restores both halves', () => {
  it('withBodyText brings the user\'s edits back into the main view', () => {
    // The CLI saves { result, body: editedBodyText } and restores BOTH — a user
    // who edited the body, picked Shorter, and went back must find their edit.
    const edited = 'The user edited this before picking Shorter.';

    const restored = withBodyText(PE_FIXTURE, edited);

    const body = restored.rows[0]!;
    expect(body.kind === 'field' && body.text).toBe(edited);
    // …and only the body — the details field is untouched.
    const details = restored.rows[1]!;
    expect(details.kind === 'field' && details.text)
      .toBe(PE_FIXTURE.rows[1]!.kind === 'field' ? PE_FIXTURE.rows[1]!.text : '');
  });

  it('round-trips: main → refinement → back is the main view again', () => {
    const edited = 'edited body';
    const refinement = buildRefinementModel(withBodyText(PE_FIXTURE, edited), PE_REFINED_TEXT);
    const back = withBodyText(PE_FIXTURE, edited);

    expect(refinement.rows[0]!.kind === 'field' && refinement.rows[0]!.text).toBe(PE_REFINED_TEXT);
    expect(ours(back, 0)).toEqual(ours(withBodyText(PE_FIXTURE, edited), 0));
  });

  it('strips a stray blankBefore from the refinement body', () => {
    // The refinement view opens with its body at the very top of the row area.
    // A base whose body carries blankBefore (nothing in today's fixtures does,
    // but the builder must not depend on that) would otherwise open with a
    // stray blank line the CLI never draws.
    const oddBase: SurfaceModel = {
      id: 'prompt_enhancement', label: 'X', footer: 'f',
      rows: [{ kind: 'field', label: 'Body', text: 'original', blankBefore: true }],
    };

    const refinement = buildRefinementModel(oddBase, 'refined');

    expect(refinement.rows[0]!.blankBefore).toBeUndefined();
    expect(ours(refinement, 0)[0]).not.toBe('');
  });

  it('refuses a surface with no editable body', () => {
    const bodyless: SurfaceModel = {
      id: 'prompt_enhancement', label: 'X', rows: [{ kind: 'action', label: 'only' }], footer: 'f',
    };

    expect(() => withBodyText(bodyless, 'x')).toThrow('no editable body');
    expect(() => buildRefinementModel(bodyless, 'x')).toThrow('no editable body');
  });
});

describe('withoutDirectionalRows', () => {
  it('leaves a surface that has none alone', () => {
    const pef = { id: 'prompt_enhancement_feedback', label: 'x', footer: 'f',
      rows: [{ kind: 'action', label: 'only' }] } as SurfaceModel;

    expect(withoutDirectionalRows(pef).rows).toHaveLength(1);
  });

  it('never removes a note row', () => {
    // MPS-1's Sequence plan lines are notes and must survive the strip.
    const stripped = withoutDirectionalRows(MPS_FIRST_FIXTURE);

    expect(stripped.rows.filter((r) => r.kind === 'note')).toHaveLength(3);
  });
});

// ── the held wiring, end to end through the committed controller (D5 ∘ D6) ───

describe('directional -> refinement -> Go back, through the controller', () => {
  function drive(): { host: HTMLElement; controller: ReturnType<typeof createSurfaceController> } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = createSurfaceController(host, {
      registry: {
        prompt_enhancement: PE_FIXTURE,
        mps_first: MPS_FIRST_FIXTURE,
      },
      initial: 'prompt_enhancement',
      resolveActivation: createRefinementTransitions({
        prompt_enhancement: PE_REFINED_TEXT,
        mps_first: MPS_REFINED_TEXT,
      }),
    });
    return { host, controller };
  }

  function press(el: Element, key: string): void {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
  }

  it('Shorter opens the refinement view with the recomposed body', () => {
    const { host, controller } = drive();
    press(controller.element, 'ArrowDown');   // details
    press(controller.element, 'ArrowDown');   // Shorter

    press(controller.element, 'Enter');

    const labels = [...host.querySelectorAll('.np-label')].map((el) => el.textContent);
    expect(labels).toEqual(['Use enhanced prompt', GO_BACK_LABEL]);
    expect(host.querySelector('textarea')!.value).toBe(PE_REFINED_TEXT);
    controller.destroy();
  });

  it('Go back restores the main view AND the body the user had edited', () => {
    const { host, controller } = drive();
    host.querySelector('textarea')!.value = 'edited before picking Shorter';
    press(controller.element, 'ArrowDown');
    press(controller.element, 'ArrowDown');   // Shorter
    press(controller.element, 'Enter');       // -> refinement

    press(controller.element, 'ArrowDown');   // ← Go back
    press(controller.element, 'Enter');

    const labels = [...host.querySelectorAll('.np-label')].map((el) => el.textContent);
    expect(labels).toContain('Shorter');      // the main view again
    expect(host.querySelector('textarea')!.value).toBe('edited before picking Shorter');
    controller.destroy();
  });

  it('a blank body refuses the directional, silently — bug B', () => {
    const { host, controller } = drive();
    host.querySelector('textarea')!.value = '   ';
    press(controller.element, 'ArrowDown');
    press(controller.element, 'ArrowDown');

    press(controller.element, 'Enter');

    expect([...host.querySelectorAll('.np-label')].map((el) => el.textContent)).toContain('Shorter');
    controller.destroy();
  });

  it('a second directional is unreachable from the refinement view', () => {
    const { host, controller } = drive();
    press(controller.element, 'ArrowDown');
    press(controller.element, 'ArrowDown');
    press(controller.element, 'Enter');       // -> refinement

    const labels = [...host.querySelectorAll('.np-label')].map((el) => el.textContent);
    for (const label of DIRECTIONAL_LABELS) expect(labels).not.toContain(label);
    controller.destroy();
  });

  it('MPS-1: the refinement keeps the Sequence plan on screen throughout', () => {
    const { host, controller } = drive();
    controller.setSurface('mps_first');
    press(controller.element, 'ArrowDown');   // details
    press(controller.element, 'ArrowDown');   // Shorter
    press(controller.element, 'Enter');

    expect(host.querySelector('textarea')!.value).toBe(MPS_REFINED_TEXT);
    expect(host.textContent).toContain('Sequence plan');
    expect(host.textContent).toContain('Total: 3');
    controller.destroy();
  });
});
