// @vitest-environment jsdom
//
// D6 — the interaction layer, driven with real KeyboardEvents.

import { describe, it, expect, beforeEach, afterEach , vi } from 'vitest';
import {
  createSurfaceController,
  mergeDetailsIntoBody,
  moveCaretLine,
  DETAILS_MERGE_HEADING,
  type SurfaceController,
  type SurfaceEvent,
} from './surface-controller.js';
import { EDIT_KEYS_HINT } from './fixtures/pe.js';
import { PE_FIXTURE } from './fixtures/pe.js';
import { MPS_FIRST_FIXTURE, MPS_CONTINUATION_FIXTURE, MPS_CANCEL_LABEL } from './fixtures/mps.js';
import { PEF_FIXTURE } from './fixtures/pef.js';
import type { SurfaceModel } from './surface-model.js';

const REGISTRY = {
  prompt_enhancement: PE_FIXTURE,
  mps_first: MPS_FIRST_FIXTURE,
  mps_continuation: MPS_CONTINUATION_FIXTURE,
  prompt_enhancement_feedback: PEF_FIXTURE,
};

let host: HTMLElement;
let events: SurfaceEvent[];
let controller: SurfaceController | undefined;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  events = [];
});

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.innerHTML = '';
});

function mount(initial: keyof typeof REGISTRY = 'prompt_enhancement', extra: object = {}): SurfaceController {
  controller = createSurfaceController(host, {
    registry: REGISTRY,
    initial,
    onEvent: (e) => events.push(e),
    ...extra,
  });
  return controller;
}

function key(target: Element, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code: init.code ?? key, bubbles: true, cancelable: true, ...init }));
}

function bodyField(): HTMLTextAreaElement {
  return host.querySelector('textarea')!;
}

/**
 * Move focus to the row with this label.
 *
 * By label rather than by a count of ArrowDowns: the surfaces gained their
 * refinement rows, and every test that said "down twice reaches Use original
 * prompt" silently started testing a different row. A label cannot drift like
 * that, and it says what the test means.
 */
function focusOn(c: SurfaceController, label: string): void {
  for (let i = 0; i < 20; i++) {
    const focused = host.querySelector('.np-row.np-focused .np-label')?.textContent;
    if (focused === label) return;
    key(c.element, 'ArrowDown');
  }
  throw new Error(`focusOn: never reached "${label}"`);
}

// ── construction ─────────────────────────────────────────────────────────────

describe('construction', () => {
  it('renders the initial surface into a focusable np-surface-root wrapper', () => {
    const c = mount();

    expect(c.element.className).toBe('np-surface-root');
    expect(c.element.tabIndex).toBe(-1);
    expect(host.textContent).toContain('◆ NEXPATH CLI · Prompt enhancement');
  });

  it('refuses an initial surface that is not registered', () => {
    expect(() => createSurfaceController(host, { registry: {}, initial: 'prompt_enhancement' }))
      .toThrow('no model registered');
  });

  it('DOM-focuses the body field when the focused row is a field', () => {
    mount();

    expect(document.activeElement).toBe(bodyField());
  });
});

// ── navigation ───────────────────────────────────────────────────────────────

describe('navigation — the CLI clamp, never a wrap', () => {
  it('ArrowDown walks the interactive rows and clamps at the last', () => {
    const c = mount();
    const last = PE_FIXTURE.rows.filter((r) => r.kind !== 'note').length - 1;

    key(c.element, 'ArrowDown');
    expect(c.getFocusIndex()).toBe(1);
    for (let i = 0; i < last + 3; i++) key(c.element, 'ArrowDown');

    expect(c.getFocusIndex()).toBe(last);    // clamped, not wrapped to 0
  });

  it('ArrowUp clamps at the first row', () => {
    const c = mount();

    key(c.element, 'ArrowUp');

    expect(c.getFocusIndex()).toBe(0);
  });

  it('moving focus onto a field row hands it the real keyboard', () => {
    const c = mount();
    focusOn(c, 'Additional details');

    expect(document.activeElement).toBe(host.querySelectorAll('textarea')[1]);
    focusOn(c, 'Use original prompt');       // an action row
    expect(document.activeElement).toBe(c.element);
  });

  it('plain arrows move ROWS even while a field is focused — the CLI has no plain-arrow caret', () => {
    const c = mount();

    key(bodyField(), 'ArrowDown');           // dispatched from inside the textarea

    expect(c.getFocusIndex()).toBe(1);
  });

  it('preserves the user\'s edits across the re-render a focus move causes', () => {
    const c = mount();
    bodyField().value = 'edited by the user';

    key(c.element, 'ArrowDown');
    key(c.element, 'ArrowUp');

    expect(bodyField().value).toBe('edited by the user');
  });
});

