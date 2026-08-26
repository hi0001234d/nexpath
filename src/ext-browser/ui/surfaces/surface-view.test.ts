// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { autoGrow, growFields, renderSurface } from './surface-view.js';
import { PE_FIXTURE, PE_FOOTER, DETAILS_HINT, EDIT_KEYS_HINT, BODY_HINT } from './fixtures/pe.js';
import { MPS_FIRST_FIXTURE, MPS_CONTINUATION_FIXTURE } from './fixtures/mps.js';
import { PEF_FIXTURE } from './fixtures/pef.js';
import type { SurfaceModel } from './surface-model.js';

/** Cells joined with a space — the gap between bullet and label is a column, not a character. */
function rowText(row: Element): string {
  return [...row.children].map((cell) => cell.textContent ?? '').join(' ').trim();
}

describe('PE surface — structure', () => {
  it('orders the rows as the CLI does', () => {
    const labels = [...renderSurface(document, PE_FIXTURE, { focusIndex: 0 }).querySelectorAll('.np-label')]
      .map((el) => el.textContent);

    // The refinement rows sit between the details field and the last option —
    // they are part of this surface, not a variant of it. The CLI renders none
    // of them today (its loop is UI-off), which parity.test.ts reconciles.
    expect(labels).toEqual([
      'Use enhanced prompt',
      'Additional details',
      'Shorter',
      'More thorough',
      'More project-grounded',
      'Use original prompt',
    ]);
  });

  it('puts the header block above the scroll band and the footer below it', () => {
    const frame = renderSurface(document, PE_FIXTURE, { focusIndex: 0 });

    expect(frame.querySelector('.np-fixed-top')!.textContent).toContain('◆ NEXPATH CLI · Prompt enhancement');
    expect(frame.querySelector('.np-scroll')!.textContent).toContain('Use enhanced prompt');
    expect(frame.querySelector('.np-footer')!.textContent).toContain(PE_FOOTER);
  });

  it('marks exactly one row focused, whichever it is', () => {
    for (const focusIndex of [0, 1, 2]) {
      const frame = renderSurface(document, PE_FIXTURE, { focusIndex });
      const focused = frame.querySelectorAll('.np-row.np-focused');

      expect(focused, `focus ${focusIndex}`).toHaveLength(1);
      expect(focused[0]!.querySelector('.np-bullet')!.textContent).toBe('●');
    }
  });

  it('renders editable fields as textareas carrying their text', () => {
    const fields = [...renderSurface(document, PE_FIXTURE, { focusIndex: 0 }).querySelectorAll('textarea')];

    expect(fields).toHaveLength(2);                       // body and details; not the action row
    expect(fields[0]!.value).toContain('Add a Stripe webhook handler');
    expect(fields[1]!.value).toBe('Keep the existing retry helper — do not rewrite it.');
  });

  it('action rows have no field — only the two editable rows do', () => {
    const frame = renderSurface(document, PE_FIXTURE, { focusIndex: 2 });
    const labels = [...frame.querySelectorAll('.np-label')].map((el) => el.textContent);

    expect(labels.at(-1)).toBe('Use original prompt');
    // Two textareas for six rows: the body and the details. The four action
    // rows — three refinements and the last option — carry none.
    expect(frame.querySelectorAll('textarea')).toHaveLength(2);
  });
});

describe('a field, its label and its hints share one group', () => {
  // `:focus-within` is what decides whether a block reads as being edited, and
  // it needs a common ancestor. The label and the textarea are separate rows,
  // so the renderer wraps them — flatten the wrapper and the editing state
  // silently stops working, with every other test still green.
  it('wraps the label, the editor and the hints together', () => {
    const frame = renderSurface(document, PE_FIXTURE, { focusIndex: 0 });
    const groups = [...frame.querySelectorAll('.np-field-group')];

    expect(groups).toHaveLength(2);                       // body and details
    for (const group of groups) {
      expect(group.querySelector('.np-label'), 'the label must be inside').not.toBeNull();
      expect(group.querySelector('textarea'), 'the editor must be inside').not.toBeNull();
    }
    // The focused body's hint travels with it, not with the scroll band.
    expect(groups[0]!.querySelector('.np-hint')).not.toBeNull();
  });

  it('leaves action rows ungrouped — they have nothing to focus within', () => {
    const frame = renderSurface(document, PE_FIXTURE, { focusIndex: 0 });
    const original = [...frame.querySelectorAll('.np-label')]
      .find((el) => el.textContent === 'Use original prompt')!;

    expect(original.closest('.np-field-group')).toBeNull();
  });
});

