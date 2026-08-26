// ============================================================================
// D7.1 — the surfaces harness: a real browser exercising the real code.
// ----------------------------------------------------------------------------
// jsdom computes no layout, so everything C-2 promises — the header shrinking
// before the options band starves, one row always visible, long tokens wrapping
// instead of widening the frame — can only be PROVEN here. This page mounts the
// actual dock, chrome and controller (no copies, no mocks) and carries an
// automated sweep that renders every surface across a content × viewport
// matrix and measures the result with getBoundingClientRect.
//
// It lives INSIDE src/ext-browser/ui/surfaces/ because C-5 forbids touching
// anything outside this layer — the existing panel harness is not modified.
// Dev-only: nothing imports it, it reaches no bundle, and its build output is
// git-ignored beside it.
//
// Run: `node build.mjs` in this directory, then open index.html (any static
// server). `?sweep=1` runs the matrix on load and prints one line of JSON —
// `SWEEP {"pass":…,"fail":…}` — to the console for automation.
// ============================================================================

import { mountNexpathDock } from '../dock.js';
import { installChromeStyles } from '../chrome.js';
import { growFields, renderSurface } from '../surface-view.js';
import { createSurfaceController, DETAILS_MERGE_HEADING, type SurfaceEvent } from '../surface-controller.js';
import type { SurfaceId, SurfaceModel } from '../surface-model.js';
import { PE_FIXTURE } from '../fixtures/pe.js';
import { MPS_FIRST_FIXTURE, MPS_CONTINUATION_FIXTURE } from '../fixtures/mps.js';
import { PEF_FIXTURE } from '../fixtures/pef.js';
import { withBodyText } from '../refinement.js';
import { createRefinementTransitions } from '../refinement-transitions.js';
import { PE_REFINED_TEXT, MPS_REFINED_TEXT } from '../fixtures/directional.js';

const FIXTURES: Record<SurfaceId, SurfaceModel> = {
  prompt_enhancement: PE_FIXTURE,
  mps_first: MPS_FIRST_FIXTURE,
  mps_continuation: MPS_CONTINUATION_FIXTURE,
  prompt_enhancement_feedback: PEF_FIXTURE,
};

/** The pre-authored recompose, per surface — the static stand-in for Option B. */
const REFINED_TEXTS = {
  prompt_enhancement: PE_REFINED_TEXT,
  mps_first: MPS_REFINED_TEXT,
};

/**
 * The payload pushed through every slot the renderer builds with innerHTML.
 *
 * Field text alone would prove nothing: it lands in `textarea.value`, which is
 * inherently safe and never touches `escapeHtml`. The label, header, hints and
 * notes are the interpolated ones, so those are what a real escaping check has
 * to carry.
 */
function withPayloadEverywhere(model: SurfaceModel, payload: string): SurfaceModel {
  return {
    ...model,
    label: payload,
    pinch: payload,
    whyHelp: payload,
    rows: model.rows.map((r) => (r.kind === 'note'
      ? { ...r, text: payload }
      : { ...r, label: payload, ...(r.kind === 'field' ? { hints: { always: [payload] } } : {}) })),
    footer: payload,
  };
}

// ── interactive mode ─────────────────────────────────────────────────────────

function mountInteractive(): void {
  const dock = mountNexpathDock();
  const shadow = dock.mountEl.getRootNode() as ShadowRoot;
  installChromeStyles(shadow);

  const log = document.getElementById('log')!;
  const logEvent = (e: SurfaceEvent): void => {
    const line = document.createElement('div');
    line.textContent = JSON.stringify(e);
    log.prepend(line);
  };
  const controller = createSurfaceController(dock.mountEl, {
    registry: FIXTURES,
    initial: 'prompt_enhancement',
    // Wired always: the refinement rows are part of the surfaces, so a
    // controller without this hook would render them as dead options — the
    // exact thing the CLI revert to 48aac87 was about.
    resolveActivation: createRefinementTransitions(REFINED_TEXTS),
    onEvent: logEvent,
  });
  dock.show();

  for (const id of Object.keys(FIXTURES) as SurfaceId[]) {
    const button = document.createElement('button');
    button.textContent = id;
    button.addEventListener('click', () => controller.setSurface(id));
    document.getElementById('picker')!.appendChild(button);
  }
}