// ── Enter on the body ────────────────────────────────────────────────────────

describe('Enter on the body — send', () => {
  it('emits the EDITED text and says so', () => {
    mount();
    bodyField().value = 'the edited prompt';

    key(bodyField(), 'Enter');

    expect(events).toEqual([{ type: 'send', surface: 'prompt_enhancement', text: 'the edited prompt' }]);
    expect(host.textContent).toContain('Sent — static build');
  });

  it('refuses a blank body, silently — BF-1', () => {
    mount();
    bodyField().value = '   \n  ';

    key(bodyField(), 'Enter');

    expect(events).toEqual([]);
  });
});

// ── Enter on the details — the CLI local merge ───────────────────────────────

describe('Enter on the details — the CLI\'s local merge', () => {
  it('merges under the one heading, clears the field, and returns focus to the body', () => {
    const c = mount();
    const details = host.querySelectorAll('textarea')[1]!;
    key(c.element, 'ArrowDown');             // focus details

    key(host.querySelectorAll('textarea')[1]!, 'Enter');

    const body = bodyField().value;
    expect(body).toContain(`\n\n${DETAILS_MERGE_HEADING}\nKeep the existing retry helper — do not rewrite it.`);
    expect(host.querySelectorAll('textarea')[1]!.value).toBe('');
    expect(c.getFocusIndex()).toBe(0);
    expect(events[0]!.type).toBe('apply-details');
    void details;
  });

  it('a second apply extends the ONE block — no second heading (live iMac report)', () => {
    const c = mount();
    key(c.element, 'ArrowDown');
    key(host.querySelectorAll('textarea')[1]!, 'Enter');      // first apply

    key(c.element, 'ArrowDown');
    host.querySelectorAll('textarea')[1]!.value = 'and one more thing';
    key(host.querySelectorAll('textarea')[1]!, 'Enter');      // second apply

    const body = bodyField().value;
    expect(body.split(DETAILS_MERGE_HEADING)).toHaveLength(2);  // exactly one heading
    expect(body).toContain('and one more thing');
  });

  it('refuses empty details and a blank body, silently', () => {
    const c = mount();
    key(c.element, 'ArrowDown');             // focus stays on details throughout
    host.querySelectorAll('textarea')[1]!.value = '   ';
    key(host.querySelectorAll('textarea')[1]!, 'Enter');
    expect(events).toEqual([]);

    bodyField().value = '';
    host.querySelectorAll('textarea')[1]!.value = 'details';
    key(host.querySelectorAll('textarea')[1]!, 'Enter');
    expect(events).toEqual([]);
  });

  it('mergeDetailsIntoBody matches the CLI character for character', () => {
    expect(mergeDetailsIntoBody('body', ' details ')).toBe(`body\n\n${DETAILS_MERGE_HEADING}\ndetails`);
    expect(mergeDetailsIntoBody(`body\n\n${DETAILS_MERGE_HEADING}\nfirst`, 'second'))
      .toBe(`body\n\n${DETAILS_MERGE_HEADING}\nfirst\nsecond`);
  });
});

// ── cancel paths — where PEF opens ───────────────────────────────────────────

describe('cancel is where feedback opens (§8.3)', () => {
  it('Use original prompt switches to PEF and reports it', () => {
    const c = mount();
    focusOn(c, 'Use original prompt');

    key(c.element, 'Enter');

    expect(events).toEqual([{ type: 'use-original', surface: 'prompt_enhancement' }]);
    expect(c.getModel().id).toBe('prompt_enhancement_feedback');
    expect(host.textContent).toContain('Prompt enhancement feedback');
  });

  it('Escape on PE cancels WITHOUT opening PEF — the CLI\'s shipped rule: feedback opens only via Use original (cli-submit-popup.ts:1469-1471)', () => {
    const c = mount();

    key(c.element, 'Escape');

    expect(events).toEqual([{ type: 'cancelled', surface: 'prompt_enhancement' }]);
    expect(c.getModel().id).toBe('prompt_enhancement'); // stays — the host closes the popup
  });
});

// ── the other Escapes, per surface ───────────────────────────────────────────