describe('PE surface — hints follow focus (D3.4)', () => {
  function hints(focusIndex: number): string[] {
    return [...renderSurface(document, PE_FIXTURE, { focusIndex }).querySelectorAll('.np-hint')]
      .map((el) => el.textContent ?? '');
  }

  it('shows the send hint only while the body is focused', () => {
    // Off-focus it would be a lie: Enter acts on whichever row IS focused.
    expect(hints(0)).toContain(`${EDIT_KEYS_HINT} · ${BODY_HINT}`);
    expect(hints(1).some((h) => h.includes(BODY_HINT))).toBe(false);
    expect(hints(2).some((h) => h.includes(BODY_HINT))).toBe(false);
  });

  it('shows the details hint always, and adds the edit keys when details is focused', () => {
    expect(hints(0)).toContain(DETAILS_HINT);
    expect(hints(2)).toContain(DETAILS_HINT);

    expect(hints(1)).toEqual([DETAILS_HINT, EDIT_KEYS_HINT]);   // order matters
  });
});

describe('every surface honours the frame regions (D7.5)', () => {
  // The C-2 invariants live on the REGIONS (chrome.test.ts pins the CSS); this
  // pins that each surface actually puts its content in them — a surface that
  // rendered its rows into the fixed header would starve the scroll band and
  // resurrect the panel's blank-options bug with the invariants still "passing".
  it.each([
    ['PE', PE_FIXTURE],
    ['MPS-1', MPS_FIRST_FIXTURE],
    ['MPS-2', MPS_CONTINUATION_FIXTURE],
    ['PEF', PEF_FIXTURE],
  ])('%s: header in np-fixed-top, rows in np-scroll, footer in np-footer', (_n, fixture) => {
    const frame = renderSurface(document, fixture, { focusIndex: 0 });

    expect(frame.querySelector('.np-fixed-top .np-header')).not.toBeNull();
    expect(frame.querySelectorAll('.np-scroll .np-bullet').length).toBeGreaterThan(0);
    expect(frame.querySelector('.np-footer .np-dim')?.textContent).toBe(fixture.footer);
    // Rows never leak into the fixed header — that is how the band starves.
    expect(frame.querySelectorAll('.np-fixed-top .np-bullet')).toHaveLength(0);
  });
});