// ── the sweep (D7.2 + D7.3) ──────────────────────────────────────────────────

/** The content matrix the plan names, plus the escapeHtml payload. */
const CONTENT_CASES: ReadonlyArray<readonly [string, string]> = [
  ['empty', ''],
  ['one line', 'One short line.'],
  ['50 lines', Array.from({ length: 50 }, (_, i) => `line ${i + 1} of fifty`).join('\n')],
  ['500 lines', Array.from({ length: 500 }, (_, i) => `line ${i + 1} of five hundred`).join('\n')],
  ['5000-char paragraph', 'word '.repeat(1000).trim()],
  ['2000-char unbroken token', 'x'.repeat(2000)],
  ['RTL + CJK', 'שלום עולם مرحبا بالعالم\n漢字とカタカナが混ざった行です\nمزيج של שפות 中文'],
  // `<img onerror>` rather than `<script>`: a script inserted via innerHTML is
  // inert BY SPEC, so the obvious payload can never fire and testing it proves
  // nothing. An img handler is the one that actually runs.
  ['markup payload', 'a < b & "c" > d <img src=x onerror="window.__pwned=1">'],
];

/** One CLI text line. A field shorter than this is showing nothing at all. */
const FRAME_LINE_FLOOR_PX = 14;

/** Viewport-shaped boxes. 230 and 180 are the panel bug's reproduction range. */
const SIZES: ReadonlyArray<readonly [number, number]> = [
  [2560, 1080], [1920, 1080], [1440, 800], [1024, 600],
  [800, 400], [600, 300], [360, 230], [360, 180],
];

interface CellResult {
  surface: string; content: string; w: number; h: number;
  headerVisible: boolean; rowVisible: boolean; footerVisible: boolean;
  noHOverflow: boolean; notGrown: boolean; noInjection: boolean; fieldsShowContent: boolean;
  detail: string;
}

function within(inner: DOMRect, outer: DOMRect): boolean {
  // "Visible" = some of it lies inside the box (1px tolerance).
  return inner.bottom > outer.top + 1 && inner.top < outer.bottom - 1
    && inner.right > outer.left + 1 && inner.left < outer.right - 1;
}

function sweepCell(surface: SurfaceModel, label: string, contentName: string, w: number, h: number): CellResult {
  const box = document.createElement('div');
  box.style.cssText = `width:${w}px;height:${h}px;overflow:hidden;position:relative;`;
  document.getElementById('sweep-stage')!.appendChild(box);

  const frame = renderSurface(document, surface, { focusIndex: 0 });
  box.appendChild(frame);
  growFields(frame);

  const boxRect = box.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const scroll = frame.querySelector('.np-scroll') as HTMLElement;
  const header = frame.querySelector('.np-header')!.getBoundingClientRect();
  const bullets = [...frame.querySelectorAll('.np-scroll .np-bullet')].map((b) => b.getBoundingClientRect());
  const footer = frame.querySelector('.np-footer .np-dim')!.getBoundingClientRect();

  const result: CellResult = {
    surface: label, content: contentName, w, h,
    headerVisible: within(header, boxRect),
    // The panel bug's metric: at least one option row must remain visible.
    rowVisible: bullets.some((b) => within(b, boxRect)),
    footerVisible: within(footer, boxRect),
    // Measured on the SCROLL BAND as well as the frame: `.np-frame` is
    // `overflow: hidden`, so a long token overflowing inside the band can be
    // clipped out of the frame's own scrollWidth and read as clean. The band is
    // where `overflow-wrap: anywhere` has to do its work, so the band is where
    // a failure would actually show.
    noHOverflow: frame.scrollWidth <= frame.clientWidth + 1
      && scroll.scrollWidth <= scroll.clientWidth + 1
      && frameRect.width <= boxRect.width + 1,
    notGrown: frameRect.height <= boxRect.height + 1,
    // A REAL detector: if escaping broke, the markup becomes elements. The old
    // check read a flag nothing ever sets, against a payload that cannot fire —
    // it would have passed with escaping fully removed.
    noInjection: frame.querySelector('script, img, iframe, svg, object, embed') === null
      && !(window as unknown as Record<string, unknown>)['__pwned'],
    // A field must show its content, or SAY that it cannot.
    //
    // The first version of this required the field to be tall enough for all
    // its text, which caught the 0px-tall prompt. Then the field gained a cap —
    // thirty blank lines used to push every row below it off the frame — and
    // "tall enough for everything" became the wrong invariant: a capped field
    // is correct precisely when it is SHORTER than its content. What must hold
    // now is that nothing is hidden silently: either the whole text fits, or a
    // scroll marker is on screen saying how much does not.
    fieldsShowContent: [...frame.querySelectorAll('textarea')].every((f) => {
      const height = f.getBoundingClientRect().height;
      if (height < FRAME_LINE_FLOOR_PX) return false;              // collapsed
      if (f.scrollHeight <= height + 1) return true;               // all of it shown
      const group = f.closest('.np-field-group');
      return !!group?.querySelector('.np-marker-row:not(.np-marker-hidden)');
    }),
    // The numbers, not just the verdict: a boolean tells you a field is wrong
    // and nothing about how.
    detail: [...frame.querySelectorAll('textarea')]
      .map((f, i) => `f${i} h=${Math.round(f.getBoundingClientRect().height)} sh=${f.scrollHeight} w=${Math.round(f.getBoundingClientRect().width)}`)
      .join(' | '),
  };

  box.remove();
  return result;
}