describe('Escape is per-surface — never one handler', () => {
  it('MPS-1: leaves editor focus first, preserving the draft', () => {
    const c = mount('mps_first');
    bodyField().value = 'a draft the user typed';
    expect(document.activeElement).toBe(bodyField());

    key(bodyField(), 'Escape');

    expect(document.activeElement).toBe(c.element);   // editor left, nothing emitted
    expect(events).toEqual([]);
    expect(bodyField().value).toBe('a draft the user typed');
  });

  it('MPS-1: with no editor focused, Esc declines the offer', () => {
    const c = mount('mps_first');
    key(bodyField(), 'Escape');              // first Esc: leave the editor

    key(c.element, 'Escape');                // second Esc: decline

    expect(events).toEqual([{ type: 'declined', surface: 'mps_first' }]);
    expect(host.textContent).toContain('Declined — static build.');
  });

  it('MPS-2: Esc cancels the whole remaining sequence — the footer says so', () => {
    const c = mount('mps_continuation');

    key(c.element, 'Escape');

    expect(events).toEqual([{ type: 'cancel-sequence', surface: 'mps_continuation' }]);
    expect(host.textContent).toContain('Sequence cancelled — static build.');
  });

  it('PEF: Esc skips', () => {
    const c = mount('prompt_enhancement_feedback');

    key(c.element, 'Escape');

    expect(events).toEqual([{ type: 'feedback-skipped', surface: 'prompt_enhancement_feedback' }]);
  });
});

// ── PEF activation ───────────────────────────────────────────────────────────

describe('PEF', () => {
  it('a fixed reason submits on Enter', () => {
    const c = mount('prompt_enhancement_feedback');

    key(c.element, 'Enter');                 // focus 0 = Not relevant enough

    expect(events).toEqual([{
      type: 'feedback', surface: 'prompt_enhancement_feedback', category: 'Not relevant enough',
    }]);
  });

  it('Other requires text — empty is refused, as the CLI\'s reducer refuses it', () => {
    const c = mount('prompt_enhancement_feedback');
    focusOn(c, 'Other');

    key(bodyField(), 'Enter');
    expect(events).toEqual([]);

    bodyField().value = 'my own reason';
    key(bodyField(), 'Enter');
    expect(events).toEqual([{
      type: 'feedback', surface: 'prompt_enhancement_feedback', text: 'my own reason',
    }]);
  });
});

// ── MPS action rows ──────────────────────────────────────────────────────────

describe('MPS action rows', () => {
  it('Cancel emits cancel-sequence with an echo', () => {
    const c = mount('mps_first');
    focusOn(c, MPS_CANCEL_LABEL);

    key(c.element, 'Enter');

    expect(events).toEqual([{ type: 'cancel-sequence', surface: 'mps_first' }]);
    expect(host.textContent).toContain('Sequence cancelled');
  });

  it('the interruption row emits and echoes', () => {
    const c = mount('mps_continuation');
    focusOn(c, 'I need to do something else first');

    key(c.element, 'Enter');

    expect(events).toEqual([{ type: 'interruption', surface: 'mps_continuation' }]);
    expect(host.textContent).toContain('Interruption noted');
  });
});

// ── the editor chords ────────────────────────────────────────────────────────

describe('Ctrl/Cmd+J — the newline, because Enter is send', () => {
  it('inserts at the caret and triggers auto-grow via input', () => {
    mount();
    const field = bodyField();
    field.value = 'ab';
    field.setSelectionRange(1, 1);
    let grew = false;
    field.addEventListener('input', () => { grew = true; });

    key(field, 'j', { code: 'KeyJ', ctrlKey: true });

    expect(field.value).toBe('a\nb');
    expect(field.selectionStart).toBe(2);
    expect(grew).toBe(true);
  });

  it('accepts the Cmd spelling the macOS hint names', () => {
    mount();
    const field = bodyField();
    field.value = 'x';
    field.setSelectionRange(1, 1);

    key(field, 'j', { code: 'KeyJ', metaKey: true });

    expect(field.value).toBe('x\n');
  });
});