describe('what the parity test cannot see', () => {
  // Parity compares CONTENT: both sides are trimmed, because the rail is a
  // border here and the indents are padding, and it reads text, which carries no
  // colour. So indent columns and tones need asserting directly — mutation
  // testing found all three of these surviving the parity suite untouched.

  function classesOn(model: SurfaceModel, selector: string): string[] {
    return [...renderSurface(document, model, { focusIndex: 0 }).querySelectorAll(selector)]
      .flatMap((el) => [...el.classList]);
  }

  it('indents each surface\'s hints to the column the CLI uses', () => {
    // PE puts hints at four; MPS and PEF at six.
    expect(classesOn(PE_FIXTURE, '.np-hint')).toContain('np-ind-4');
    expect(classesOn(MPS_FIRST_FIXTURE, '.np-hint')).toContain('np-ind-6');
    expect(classesOn(MPS_CONTINUATION_FIXTURE, '.np-hint')).toContain('np-ind-6');
    expect(classesOn(PEF_FIXTURE, '.np-hint')).not.toContain('np-ind-4');
  });

  it('indents each surface\'s field content to the column the CLI uses', () => {
    // PE and MPS keep content at four; PEF puts it at six.
    expect(classesOn(PE_FIXTURE, 'textarea')).toContain('np-ind-4');
    expect(classesOn(MPS_FIRST_FIXTURE, 'textarea')).toContain('np-ind-4');
    expect(classesOn(PEF_FIXTURE, 'textarea')).toContain('np-ind-6');
  });

  it('renders the interruption helper dim, as the CLI does', () => {
    // "label, then dim helper" — the CLI's own comment (`cli-mps-popup.ts:398`).
    // Tone is invisible to parity; this drifted to plain and nothing failed.
    const frame = renderSurface(document, MPS_CONTINUATION_FIXTURE, { focusIndex: 0 });
    const helper = [...frame.querySelectorAll('.np-content')]
      .find((el) => el.textContent?.startsWith('Write directly in the coding agent'));

    expect(helper, 'the helper line must render').toBeDefined();
    expect(helper!.classList.contains('np-dim')).toBe(true);
  });

  it('pins one placeholder colour for both browsers', () => {
    // Chrome and Firefox default ::placeholder differently; C-3 wants one look.
    const src = readFileSync(resolve(process.cwd(), 'src/ext-browser/ui/surfaces/chrome.ts'), 'utf8');

    expect(src).toMatch(/\.np-field::placeholder \{ color: #9ba7a7; opacity: 1; \}/);
  });

  it('tints the Cancel row, and nothing else', () => {
    // The one label the CLI colours — paleYellow, so ending a sequence does not
    // look like every other option.
    const mps = renderSurface(document, MPS_FIRST_FIXTURE, { focusIndex: 0 });
    const cancel = [...mps.querySelectorAll('.np-label')].find((el) => el.textContent?.startsWith('Cancel'));

    expect(cancel!.classList.contains('np-cancel')).toBe(true);
    expect(mps.querySelectorAll('.np-cancel')).toHaveLength(1);
    expect(renderSurface(document, PE_FIXTURE, { focusIndex: 0 }).querySelector('.np-cancel')).toBeNull();
  });
});

describe('no class escapes the stylesheet', () => {
  it('every np- class any surface file writes is styled in CHROME_STYLES', () => {
    // The guard for a whole class of bug that jsdom cannot see: a class applied
    // in TS but never given a rule renders as the browser's default. It caught
    // `np-field`, where an unstyled textarea would have arrived with its own
    // font, a white ground, a border and a resize grip inside a CLI frame.
    const read = (rel: string): string => readFileSync(resolve(process.cwd(), `src/ext-browser/ui/surfaces/${rel}`), 'utf8');
    const chrome = read('chrome.ts');
    // Two stylesheets style this layer: the frame's CHROME_STYLES and the
    // dock's own DOCK_CHROME_STYLES. A class is satisfied by a rule in either.
    const styleBlock = (src: string, marker: string): string => {
      const from = src.indexOf(marker);
      return src.slice(from, src.indexOf('\n`;', from));
    };
    const sheets = styleBlock(chrome, 'export const CHROME_STYLES = `')
      + styleBlock(read('dock.ts'), 'const DOCK_CHROME_STYLES = `');
    const styled = new Set([...sheets.matchAll(/\.(np-[\w-]+)/g)].map((m) => m[1]!));

    const used = new Set<string>();
    // Comment lines are dropped before scanning: prose like dock.ts's mention of
    // "the panel's .np-hidden" names classes this layer never applies.
    const withoutComments = (src: string): string =>
      src.split('\n').filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*')).join('\n');
    // EVERY non-test module in the layer is globbed, not listed. A hard-coded
    // list already went stale twice — first missing the fixtures, then missing
    // refinement.ts — and a file that escapes this guard can apply a class no
    // rule styles, which jsdom cannot see. chrome.ts contributes only its
    // builder half, since its class names also appear inside the stylesheet.
    const surfacesDir = resolve(process.cwd(), 'src/ext-browser/ui/surfaces');
    const moduleFiles = [
      ...readdirSync(surfacesDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'chrome.ts'),
      ...readdirSync(resolve(surfacesDir, 'fixtures')).filter((f) => f.endsWith('.ts')).map((f) => `fixtures/${f}`),
    ];
    const sources = [chrome.slice(chrome.indexOf('// ── D2.3')), ...moduleFiles.map((f) => read(f))];
    for (const src of sources) {
      for (const m of withoutComments(src).matchAll(/np-[\w-]+/g)) used.add(m[0]);
    }

    // A name ending in `-` came from a template like `np-ind-${indent}`: the
    // class is completed at runtime, so it is satisfied by any rule sharing the
    // prefix. Anything else has to match a rule exactly.
    const unstyled = [...used].filter((name) => (name.endsWith('-')
      ? ![...styled].some((rule) => rule.startsWith(name))
      : !styled.has(name)));

    expect(unstyled).toEqual([]);
  });
});

describe('auto-grow (D3.3)', () => {
  it('resets the height before measuring, or the field only ever ratchets up', () => {
    // Asserted against the source, not the behaviour: jsdom reports scrollHeight
    // as 0, so nothing here can observe a field growing. Without the reset,
    // scrollHeight includes the slack of an already-tall box and the height can
    // never come back down when content shrinks. The live proof is D7's sweep;
    // this stops the line being deleted before then.
    // Comments are stripped first. Without that this reads prose: the guard's
    // own comment explains scrollHeight, which put the word before the code
    // reached `'auto'` and failed a check about ordering in the CODE.
    const src = readFileSync(resolve(process.cwd(), 'src/ext-browser/ui/surfaces/surface-view.ts'), 'utf8');
    const whole = src.slice(src.indexOf('export function autoGrow'), src.indexOf('export function growFields'));
    const body = whole.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

    expect(body).toMatch(/height\s*=\s*'auto'/);
    expect(body.indexOf("'auto'")).toBeLessThan(body.indexOf('scrollHeight'));
  });

  it('grows the field on input, once the frame is in the document', () => {
    // Attached on purpose: a detached field is exactly what autoGrow now
    // refuses to size, and rendering into nowhere was how the prompt came out
    // invisible in the first place.
    const frame = renderSurface(document, PE_FIXTURE, { focusIndex: 0 });
    document.body.appendChild(frame);
    const field = frame.querySelector('textarea')!;
    let grew = 0;
    Object.defineProperty(field, 'scrollHeight', { get: () => ++grew * 10 });

    field.dispatchEvent(new Event('input'));

    expect(grew).toBeGreaterThan(0);
    frame.remove();
  });
});

describe('auto-grow measures only what it can measure', () => {
  // The bug this pins made the prompt INVISIBLE in a real browser while every
  // test passed: the renderer builds the frame detached, `scrollHeight` is 0 on
  // anything not in the document, and the old code wrote that 0 back as the
  // height. jsdom reports 0 either way, so no jsdom test could tell the two
  // apart — these assert the contract instead.

  it('refuses to size a detached field, rather than writing a measurement it never took', () => {
    const field = document.createElement('textarea');
    field.value = ['several', 'lines', 'of', 'text'].join('\n');
    field.style.height = '99px';

    autoGrow(field);                          // never attached

    expect(field.style.height, 'a detached field must be left alone').toBe('99px');
  });

  it('sizes a field once it is in the document', () => {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    Object.defineProperty(field, 'scrollHeight', { value: 120, configurable: true });

    autoGrow(field);

    expect(field.style.height).toBe('120px');
    field.remove();
  });

  it('growFields reaches every field under a root', () => {
    const root = renderSurface(document, PE_FIXTURE, { focusIndex: 0 });
    document.body.appendChild(root);
    for (const f of root.querySelectorAll('textarea')) {
      Object.defineProperty(f, 'scrollHeight', { value: 77, configurable: true });
    }

    growFields(root);

    expect([...root.querySelectorAll('textarea')].map((f) => f.style.height)).toEqual(['77px', '77px']);
    root.remove();
  });

  it('the second pass only grows — resetting to auto would oscillate', () => {
    // Growing a field can make a scrollbar appear, which narrows it and rewraps
    // the text taller. A second `auto` reset would undo the overflow, remove the
    // scrollbar, and measure the old height again, forever. Asserted at source:
    // jsdom has no scrollbars to reproduce it with.
    const src = readFileSync(resolve(process.cwd(), 'src/ext-browser/ui/surfaces/surface-view.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function growFields'));
    const secondPass = body.slice(body.indexOf('for (const field of fields) {'));

    expect(secondPass).toContain('scrollHeight > field.clientHeight');
    expect(secondPass).not.toContain("'auto'");
  });
});

describe('renderSurface — the model drives everything', () => {
  const bare: SurfaceModel = {
    id: 'prompt_enhancement',
    label: 'Bare',
    rows: [{ kind: 'action', label: 'Only row' }],
    footer: 'footer',
  };

  it('omits the pinch, cues and why-help when the model has none', () => {
    const frame = renderSurface(document, bare, { focusIndex: 0 });

    expect(frame.querySelector('.np-pinch')).toBeNull();
    expect(frame.querySelector('.np-why')).toBeNull();
    expect(frame.querySelector('.np-caution')).toBeNull();
  });

  it('renders a provider-failure notice in the caution tone, only when present', () => {
    expect(renderSurface(document, bare, { focusIndex: 0 }).querySelector('.np-caution')).toBeNull();

    const failing = { ...bare, providerFailure: 'AI wording was unavailable (provider issue).' };
    expect(renderSurface(document, failing, { focusIndex: 0 }).querySelector('.np-caution')!.textContent)
      .toBe('AI wording was unavailable (provider issue).');
  });

  it('splits a multi-line why-help into one row per line, as the CLI does', () => {
    const multi = { ...bare, whyHelp: 'first line\nsecond line\nthird line' };

    const why = [...renderSurface(document, multi, { focusIndex: 0 }).querySelectorAll('.np-why')]
      .map((el) => el.textContent);

    expect(why).toEqual(['first line', 'second line', 'third line']);
  });

  it('opens a block with a blank row when the model asks for one', () => {
    // Descendants, not direct children: a field's label, editor and hints sit
    // inside an np-field-group so CSS can test `:focus-within`, and the line
    // sequence is the `.np-row` order regardless of that nesting — which is
    // exactly how the parity extraction reads a frame too.
    const rows = renderSurface(document, PE_FIXTURE, { focusIndex: 0 })
      .querySelector('.np-scroll')!.querySelectorAll('.np-row');
    const texts = [...rows].map((r) => rowText(r).trim());

    // The blank sits immediately before Additional details.
    const at = texts.indexOf('○ Additional details');
    expect(at, 'the details row must be found').toBeGreaterThan(0);
    expect(texts[at - 1]).toBe('');
  });
});

describe('clampScrollToCaret — the pure window-sync math (CLI keepCursorVisible parity)', () => {
  it('caret above the window scrolls up to it', async () => {
    const { clampScrollToCaret } = await import('./surface-view.js');
    expect(clampScrollToCaret(30, 15, 90, 210)).toBe(30);
  });
  it('caret below the window scrolls down just enough', async () => {
    const { clampScrollToCaret } = await import('./surface-view.js');
    expect(clampScrollToCaret(400, 15, 90, 210)).toBe(400 + 15 - 210);
  });
  it('caret inside the window leaves the scroll alone', async () => {
    const { clampScrollToCaret } = await import('./surface-view.js');
    expect(clampScrollToCaret(150, 15, 90, 210)).toBe(90);
  });
  it('never scrolls negative', async () => {
    const { clampScrollToCaret } = await import('./surface-view.js');
    expect(clampScrollToCaret(0, 15, 0, 5)).toBe(10 >= 0 ? Math.max(0, 0 + 15 - 5) : 0);
    expect(clampScrollToCaret(0, 15, 0, 5)).toBeGreaterThanOrEqual(0);
  });
});

describe('field window policy — the CLI sizing rules (cli-submit-popup.ts:1335,:1354-1365)', () => {
  it('a maxLines field gets its fixed line cap in pass zero (details = 5 rows)', async () => {
    const { growFields } = await import('./surface-view.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const field = document.createElement('textarea');
    field.dataset['maxLines'] = '5';
    host.appendChild(field);
    growFields(host);
    expect(field.style.maxHeight).toBe('75px'); // 5 × 15px
    host.remove();
  });

  it('an unwindowed field fills the band adaptively, floored at 4 rows', async () => {
    const { growFields } = await import('./surface-view.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const band = document.createElement('div');
    band.className = 'np-scroll';
    const field = document.createElement('textarea');
    band.appendChild(field);
    host.appendChild(band);
    Object.defineProperty(band, 'clientHeight', { value: 300 });
    Object.defineProperty(band, 'scrollHeight', { value: 400 });
    Object.defineProperty(field, 'offsetHeight', { value: 200 });
    growFields(host);
    // chrome = 400-200 = 200; available = max(60, 300-200) = 100
    expect(field.style.maxHeight).toBe('100px');
    host.remove();
  });

  it('the adaptive floor is the CLI 4-row minimum when the chrome eats the band', async () => {
    const { growFields } = await import('./surface-view.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const band = document.createElement('div');
    band.className = 'np-scroll';
    const field = document.createElement('textarea');
    band.appendChild(field);
    host.appendChild(band);
    Object.defineProperty(band, 'clientHeight', { value: 100 });
    Object.defineProperty(band, 'scrollHeight', { value: 500 });
    Object.defineProperty(field, 'offsetHeight', { value: 50 });
    growFields(host);
    expect(field.style.maxHeight).toBe('60px'); // max(60, 100-450) — the floor
    host.remove();
  });
});