export function runSweep(): { pass: number; fail: number; failures: CellResult[] } {
  installChromeStyles(document.head);
  const failures: CellResult[] = [];
  let pass = 0;

  const surfaces: ReadonlyArray<readonly [string, SurfaceModel]> = [
    ['PE', PE_FIXTURE], ['MPS-1', MPS_FIRST_FIXTURE],
    ['MPS-2', MPS_CONTINUATION_FIXTURE], ['PEF', PEF_FIXTURE],
  ];

  for (const [label, fixture] of surfaces) {
    // The full size grid with the fixture's own content…
    for (const [w, h] of SIZES) {
      const cell = sweepCell(fixture, label, 'fixture', w, h);
      if (cell.headerVisible && cell.rowVisible && cell.footerVisible && cell.noHOverflow && cell.notGrown && cell.noInjection && cell.fieldsShowContent) pass += 1;
      else failures.push(cell);
    }
    // WHERE `overflow-wrap: anywhere` ACTUALLY MATTERS. A long token in the body
    // proves nothing about it: the body is a textarea, which soft-wraps by its
    // own rules whatever the CSS says — verified by turning the property off and
    // watching the body-only cells still pass. The property governs the
    // NON-textarea slots (labels, notes, hints, header), so the stress has to go
    // there. Same mistake the escaping payload made, found the same way.
    for (const [name, text] of [
      ['2000-char token in every slot', 'x'.repeat(2000)],
      ['5000-char paragraph in every slot', 'word '.repeat(1000).trim()],
    ] as const) {
      // 360x230 and 360x180 are the sizes that matter most here: a header made
      // tall by long content, in a box short enough that it MUST shrink to leave
      // the options band a row. That is the panel bug's exact geometry, and
      // without these sizes turning the header's `flex: 0 1 auto` into
      // `0 0 auto` — the C-2 core — passed the whole sweep.
      for (const [w, h] of [[1440, 800], [600, 300], [360, 230], [360, 180]] as const) {
        const cell = sweepCell(withPayloadEverywhere(fixture, text), label, name, w, h);
        if (cell.headerVisible && cell.rowVisible && cell.footerVisible && cell.noHOverflow && cell.notGrown && cell.noInjection && cell.fieldsShowContent) pass += 1;
        else failures.push(cell);
      }
    }

    // Every innerHTML slot carrying the live payload, once per surface.
    {
      const cell = sweepCell(
        withPayloadEverywhere(fixture, 'a < b & "c" > d <img src=x onerror="window.__pwned=1">'),
        label, 'payload in every slot', 1440, 800,
      );
      if (cell.headerVisible && cell.rowVisible && cell.footerVisible && cell.noHOverflow && cell.notGrown && cell.noInjection && cell.fieldsShowContent) pass += 1;
      else failures.push(cell);
    }

    // …and the content matrix at a wide, a narrow and the bug-range size.
    for (const [contentName, text] of CONTENT_CASES) {
      for (const [w, h] of [[1440, 800], [600, 300], [360, 230]] as const) {
        const cell = sweepCell(withBodyText(fixture, text), label, contentName, w, h);
        if (cell.headerVisible && cell.rowVisible && cell.footerVisible && cell.noHOverflow && cell.notGrown && cell.noInjection && cell.fieldsShowContent) pass += 1;
        else failures.push(cell);
      }
    }
  }

  return { pass, fail: failures.length, failures };
}