describe('Ctrl/Cmd+↑/↓ — caret line movement, hand-built', () => {
  it('moves the caret a logical line, preserving the column where it can', () => {
    const field = document.createElement('textarea');
    field.value = 'first line\nsecond\nthird line';
    document.body.appendChild(field);

    field.setSelectionRange(9, 9);           // column 9 on line 1
    moveCaretLine(field, 1);
    expect(field.selectionStart).toBe(17);   // clamped to the end of 'second'

    moveCaretLine(field, 1);
    expect(field.selectionStart).toBe(24);   // column 6 restored on 'third line'

    moveCaretLine(field, -1);
    expect(field.selectionStart).toBe(17);
  });

  it('clamps the column when moving UP onto a shorter line', () => {
    // The downward cases never exercise this branch — a long line above a short
    // one is the input that does. Without the clamp the caret lands mid-way
    // through the WRONG line.
    const field = document.createElement('textarea');
    field.value = 'ab\na much longer line';
    document.body.appendChild(field);

    field.setSelectionRange(11, 11);         // column 8 on the long line

    moveCaretLine(field, -1);

    expect(field.selectionStart).toBe(2);    // clamped to the end of 'ab'
  });

  it('clamps at the first and last line', () => {
    const field = document.createElement('textarea');
    field.value = 'one\ntwo';
    document.body.appendChild(field);

    field.setSelectionRange(1, 1);
    moveCaretLine(field, -1);
    expect(field.selectionStart).toBe(0);

    field.setSelectionRange(5, 5);
    moveCaretLine(field, 1);
    expect(field.selectionStart).toBe(7);
  });

  it('is wired to the chord inside a field, and the row focus does not move', () => {
    const c = mount();
    const field = bodyField();
    field.setSelectionRange(0, 0);

    key(field, 'ArrowDown', { code: 'ArrowDown', ctrlKey: true });

    expect(c.getFocusIndex()).toBe(0);       // caret moved, row focus did not
  });
});

describe('browser-only combinations stay native — a terminal never sees them', () => {
  it('Ctrl+Shift+J is the DevTools console, not our newline', () => {
    mount();
    const field = bodyField();
    field.value = 'x';
    field.setSelectionRange(1, 1);
    let leaked = 0;
    const listener = (): void => { leaked += 1; };
    document.addEventListener('keydown', listener);

    key(field, 'J', { code: 'KeyJ', ctrlKey: true, shiftKey: true });

    document.removeEventListener('keydown', listener);
    expect(field.value).toBe('x');           // no newline inserted
    expect(leaked).toBe(1);                  // and not consumed either
  });

  it('Shift+arrow inside a field is select-by-line — row focus must not move', () => {
    const c = mount();

    key(bodyField(), 'ArrowDown', { code: 'ArrowDown', shiftKey: true });

    expect(c.getFocusIndex()).toBe(0);
  });

  it('Ctrl+Shift+arrow extends a selection — neither caret-move nor row-move fires', () => {
    const c = mount();
    const field = bodyField();
    field.setSelectionRange(0, 0);

    key(field, 'ArrowDown', { code: 'ArrowDown', ctrlKey: true, shiftKey: true });

    expect(c.getFocusIndex()).toBe(0);
    expect(field.selectionStart).toBe(0);    // our caret-mover did not run
  });
});

// ── the three panel fixes ────────────────────────────────────────────────────

describe('the three panel fixes (A4.6)', () => {
  it('stops every handled key from reaching the page — the ArrowUp hijack', () => {
    const c = mount();
    let leaked = 0;
    const listener = (): void => { leaked += 1; };
    document.addEventListener('keydown', listener);

    key(c.element, 'ArrowDown');
    key(c.element, 'Enter');
    key(c.element, 'Escape');
    key(c.element, ' ', { code: 'Space' });

    document.removeEventListener('keydown', listener);
    expect(leaked).toBe(0);
  });

  it('lets unhandled keys pass — only handled keys are stopped', () => {
    const c = mount();
    let seen = 0;
    const listener = (): void => { seen += 1; };
    document.addEventListener('keydown', listener);

    key(c.element, 'a', { code: 'KeyA' });

    document.removeEventListener('keydown', listener);
    expect(seen).toBe(1);
  });

  it('pointerdown outside a field re-takes focus, so the scoped listener keeps firing', () => {
    const c = mount('prompt_enhancement_feedback');   // focus 0 is an action row
    (document.activeElement as HTMLElement | null)?.blur?.();

    c.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(document.activeElement).toBe(c.element);
  });

  it('the keydown listener is scoped to the wrapper — a stray key elsewhere does nothing', () => {
    const c = mount();

    key(document.body, 'ArrowDown');

    expect(c.getFocusIndex()).toBe(0);
  });
});

// ── clicks ───────────────────────────────────────────────────────────────────

describe('clicks', () => {
  it('an action row activates on click, as the old panel\'s rows did', () => {
    const c = mount();
    const useOriginal = [...host.querySelectorAll('.np-label')]
      .find((el) => el.textContent === 'Use original prompt')!;

    useOriginal.closest('.np-row')!.dispatchEvent(new Event('click', { bubbles: true }));

    expect(events).toEqual([{ type: 'use-original', surface: 'prompt_enhancement' }]);
    expect(c.getModel().id).toBe('prompt_enhancement_feedback');
  });

  it('a field row focuses on click and does NOT activate — clicking to type must never send', () => {
    const c = mount();
    focusOn(c, 'Use original prompt');        // park focus away from the body

    const bodyLabel = [...host.querySelectorAll('.np-label')]
      .find((el) => el.textContent === 'Use enhanced prompt')!;
    bodyLabel.closest('.np-row')!.dispatchEvent(new Event('click', { bubbles: true }));

    expect(c.getFocusIndex()).toBe(0);
    expect(events).toEqual([]);
  });

  it('focusing the details textarea retargets Enter to the details row', () => {
    const c = mount();
    const details = host.querySelectorAll('textarea')[1]!;

    details.dispatchEvent(new Event('focus', { bubbles: true }));

    expect(c.getFocusIndex()).toBe(1);
    key(host.querySelectorAll('textarea')[1]!, 'Enter');
    expect(events[0]!.type).toBe('apply-details');   // applied, not sent
  });
});

// ── the pluggable hook (held D5 wiring plugs in here) ────────────────────────

describe('resolveActivation', () => {
  const other: SurfaceModel = {
    id: 'mps_first', label: 'Other', footer: 'f',
    rows: [{ kind: 'action', label: 'only' }],
  };

  it('a returned transition switches the model', () => {
    const c = mount('prompt_enhancement', {
      resolveActivation: () => ({ model: other }),
    });

    key(c.element, 'Enter');

    expect(c.getModel()).toBe(other);
    expect(events).toEqual([]);              // the hook consumed the activation
  });

  it("'refuse' is the CLI-style silent guard", () => {
    mount('prompt_enhancement', { resolveActivation: () => 'refuse' });
    bodyField().value = 'text';

    key(bodyField(), 'Enter');

    expect(events).toEqual([]);
  });

  it('null falls through to the controller\'s own routing', () => {
    mount('prompt_enhancement', { resolveActivation: () => null });
    bodyField().value = 'text';

    key(bodyField(), 'Enter');

    expect(events[0]!.type).toBe('send');
  });

  it('an unknown action row is never a silent no-op (A4.3)', () => {
    const registry = {
      ...REGISTRY,
      mps_first: {
        ...MPS_FIRST_FIXTURE,
        rows: [{ kind: 'action', label: 'Mystery row' }],
      } as SurfaceModel,
    };
    controller = createSurfaceController(host, {
      registry, initial: 'mps_first', onEvent: (e) => events.push(e),
    });

    key(controller.element, 'Enter');

    expect(events).toEqual([{ type: 'activate', surface: 'mps_first', label: 'Mystery row' }]);
    expect(host.textContent).toContain('No action wired for "Mystery row"');
  });
});

// ── notices ──────────────────────────────────────────────────────────────────

describe('the notice slot', () => {
  it('renders in the CLI\'s publicNotice position: blank, notice, blank, footer', () => {
    mount('mps_continuation');
    key(controller!.element, 'Escape');

    const footerRows = [...host.querySelectorAll('.np-footer .np-row')]
      .map((r) => [...r.children].map((c2) => c2.textContent ?? '').join(' ').trim());

    expect(footerRows).toEqual(['', 'Sequence cancelled — static build.', '', 'Enter send · Esc cancels sequence']);
  });

  it('clears on the next focus move, like the CLI clears publicNotice each loop', () => {
    const c = mount('mps_continuation');
    key(c.element, 'Escape');
    expect(host.textContent).toContain('Sequence cancelled');

    key(c.element, 'ArrowDown');

    expect(host.textContent).not.toContain('Sequence cancelled');
  });
});