function renderSweepReport(): void {
  const { pass, fail, failures } = runSweep();
  const banner = document.getElementById('banner')!;
  banner.textContent = fail === 0
    ? `SWEEP PASS — ${pass}/${pass + fail} cells green`
    : `SWEEP FAIL — ${fail} of ${pass + fail} cells failed`;
  banner.className = fail === 0 ? 'pass' : 'fail';

  const detail = document.getElementById('failures')!;
  for (const f of failures) {
    const row = document.createElement('div');
    const flags = Object.entries(f)
      .filter(([k, v]) => v === false && k !== 'surface' && k !== 'content')
      .map(([k]) => k).join(', ');
    row.textContent = `${f.surface} · ${f.content} · ${f.w}×${f.h} → ${flags}   [${f.detail}]`;
    detail.appendChild(row);
  }
  // Reported two ways: the console line for a Chrome --dump-dom run, and a POST
  // so browsers WITHOUT that flag can be measured too. Firefox has no
  // --dump-dom, and C-3 names Firefox first.
  report('SWEEP', pass, fail, failures.slice(0, 8).map((f) => `${f.surface} · ${f.content} · ${f.w}x${f.h} [${f.detail}]`));
}

// -- the functionality run (?e2e=1) ------------------------------------------
//
// The controller's behaviour has only ever been driven in jsdom, which has no
// layout, no real focus model and a synthetic event loop. These scenarios run
// the SAME assertions against a real engine, where focus, selection and event
// dispatch are the browser's own. Each writes a line into the page so a headless
// `--dump-dom` can read the verdict without a driver library.

interface Scenario { name: string; run: () => string | null }