describe('typing never re-renders the frame (D7 smoothness)', () => {
  it('input events leave the frame element untouched — typing is native', () => {
    // The acceptance is "no per-keystroke full re-render of the body": with 500
    // lines in the field, rebuilding the DOM on every keystroke would stutter.
    // Typing lives entirely in the textarea; the controller re-renders only on
    // focus moves and activations.
    const c = mount();
    const frameBefore = host.querySelector('.np-frame');
    const field = bodyField();

    for (let i = 0; i < 20; i++) {
      field.value += 'x';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(host.querySelector('.np-frame')).toBe(frameBefore);
    void c;
  });
});

// ── lifecycle ────────────────────────────────────────────────────────────────

describe('lifecycle', () => {
  it('setSurface switches; an unregistered id is ignored', () => {
    const c = mount();

    c.setSurface('mps_continuation');
    expect(c.getModel().id).toBe('mps_continuation');

    const before = c.getModel();
    c.setSurface('prompt_enhancement');
    expect(c.getModel().id).toBe('prompt_enhancement');
    void before;
  });

  it('destroy removes the wrapper and deadens every key', () => {
    const c = mount();
    c.destroy();

    expect(host.querySelector('.np-surface-root')).toBeNull();
    expect(() => key(document.body, 'ArrowDown')).not.toThrow();
    expect(events).toEqual([]);
  });
});

describe('Alt+Shift chords — the advertised no-conflict family (2026-08-25 remap)', () => {
  // The advisory panel's Ctrl+T→Alt+Shift+T precedent applied to the editor
  // chords: with strayed focus Ctrl+J is Chrome's Downloads, so the HINT now
  // names Alt+Shift, which no browser or OS claims. e.code drives the match —
  // on macOS Alt+Shift+J's e.key is a special character.
  it('Alt+Shift+J inserts the newline at the caret', () => {
    mount();
    const field = bodyField();
    field.value = 'ab';
    field.setSelectionRange(1, 1);

    key(field, 'J', { code: 'KeyJ', altKey: true, shiftKey: true });

    expect(field.value).toBe('a\nb');
    expect(field.selectionStart).toBe(2);
  });

  it('Alt+Shift+↑/↓ moves the caret by line', () => {
    mount();
    const field = bodyField();
    field.value = 'one\ntwo';
    field.setSelectionRange(6, 6); // in "two"

    key(field, 'ArrowUp', { code: 'ArrowUp', altKey: true, shiftKey: true });
    expect(field.selectionStart).toBeLessThanOrEqual(3); // now in "one"

    key(field, 'ArrowDown', { code: 'ArrowDown', altKey: true, shiftKey: true });
    expect(field.selectionStart).toBeGreaterThanOrEqual(4); // back in "two"
  });

  it('Alt WITHOUT Shift (and Ctrl+Shift) stay native — never consumed', () => {
    mount();
    const field = bodyField();
    field.value = 'x';
    field.setSelectionRange(1, 1);

    key(field, 'j', { code: 'KeyJ', altKey: true });                    // AltGr class
    key(field, 'J', { code: 'KeyJ', ctrlKey: true, shiftKey: true });   // DevTools console
    expect(field.value).toBe('x'); // no newline from either
  });

  it('the shipped hint advertises the Alt+Shift family, not Ctrl+J', () => {
    expect(EDIT_KEYS_HINT).toMatch(/(Alt|Option)\+Shift\+J/);
    expect(EDIT_KEYS_HINT).not.toContain('Ctrl+J');
  });
});

describe('focus-steal guard (live 2026-08-25: agent pages grab focus after show)', () => {
  it('a steal that lands focus on document.body within the window is re-taken to the focused field', async () => {
    mount();
    const field = bodyField();
    expect(document.activeElement === field || field.getRootNode().activeElement === field
      || document.activeElement === document.body).toBe(true);
    field.focus();
    // Page-script steal signature: blur → focus rests on body.
    field.blur();
    expect(document.activeElement).toBe(document.body);
    await new Promise((r) => setTimeout(r, 10));
    expect(document.activeElement).not.toBe(document.body); // re-taken
  });

  it('a steal AFTER the window expires is respected (the non-modal rule survives)', async () => {
    vi.useFakeTimers();
    try {
      mount();
      const field = bodyField();
      field.focus();
      vi.advanceTimersByTime(3_500); // past FOCUS_STEAL_WINDOW_MS with no render
      field.blur();
      await vi.advanceTimersByTimeAsync(50);
      expect(document.activeElement).toBe(document.body); // left alone
    } finally {
      vi.useRealTimers();
    }
  });

  // 2026-08-25, same day, second live lesson: Replit and Lovable steal focus to
  // their own COMPOSER (a real element, not body) right at popup time — the
  // original body-only signature let that through and the user had to click the
  // popup before any key worked. The signature is now intent: no recent user
  // pointerdown outside the surface = programmatic steal.
  it('a programmatic steal to a page element (agent composer) is re-taken', async () => {
    mount();
    const composer = document.createElement('input');
    document.body.appendChild(composer);
    const field = bodyField();
    field.focus();
    composer.focus(); // page script re-focusing its composer — no user gesture
    await new Promise((r) => setTimeout(r, 10));
    expect(document.activeElement).not.toBe(composer); // re-taken to the surface
    expect(host.contains(document.activeElement)).toBe(true);
    composer.remove();
  });

  it('a focus move preceded by the user\'s own click on the page is respected', async () => {
    mount();
    const composer = document.createElement('input');
    document.body.appendChild(composer);
    bodyField().focus();
    composer.dispatchEvent(new Event('pointerdown', { bubbles: true })); // deliberate click
    composer.focus();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.activeElement).toBe(composer); // released — non-modal rule
    composer.remove();
  });

  it('a pointerdown INSIDE the surface never counts as a release gesture', async () => {
    mount();
    const composer = document.createElement('input');
    document.body.appendChild(composer);
    const field = bodyField();
    field.focus();
    field.dispatchEvent(new Event('pointerdown', { bubbles: true })); // user clicks the popup itself
    composer.focus(); // then the page steals anyway
    await new Promise((r) => setTimeout(r, 10));
    expect(host.contains(document.activeElement)).toBe(true); // still re-taken
    composer.remove();
  });
});

describe('field auto-grow runs ATTACHED (live 2026-08-25: collapsed body at first paint)', () => {
  it('the render pass re-grows every field after the frame joins the DOM', () => {
    // buildField's own autoGrow call happens while the frame is detached, where
    // scrollHeight is 0 — mimic exactly that with a connection-aware stub.
    const proto = HTMLTextAreaElement.prototype;
    Object.defineProperty(proto, 'scrollHeight', {
      configurable: true,
      get(this: HTMLTextAreaElement) { return this.isConnected ? 42 : 0; },
    });
    try {
      mount();
      // Without the attached pass this is '0px' and the body is invisible.
      expect(bodyField().style.height).toBe('42px');
    } finally {
      delete (proto as unknown as Record<string, unknown>)['scrollHeight'];
    }
  });
});

describe('read-only fields (the CLI\'s locked editor — read_only_fallback bodies)', () => {
  const LOCKED: SurfaceModel = {
    ...PE_FIXTURE,
    rows: PE_FIXTURE.rows.map((r) => (r.kind === 'field' ? { ...r, readOnly: true } : r)),
  };

  it('renders natively read-only textareas', () => {
    mount('prompt_enhancement', { registry: { ...REGISTRY, prompt_enhancement: LOCKED } });
    for (const field of host.querySelectorAll('textarea')) {
      expect((field as HTMLTextAreaElement).readOnly).toBe(true);
    }
  });

  it('Enter on the body still sends — read-only locks editing, never the send', () => {
    mount('prompt_enhancement', { registry: { ...REGISTRY, prompt_enhancement: LOCKED } });
    key(bodyField(), 'Enter');
    expect(events.some((e) => e.type === 'send')).toBe(true);
  });

  it('the newline chord respects the lock — setRangeText bypasses readonly, so the handler must not (Firefox live, 2026-08-25)', () => {
    mount('prompt_enhancement', { registry: { ...REGISTRY, prompt_enhancement: LOCKED } });
    const field = bodyField();
    const before = field.value;
    field.focus();
    key(field, 'J', { code: 'KeyJ', altKey: true, shiftKey: true });
    key(field, 'j', { code: 'KeyJ', ctrlKey: true });
    expect(field.value).toBe(before); // no newline entered the locked body
  });

  it('refuses the details apply on a locked body (the CLI\'s unreachable merge)', () => {
    mount('prompt_enhancement', { registry: { ...REGISTRY, prompt_enhancement: LOCKED } });
    const details = [...host.querySelectorAll('textarea')][1] as HTMLTextAreaElement;
    details.value = 'typed details';
    key(details, 'ArrowDown'); // land row focus on the details row (re-renders)
    const freshDetails = [...host.querySelectorAll('textarea')][1] as HTMLTextAreaElement;
    key(freshDetails, 'Enter');
    expect(events.filter((e) => e.type === 'apply-details')).toHaveLength(0);
    expect(bodyField().value).not.toContain(DETAILS_MERGE_HEADING);
  });
});

describe('focus-steal guard vs the injector (a HIDDEN surface must never take focus)', () => {
  it('does not re-take focus while the shadow host is display:none', async () => {
    // Mount inside a real shadow host, hide the host (the dock's hide()
    // mechanism), then blur — the guard must leave focus alone so the
    // injector can own the agent composer.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const mountEl = document.createElement('div');
    shadow.appendChild(mountEl);
    const controller = createSurfaceController(mountEl, { registry: { prompt_enhancement: PE_FIXTURE }, initial: 'prompt_enhancement' });
    const field = shadow.querySelector('textarea') as HTMLTextAreaElement;
    field.focus();
    host.style.display = 'none';
    field.blur();
    await new Promise((r) => setTimeout(r, 10));
    expect(shadow.activeElement).toBeNull(); // guard did NOT yank focus back
    controller.destroy();
    host.remove();
  });
});