function e2eScenarios(): Scenario[] {
  const mount = (initial: SurfaceId) => {
    const host = document.createElement('div');
    document.getElementById('sweep-stage')!.appendChild(host);
    const events: SurfaceEvent[] = [];
    const controller = createSurfaceController(host, {
      registry: FIXTURES, initial, onEvent: (e) => events.push(e),
    });
    return { host, controller, events };
  };
  // Same surfaces as everything else — the refinement rows are part of them —
  // with the hook that makes those rows do something.
  const mountD5 = (initial: SurfaceId) => {
    const host = document.createElement('div');
    document.getElementById('sweep-stage')!.appendChild(host);
    const events: SurfaceEvent[] = [];
    const controller = createSurfaceController(host, {
      registry: FIXTURES,
      initial,
      resolveActivation: createRefinementTransitions(REFINED_TEXTS),
      onEvent: (e) => events.push(e),
    });
    return { host, controller, events };
  };
  const press = (el: Element, key: string, init: KeyboardEventInit = {}): void => {
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key, code: init.code ?? key, bubbles: true, cancelable: true, ...init,
    }));
  };
  const eq = (a: unknown, b: unknown, what: string): string | null =>
    JSON.stringify(a) === JSON.stringify(b) ? null : what + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b);

  return [
    {
      name: 'the body field really holds the keyboard on mount',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const ok = document.activeElement === host.querySelector('textarea');
        controller.destroy();
        return ok ? null : 'the body textarea did not take real focus';
      },
    },
    {
      name: 'Enter sends the text the user actually typed',
      run() {
        const { host, controller, events } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'typed in a real browser';
        press(field, 'Enter');
        const r = eq(events, [{ type: 'send', surface: 'prompt_enhancement', text: 'typed in a real browser' }], 'events');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'a blank body is refused, silently (BF-1)',
      run() {
        const { host, controller, events } = mount('prompt_enhancement');
        host.querySelector('textarea')!.value = '   \n  ';
        press(host.querySelector('textarea')!, 'Enter');
        const r = eq(events.length, 0, 'events');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'Enter on details merges locally and returns focus to the body',
      run() {
        const { host, controller, events } = mount('prompt_enhancement');
        press(controller.element, 'ArrowDown');
        press(host.querySelectorAll('textarea')[1]!, 'Enter');
        const body = host.querySelector('textarea')!.value;
        const errors = [
          body.includes(DETAILS_MERGE_HEADING) ? null : 'merge heading missing',
          host.querySelectorAll('textarea')[1]!.value === '' ? null : 'details not cleared',
          controller.getFocusIndex() === 0 ? null : 'focus did not return to the body',
          events[0]?.type === 'apply-details' ? null : 'apply-details not emitted',
        ].filter(Boolean);
        controller.destroy();
        return errors.length ? errors.join('; ') : null;
      },
    },
    {
      name: 'Ctrl+J inserts a newline at the real caret',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'ab';
        field.setSelectionRange(1, 1);
        press(field, 'j', { code: 'KeyJ', ctrlKey: true });
        const r = eq([field.value, field.selectionStart], ['a\nb', 2], 'value/caret');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'Ctrl+Shift+J stays native - it is the DevTools chord',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'x';
        field.setSelectionRange(1, 1);
        press(field, 'J', { code: 'KeyJ', ctrlKey: true, shiftKey: true });
        const r = eq(field.value, 'x', 'value');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'arrows clamp at both ends, never wrap',
      run() {
        // The last index comes from the fixture, not a literal. It was 2 until
        // the refinement rows joined the surface, and a hard-coded 2 turned a
        // content change into a false failure.
        const last = PE_FIXTURE.rows.filter((r) => r.kind !== 'note').length - 1;
        const { controller } = mount('prompt_enhancement');
        press(controller.element, 'ArrowUp');
        const top = controller.getFocusIndex();
        for (let i = 0; i < last + 4; i++) press(controller.element, 'ArrowDown');
        const bottom = controller.getFocusIndex();
        controller.destroy();
        return eq([top, bottom], [0, last], 'top/bottom focus');
      },
    },
    {
      name: 'Escape on PE cancels into the feedback surface',
      run() {
        const { controller, events } = mount('prompt_enhancement');
        press(controller.element, 'Escape');
        const r = eq([events[0]?.type, controller.getModel().id],
          ['cancelled', 'prompt_enhancement_feedback'], 'event/surface');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'MPS-1 Escape leaves the editor before it declines',
      run() {
        const { host, controller, events } = mount('mps_first');
        const field = host.querySelector('textarea')!;
        field.value = 'a draft';
        press(field, 'Escape');
        const afterFirst = events.length === 0 && document.activeElement !== field;
        press(controller.element, 'Escape');
        const afterSecond = events[0]?.type === 'declined';
        const draftKept = host.querySelector('textarea')!.value === 'a draft';
        controller.destroy();
        return afterFirst && afterSecond && draftKept ? null
          : 'first=' + afterFirst + ' second=' + afterSecond + ' draftKept=' + draftKept;
      },
    },
    {
      name: 'typing does not rebuild the frame (500-line smoothness)',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const before = host.querySelector('.np-frame');
        const field = host.querySelector('textarea')!;
        field.value = Array.from({ length: 500 }, (_, i) => 'line ' + i).join('\n');
        for (let i = 0; i < 20; i++) {
          field.value += 'x';
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const r = host.querySelector('.np-frame') === before ? null : 'the frame was rebuilt while typing';
        controller.destroy();
        return r;
      },
    },
    {
      name: 'handled keys do not reach the page (the ArrowUp hijack)',
      run() {
        const { controller } = mount('prompt_enhancement');
        let leaked = 0;
        const listener = (): void => { leaked += 1; };
        document.addEventListener('keydown', listener);
        press(controller.element, 'ArrowDown');
        press(controller.element, 'Escape');
        document.removeEventListener('keydown', listener);
        controller.destroy();
        return eq(leaked, 0, 'keys that escaped to the page');
      },
    },
    {
      name: 'PEF: a fixed reason submits, Other needs text',
      run() {
        const { host, controller, events } = mount('prompt_enhancement_feedback');
        press(controller.element, 'Enter');
        const fixed = events[0]?.type === 'feedback';
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');
        const field = host.querySelector('textarea')!;
        press(field, 'Enter');
        const refusedEmpty = events.length === 1;
        field.value = 'my reason';
        press(field, 'Enter');
        const accepted = events.length === 2;
        controller.destroy();
        return fixed && refusedEmpty && accepted ? null
          : 'fixed=' + fixed + ' refusedEmpty=' + refusedEmpty + ' accepted=' + accepted;
      },
    },
    {
      name: 'the whole block dims when the caret leaves it — title AND body',
      run() {
        // Owner request 2026-08-24. Row selection and "I am typing here" must
        // not look identical, so the label above a field is bright only while
        // that field holds the keyboard. Measured as a real computed colour,
        // because a class name would prove nothing about what is on screen.
        const { host, controller } = mount('prompt_enhancement');
        const label = host.querySelector('.np-focused .np-label') as HTMLElement | null;
        const field = host.querySelector('textarea')!;
        if (!label) { controller.destroy(); return 'no focused label found'; }

        // `:focus` and `:focus-within` only match while the WINDOW has focus,
        // and Firefox honours that strictly where Chrome does not. A headless
        // window has none, so this engine cannot be asked the question at all —
        // reported as SKIPPED rather than passed, because a green tick here
        // would be a claim nothing measured.
        if (!document.hasFocus()) {
          controller.destroy();
          return 'skip: needs a focused window — :focus-within cannot match without one';
        }

        let blurFired = false;
        field.addEventListener('blur', () => { blurFired = true; });
        field.focus();
        const wasActive = document.activeElement === field;
        const editing = getComputedStyle(label).color;
        const editingBody = getComputedStyle(field).color;
        field.blur();
        const idle = getComputedStyle(label).color;
        const idleBody = getComputedStyle(field).color;
        controller.destroy();

        if (editing === idle) {
          // Say WHY, not just that they matched: whether the engine gave the
          // field focus at all, whether a blur event arrived, and whether the
          // document itself is focused (a headless window often is not).
          return `identical (${editing}) — hasFocus=${document.hasFocus()}`
            + ` activeWasField=${wasActive} blurFired=${blurFired}`
            + ` classAfter=${label.className}`;
        }
        // The BODY has to come down with its title. A dim heading over bright
        // text still reads as the active block — that was the second report.
        if (editingBody === idleBody) {
          return `the body looked identical editing and idle: ${editingBody}`;
        }
        // The active block must have its own internal hierarchy too — a title
        // and a body at the same colour and weight read as one flat run.
        if (editing === editingBody) {
          return `title and body are the same colour while editing: ${editing}`;
        }
        // Editing: the title is the brightest tier and its body one step below,
        // so the heading reads as a heading. Idle: both fall to the dim tier.
        const want = (l: string, b: string): boolean =>
          l === 'rgb(245, 245, 244)' && b === 'rgb(208, 208, 208)';
        const dim = (l: string, b: string): boolean =>
          l === 'rgb(168, 169, 168)' && b === 'rgb(168, 169, 168)';
        return want(editing, editingBody) && dim(idle, idleBody)
          ? null
          : `editing=[${editing} / ${editingBody}] idle=[${idle} / ${idleBody}]`;
      },
    },
    {
      name: 'a field full of newlines windows instead of pushing the frame apart',
      run() {
        // The reported bug: Ctrl+J thirty times grew the textarea to its
        // content, so the hint line and every row under it left the frame. The
        // CLI windows at about fourteen lines and prints
        // "↑ N more lines above" for the rest.
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        const cap = 14 * 15;                                  // FIELD_VIEWPORT_LINES

        field.value = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        const height = field.getBoundingClientRect().height;

        // …and scrolling to the bottom must report what is above.
        field.scrollTop = field.scrollHeight;
        field.dispatchEvent(new Event('scroll'));
        const group = field.closest('.np-field-group')!;
        const above = group.querySelector('.np-marker-row:not(.np-marker-hidden) .np-content');
        const text = above?.textContent ?? '(no marker shown)';
        controller.destroy();

        if (height > cap + 2) return `the field grew to ${Math.round(height)}px; the cap is ${cap}px`;
        return /^↑ \d+ more lines above$/.test(text)
          ? null : `expected an "N more lines above" marker, got: ${text}`;
      },
    },
    {
      name: 'a long prompt shows its marker on FIRST render, before any input',
      run() {
        // The case no interaction reaches. A prompt that is already long when
        // the surface opens windows immediately, and only the post-attach sizing
        // pass can put the marker up — the input and scroll listeners have not
        // fired yet and never will if the user just reads and presses Enter.
        const box = document.createElement('div');
        box.style.cssText = 'width:900px;height:600px;';
        document.getElementById('sweep-stage')!.appendChild(box);

        const long = { ...PE_FIXTURE, rows: PE_FIXTURE.rows.map((r) => (r.kind === 'field'
          ? { ...r, text: Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n') }
          : r)) };
        const frame = renderSurface(document, long, { focusIndex: 0 });
        box.appendChild(frame);
        growFields(frame);

        const marker = frame.querySelector('.np-marker-row:not(.np-marker-hidden) .np-content');
        const text = marker?.textContent ?? '(none)';
        box.remove();
        return /more lines (above|below)/.test(text)
          ? null : `no marker on first render, got: ${text}`;
      },
    },
    {
      name: 'a short field neither windows nor shows a marker',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'one line';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        const group = field.closest('.np-field-group')!;
        const shown = group.querySelector('.np-marker-row:not(.np-marker-hidden)');
        controller.destroy();
        return shown ? 'a marker appeared for text that fits' : null;
      },
    },
    {
      name: 'the editable prompt draws no focus ring',
      run() {
        // The CLI has no box around its editor; a browser outline reads as a
        // form control dropped into a terminal frame.
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.focus();
        // Every value read BEFORE destroy: a CSSStyleDeclaration from
        // getComputedStyle goes empty once its element leaves the document, and
        // reading through it afterwards reports '' for everything. The first
        // version of this scenario did exactly that and blamed the stylesheet.
        const style = getComputedStyle(field);
        const outlineStyle = style.outlineStyle;
        const outlineWidth = style.outlineWidth;
        const border = style.borderTopWidth;
        controller.destroy();
        // `outline: none` leaves outline-width at its initial `medium` (3px) —
        // that is the COMPUTED value; nothing is painted while the style is
        // none. So the style is what decides, not the width.
        return outlineStyle === 'none' && border === '0px'
          ? null : `outline-style=${outlineStyle} width=${outlineWidth} border=${border}`;
      },
    },
    {
      name: 'D5: Shorter opens the refinement view with the recomposed body',
      run() {
        const { host, controller } = mountD5('prompt_enhancement');
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');   // Shorter
        press(controller.element, 'Enter');
        const labels = [...host.querySelectorAll('.np-label')].map((el) => el.textContent);
        const r = eq([labels, host.querySelector('textarea')!.value],
          [['Use enhanced prompt', '\u2190 Go back'], PE_REFINED_TEXT], 'labels/body');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'D5: Go back restores the main view AND the edited body',
      run() {
        const { host, controller } = mountD5('prompt_enhancement');
        host.querySelector('textarea')!.value = 'edited before Shorter';
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');
        press(controller.element, 'Enter');       // -> refinement
        press(controller.element, 'ArrowDown');   // Go back
        press(controller.element, 'Enter');
        const labels = [...host.querySelectorAll('.np-label')].map((el) => el.textContent);
        const errors = [
          labels.includes('Shorter') ? null : 'did not return to the main view',
          host.querySelector('textarea')!.value === 'edited before Shorter'
            ? null : 'the edited body was not restored',
        ].filter(Boolean);
        controller.destroy();
        return errors.length ? errors.join('; ') : null;
      },
    },
    {
      name: 'D5: a blank body refuses the directional, silently (bug B)',
      run() {
        const { host, controller } = mountD5('prompt_enhancement');
        host.querySelector('textarea')!.value = '   ';
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');
        press(controller.element, 'Enter');
        const stayed = [...host.querySelectorAll('.np-label')]
          .map((el) => el.textContent).includes('Shorter');
        controller.destroy();
        return stayed ? null : 'the blank body was allowed to open a refinement';
      },
    },
    {
      name: 'D5: MPS-1 keeps its Sequence plan through the refinement',
      run() {
        const { host, controller } = mountD5('mps_first');
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');   // Shorter
        press(controller.element, 'Enter');
        const errors = [
          host.querySelector('textarea')!.value === MPS_REFINED_TEXT ? null : 'body not recomposed',
          (host.textContent ?? '').includes('Sequence plan') ? null : 'the Sequence plan vanished',
        ].filter(Boolean);
        controller.destroy();
        return errors.length ? errors.join('; ') : null;
      },
    },
  ];
}

function renderE2eReport(): void {
  installChromeStyles(document.head);
  const results = e2eScenarios().map((s) => {
    let failure: string | null;
    try { failure = s.run(); } catch (e) { failure = 'threw: ' + String(e); }
    return { name: s.name, failure };
  });
  const skipped = results.filter((r) => r.failure?.startsWith('skip: '));
  const failed = results.filter((r) => r.failure && !r.failure.startsWith('skip: '));
  const banner = document.getElementById('banner')!;
  const tail = skipped.length ? ` (${skipped.length} skipped)` : '';
  banner.textContent = failed.length === 0
    ? `E2E PASS - ${results.length - skipped.length}/${results.length - skipped.length} scenarios green${tail}`
    : `E2E FAIL - ${failed.length} of ${results.length} scenarios failed${tail}`;
  banner.className = failed.length === 0 ? 'pass' : 'fail';

  const detail = document.getElementById('failures')!;
  for (const r of results) {
    const row = document.createElement('div');
    const mark = !r.failure ? 'ok    ' : r.failure.startsWith('skip: ') ? 'SKIP  ' : 'FAIL  ';
    row.textContent = mark + r.name + (r.failure ? ' -> ' + r.failure : '');
    detail.appendChild(row);
  }
  // Names travel with the counts: a bare number tells you Gecko disagreed and
  // nothing about where, and Firefox has no --dump-dom to read the page with.
  report('E2E', results.length - failed.length - skipped.length, failed.length,
    [...failed, ...skipped].map((r) => r.name + ' -> ' + r.failure));
}

/**
 * Publish a verdict. The console line serves a Chrome `--dump-dom` run; the POST
 * serves every other engine, Firefox above all, which has no such flag.
 * Fire-and-forget: a harness opened from the filesystem has no server, and that
 * must not turn into an unhandled rejection on the page.
 */
function report(kind: string, pass: number, fail: number, failures: string[] = []): void {
  const payload = JSON.stringify({ kind, pass, fail, failures, ua: navigator.userAgent });
  console.log(kind + ' ' + payload);
  void fetch('/result', { method: 'POST', body: payload }).catch(() => undefined);
}

// -- boot --------------------------------------------------------------------

// Boot only on the harness page itself. The guard is what lets a test import
// `runSweep` without the module trying to mount into a page that is not there.
if (document.getElementById('bar') && document.getElementById('sweep-stage')) {
  const mode = new URLSearchParams(location.search);
  if (mode.get('sweep') === '1') renderSweepReport();
  else if (mode.get('e2e') === '1') renderE2eReport();
  else mountInteractive();
}