describe('caret follow — the CLI\'s keepCursorVisible for the windowed field (live 2026-08-25)', () => {
  // The CLI syncs the window after EVERY caret-affecting op (multiline-editor:
  // insert :282, newline :299, visual moves :248) and its details apply
  // "scrolls to where the details landed" (cli-submit-popup.ts:1037). A
  // textarea's setSelectionRange/setRangeText never scroll — these pin that
  // every custom caret path calls the follow seam. jsdom computes no layout,
  // so the pixel math is pinned separately on the pure clamp.
  let follow: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    const view = await import('./surface-view.js');
    follow = vi.spyOn(view.fieldScroller, 'follow').mockImplementation(() => {});
  });
  afterEach(() => { follow.mockRestore(); });

  it('Alt+Shift+↓/↑ caret moves follow', () => {
    mount();
    const field = bodyField();
    field.focus();
    key(field, 'ArrowDown', { code: 'ArrowDown', altKey: true, shiftKey: true });
    key(field, 'ArrowUp', { code: 'ArrowUp', ctrlKey: true });
    expect(follow).toHaveBeenCalledTimes(2);
  });

  it('the newline chord follows', () => {
    mount();
    const field = bodyField();
    field.focus();
    key(field, 'J', { code: 'KeyJ', altKey: true, shiftKey: true });
    expect(follow).toHaveBeenCalledTimes(1);
  });

  it('the details apply follows the BODY field to the landed merge', () => {
    const c = mount();
    key(c.element, 'ArrowDown'); // focus details (fixture has prefilled details text)
    key(host.querySelectorAll('textarea')[1]!, 'Enter');
    expect(events[0]!.type).toBe('apply-details');
    expect(follow).toHaveBeenCalledWith(bodyField());
  });

  it('a plain row-focus render does NOT follow — the CLI opens with the window at the top, cursor hidden (cli-submit-popup.ts:971-974)', () => {
    const c = mount();
    key(c.element, 'ArrowDown');
    key(c.element, 'ArrowUp');
    expect(follow).not.toHaveBeenCalled();
  });
});

describe('window resize re-grows the fields (the CLI repaints on terminal resize, GAP-2)', () => {
  it('a resize event re-runs the attached grow pass', () => {
    const proto = HTMLTextAreaElement.prototype;
    Object.defineProperty(proto, 'scrollHeight', {
      configurable: true,
      get(this: HTMLTextAreaElement) { return this.isConnected ? 42 : 0; },
    });
    try {
      mount();
      bodyField().style.height = '1px';          // pretend the reflow staled it
      window.dispatchEvent(new Event('resize'));
      expect(bodyField().style.height).toBe('42px'); // re-grown
    } finally {
      delete (proto as unknown as Record<string, unknown>)['scrollHeight'];
    }
  });
});

describe('Enter is the plain, committed Enter only (irreversible-send guards)', () => {
  it('Shift+Enter never sends — it is the universal newline chord in chat composers', () => {
    mount();
    const field = bodyField();
    field.value = 'a real prompt';
    key(field, 'Enter', { shiftKey: true });
    expect(events).toEqual([]);           // nothing sent
  });

  it('an IME commit (isComposing) never sends — CJK/Indic users press Enter to accept a candidate', () => {
    mount();
    const field = bodyField();
    field.value = 'ひらがな';
    key(field, 'Enter', { isComposing: true } as KeyboardEventInit);
    expect(events).toEqual([]);
  });

  it('the legacy keyCode 229 composition marker is also refused', () => {
    mount();
    const field = bodyField();
    field.value = '한국어';
    key(field, 'Enter', { keyCode: 229 } as KeyboardEventInit);
    expect(events).toEqual([]);
  });

  it('plain Enter still sends (the guards are narrow)', () => {
    mount();
    const field = bodyField();
    field.value = 'send me';
    key(field, 'Enter');
    expect(events).toEqual([{ type: 'send', surface: 'prompt_enhancement', text: 'send me' }]);
  });

  it('neither guarded Enter escapes to the host page', () => {
    mount();
    const field = bodyField();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    field.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe('the focus guard never grabs the keyboard for a hidden panel', () => {
  it('a collapsed dock (mount display:none) is left alone', async () => {
    const outer = document.createElement('div');
    document.body.appendChild(outer);
    const shadow = outer.attachShadow({ mode: 'open' });
    const mount = document.createElement('div');
    shadow.appendChild(mount);
    const c = createSurfaceController(mount, { registry: REGISTRY, initial: 'prompt_enhancement' });
    const field = shadow.querySelector('textarea') as HTMLTextAreaElement;
    field.focus();

    mount.style.display = 'none';   // the dock collapsing
    field.blur();
    await new Promise((r) => setTimeout(r, 10));

    expect(shadow.activeElement).toBeNull();
    c.destroy();
    outer.remove();
  });
});
