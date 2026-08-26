// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHROME_STYLES,
  FRAME_HEADER_CLEARANCE_PX,
  FRAME_LINE_HEIGHT_PX,
  FRAME_SCROLL_MIN_HEIGHT_PX,
  buildBlankRow,
  buildBulletRow,
  buildFooterRow,
  buildFrame,
  buildHeader,
  buildHintRow,
  buildIndentedRow,
  buildPinchRow,
  buildTextRow,
  buildTightIndentRow,
  buildWordmarkHeader,
  escapeHtml,
  installChromeStyles,
  WORDMARK_RULE,
} from './chrome.js';
import { DOCK_COLLAPSED_WIDTH_PX } from './dock.js';

/** Return the declaration block for an exact CSS selector, as `panel.styles.test.ts` does. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = CHROME_STYLES.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`CSS rule not found for selector: ${selector}`);
  return m[1]!;
}

/**
 * The stylesheet with its comments removed.
 *
 * Every scan below has to run on this and not on the raw string. The comments
 * NAME the things they exist to forbid — one explains why `:has()` is banned,
 * another cites `panel.js` — so scanning the raw text reports the ban itself
 * as a violation and a filename as a class. That false positive has now been
 * hit three times in this layer, in three different guards.
 */
const CSS_ONLY = CHROME_STYLES.replace(/\/\*[\s\S]*?\*\//g, '');

describe('installChromeStyles', () => {
  it('injects the frame stylesheet the panel\'s way — a <style> node, no <link>', () => {
    const root = document.createElement('div');

    const style = installChromeStyles(root);

    expect(style.tagName).toBe('STYLE');
    expect(style.parentNode).toBe(root);
    expect(style.textContent).toBe(CHROME_STYLES);
    expect(root.querySelector('link')).toBeNull();
  });

  it('works inside a shadow root, which is where it actually lives', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });

    installChromeStyles(shadow);

    expect(shadow.querySelector('style')?.textContent).toBe(CHROME_STYLES);
  });

  it('returns the node so a caller can take it back out', () => {
    const root = document.createElement('div');

    installChromeStyles(root).remove();

    expect(root.querySelector('style')).toBeNull();
  });
});

describe('CHROME_STYLES — C-2 layout invariants', () => {
  // jsdom computes no flexbox layout, so these are asserted at source level for
  // exactly the reason `ui/panel.styles.test.ts` gives. The live proof is D7.

  it('the header may shrink and clip, so it can never eat the whole frame', () => {
    // The panel bug this prevents: a header pinned at `0 0 auto` squeezed the
    // options band to zero height, no option rendered, and a blind Enter jumped
    // straight to the send-confirm. Reproduced at viewport <= 230px.
    const body = ruleBody('.np-fixed-top');

    expect(body).toMatch(/flex:\s*0\s+1\s+auto/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow:\s*hidden/);
    expect(body).not.toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('the scroll band takes the slack and reserves room for at least one row', () => {
    const body = ruleBody('.np-scroll');

    expect(body).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(body).toMatch(/overflow-y:\s*auto/);
    const min = body.match(/min-height:\s*(\d+)px/);
    expect(min, '.np-scroll must declare a px min-height').not.toBeNull();
    expect(Number(min![1])).toBe(FRAME_SCROLL_MIN_HEIGHT_PX);
    expect(Number(min![1])).toBeGreaterThanOrEqual(30);   // the panel's own floor
    expect(body).not.toMatch(/min-height:\s*0\s*;/);
  });

  it('the footer never shrinks — it is how a user learns Esc exists', () => {
    expect(ruleBody('.np-footer')).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('content wraps rather than widening the frame', () => {
    // C-2's other half: a long unbroken token must not push the page into a
    // horizontal scroll.
    const body = ruleBody('.np-content');

    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(body).toMatch(/min-width:\s*0/);
  });

  it('the frame itself is a full-height flex column that clips its own overflow', () => {
    const body = ruleBody('.np-frame');

    expect(body).toMatch(/height:\s*100%/);
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-direction:\s*column/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });
});

describe('CHROME_STYLES — C-3 compatibility floor', () => {
  it('uses no CSS feature above the Firefox 112 floor', () => {
    // The same bar `panel.js` holds. `options.css` already ships a `:has()` that
    // silently does nothing on Firefox 112-120; this string must not repeat it.
    const banned = [':has(', 'clamp(', ':is(', ':where(', 'dvh', 'svh', '@layer', 'aspect-ratio', 'container-type', '@container'];

    for (const feature of banned) {
      expect(CSS_ONLY, feature).not.toContain(feature);
    }
  });

  it('styles scrollbars twice — once per browser\'s spelling', () => {
    const body = ruleBody('.np-scroll');

    // Firefox
    expect(body).toMatch(/scrollbar-width:\s*thin/);
    expect(body).toMatch(/scrollbar-color:/);
    // Chrome — each selector asserted on its own, because `::-webkit-scrollbar`
    // is a substring of the other two and one loose check would pass with the
    // track-width rule deleted.
    expect(CHROME_STYLES).toMatch(/\.np-scroll::-webkit-scrollbar\s*\{/);
    expect(CHROME_STYLES).toMatch(/\.np-scroll::-webkit-scrollbar-thumb\s*\{/);
    expect(CHROME_STYLES).toMatch(/\.np-scroll::-webkit-scrollbar-track\s*\{/);
  });
});

describe('CHROME_STYLES — authoring standard (C-1)', () => {
  it('prefixes every class with np-', () => {
    const classes = [...CSS_ONLY.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]!);

    expect(classes.length).toBeGreaterThan(0);
    for (const name of classes) {
      expect(name, name).toMatch(/^np-/);
    }
  });

  it('uses literal values, never CSS variables — the panel declares zero', () => {
    expect(CHROME_STYLES).not.toContain('var(--');
    expect(CHROME_STYLES).not.toMatch(/^\s*--[\w-]+\s*:/m);
  });
});

describe('CHROME_STYLES — the SGR mapping (D2.2)', () => {
  const GROUND = '#310823';

  function contrast(hex: string, against: string): number {
    const lum = (h: string): number => {
      const ch = [1, 3, 5]
        .map((i) => parseInt(h.substr(i, 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
    };
    const a = lum(hex);
    const b = lum(against);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /** The colour a rule sets, e.g. `.np-why` -> `#9ba7a7`. */
  function colourOf(selector: string): string {
    const m = ruleBody(selector).match(/color:\s*(#[0-9a-f]{6})/i);
    if (!m) throw new Error(`no colour on ${selector}`);
    return m[1]!;
  }

  it('paints the frame on the ground the contrast figures assume', () => {
    expect(ruleBody('.np-frame')).toContain(`background: ${GROUND}`);
  });

  it('every text tone clears AA on that ground', () => {
    const tones = ['.np-header', '.np-rule', '.np-why', '.np-caution', '.np-hint', '.np-cancel', '.np-dim', '.np-label', '.np-desc'];

    for (const sel of tones) {
      expect(contrast(colourOf(sel), GROUND), `${sel} ${colourOf(sel)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the rail clears the 3:1 that WCAG asks of a graphical object', () => {
    // The panel's darker rail (#2a667b) is 2.76:1 and would fail here — which is
    // why this frame uses the CLI's own cyan instead.
    const rail = ruleBody('.np-row').match(/border-left:[^;]*?(#[0-9a-f]{6})/i);

    expect(rail, '.np-row must draw the rail').not.toBeNull();
    expect(contrast(rail![1]!, GROUND)).toBeGreaterThanOrEqual(3);
    expect(rail![1]!.toLowerCase()).toBe(colourOf('.np-header').toLowerCase());  // same tone as the header, as in the CLI
  });

  it('keeps the four-tier focus fade strictly descending', () => {
    // focused label -> focused desc -> unfocused label -> unfocused desc.
    const tiers = [
      contrast(ruleBody('.np-focused .np-label').match(/color:\s*(#[0-9a-f]{6})/i)![1]!, GROUND),
      contrast(ruleBody('.np-focused .np-desc').match(/color:\s*(#[0-9a-f]{6})/i)![1]!, GROUND),
      contrast(colourOf('.np-label'), GROUND),
      contrast(colourOf('.np-desc'), GROUND),
    ];

    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!, `tier ${i} must be dimmer than tier ${i - 1}`).toBeLessThan(tiers[i - 1]!);
    }
  });

  it('gives the CLI\'s single gray exactly one value', () => {
    // panel.js renders it as two hexes; that is a panel inconsistency, and
    // reproducing it would make the documented mapping a lie.
    expect(colourOf('.np-why')).toBe(colourOf('.np-desc'));
    expect(colourOf('.np-bullet')).toBe(colourOf('.np-why'));
  });

  it('uses the dim tier for the footer, not an invented darker one', () => {
    expect(colourOf('.np-dim')).toBe(colourOf('.np-label'));
  });

  it('renders the pinch label bold with no colour, as the CLI emits it', () => {
    const body = ruleBody('.np-pinch');

    expect(body).toMatch(/font-weight:\s*700/);
    expect(body).not.toMatch(/color:/);
  });

  it('resolves dim to a colour rather than opacity', () => {
    // Opacity compounds, and it would fade a row's bullet along with its text —
    // which is exactly the focused/unfocused distinction the bullet carries.
    expect(ruleBody('.np-dim')).not.toContain('opacity');
    expect(ruleBody('.np-dim')).toMatch(/color:\s*#/);
  });

  it('renders hints in the CLI\'s bright yellow, not the panel\'s dim italic', () => {
    const body = ruleBody('.np-hint');

    expect(body).toMatch(/color:\s*#/);
    expect(body).not.toContain('font-style');
  });
});

describe('frame primitives (D2.3)', () => {
  const doc = document;

  it('buildFrame lays out header, scroll band and footer in that order', () => {
    const { frame, fixedTop, scroll, footer } = buildFrame(doc);

    expect(frame.className).toBe('np-frame');
    expect([...frame.children]).toEqual([fixedTop, scroll, footer]);
    expect(fixedTop.className).toBe('np-fixed-top');
    expect(scroll.className).toBe('np-scroll');
    expect(footer.className).toBe('np-footer');
  });

  it('buildHeader writes the CLI header and a rule of exactly its width', () => {
    const [header, rule] = buildHeader(doc, 'Prompt enhancement');

    expect(header!.textContent).toBe('◆ NEXPATH CLI · Prompt enhancement');
    expect(rule!.textContent).toBe('─'.repeat(header!.textContent!.length));
    expect(header!.querySelector('.np-header')).not.toBeNull();
    expect(rule!.querySelector('.np-rule')).not.toBeNull();
  });

  it('every row carries the rail', () => {
    const rows = [
      ...buildHeader(doc, 'X'),
      buildBlankRow(doc),
      buildTextRow(doc, 'text'),
      buildBulletRow(doc, 'label', false),
      buildIndentedRow(doc, 'body'),
      buildHintRow(doc, 'hint'),
      buildFooterRow(doc, 'footer'),
    ];

    for (const r of rows) expect(r.classList.contains('np-row'), r.outerHTML).toBe(true);
  });

  it('a blank row is the rail alone, and still one line tall', () => {
    const blank = buildBlankRow(doc);

    expect(blank.textContent).toBe('');
    expect(ruleBody('.np-row')).toContain(`min-height: ${FRAME_LINE_HEIGHT_PX}px`);
  });

  it('buildTextRow applies the tone that was asked for', () => {
    expect(buildTextRow(doc, 'a', 'why').querySelector('.np-why')).not.toBeNull();
    expect(buildTextRow(doc, 'a', 'caution').querySelector('.np-caution')).not.toBeNull();
    expect(buildTextRow(doc, 'a', 'cancel').querySelector('.np-cancel')).not.toBeNull();
    expect(buildTextRow(doc, 'a', 'pinch').querySelector('.np-pinch')).not.toBeNull();
    // plain carries no tone class beyond np-content
    expect(buildTextRow(doc, 'a').querySelector('.np-content')!.className).toBe('np-content');
  });

  it('buildBulletRow marks focus with both the glyph and the class', () => {
    const on = buildBulletRow(doc, 'Use enhanced prompt', true);
    const off = buildBulletRow(doc, 'Use original prompt', false);

    expect(on.querySelector('.np-bullet')!.textContent).toBe('●');
    expect(on.classList.contains('np-focused')).toBe(true);
    expect(on.querySelector('.np-label')!.textContent).toBe('Use enhanced prompt');

    expect(off.querySelector('.np-bullet')!.textContent).toBe('○');
    expect(off.classList.contains('np-focused')).toBe(false);
  });

  it('indented rows sit at the CLI\'s 4-column indent and take the focused tier', () => {
    expect(ruleBody('.np-ind-4')).toContain('padding-left: 4ch');
    expect(buildIndentedRow(doc, 'body').classList.contains('np-focused')).toBe(false);
    expect(buildIndentedRow(doc, 'body', true).classList.contains('np-focused')).toBe(true);
  });

  it('hint and footer rows carry their own tones', () => {
    expect(buildHintRow(doc, 'Ctrl+J new line').querySelector('.np-hint')).not.toBeNull();
    expect(buildHintRow(doc, 'x').querySelector('.np-ind-4')).not.toBeNull();
    expect(buildFooterRow(doc, '↑↓ move · Esc cancel').querySelector('.np-dim')).not.toBeNull();
  });
});

describe('chrome variant B (D2.4)', () => {
  const doc = document;

  it('writes the wordmark the CLI writes — two spaces, and no surface name', () => {
    const [wordmark] = buildWordmarkHeader(doc);

    expect(wordmark!.textContent).toBe('▲  NEXPATH CLI');
    expect(wordmark!.querySelector('.np-wordmark-tri')!.textContent).toBe('▲');
  });

  it('rules a fixed 24 characters, not the wordmark\'s width', () => {
    // The CLI hard-codes this; the rule is visibly wider than the wordmark above
    // it, and deriving the width would quietly "fix" that.
    const [wordmark, rule] = buildWordmarkHeader(doc);

    expect(WORDMARK_RULE).toBe('─'.repeat(24));
    expect(rule!.textContent).toBe(WORDMARK_RULE);
    expect(rule!.textContent!.length).not.toBe(wordmark!.textContent!.length);
  });

  it('gives the header three rows, none of them railed', () => {
    // NEXPATH_HEADER_LINES is 3: wordmark, rule, blank. The CLI suppresses the
    // rail here because it would collide with the header's own glyphs.
    const rows = buildWordmarkHeader(doc);

    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.classList.contains('np-row-bare'), r.outerHTML).toBe(true);
    expect(rows[2]!.textContent).toBe('');
    expect(ruleBody('.np-row-bare')).toContain('border-left-color: transparent');
  });

  it('marks the first pinch row with the corner, in place of the rail', () => {
    const first = buildPinchRow(doc, 'Before coding.');

    expect(first.querySelector('.np-marker')!.textContent).toBe('◆');
    expect(first.querySelector('.np-pinch')!.textContent).toBe('Before coding.');
    expect(first.classList.contains('np-row-bare')).toBe(true);
  });

  it('lets a following subtitle row fall back to the rail', () => {
    // The CLI hands the corner to the FIRST pinch emission only.
    const subtitle = buildPinchRow(doc, '— lighter options', true);

    expect(subtitle.querySelector('.np-marker')).toBeNull();
    expect(subtitle.classList.contains('np-row-bare')).toBe(false);
    expect(subtitle.querySelector('.np-pinch')!.textContent).toBe('— lighter options');
  });

  it('indents variant B descriptions by three columns, not variant A\'s four', () => {
    expect(ruleBody('.np-ind-3')).toContain('padding-left: 3ch');
    expect(ruleBody('.np-ind-4')).toContain('padding-left: 4ch');

    const desc = buildTightIndentRow(doc, 'body');
    expect(desc.querySelector('.np-ind-3')).not.toBeNull();
    expect(buildTightIndentRow(doc, 'body', true).classList.contains('np-focused')).toBe(true);
  });

  it('shares variant A\'s tones — only the header, marker and indent differ', () => {
    // The rail, bullets, hints and footer are the same chrome in both variants.
    const marker = ruleBody('.np-marker').match(/color:\s*(#[0-9a-f]{6})/i)![1]!;
    const header = ruleBody('.np-header').match(/color:\s*(#[0-9a-f]{6})/i)![1]!;

    expect(marker.toLowerCase()).toBe(header.toLowerCase());   // both the CLI's cyan
  });

  it('escapes the pinch text like every other builder', () => {
    const row = buildPinchRow(document, '<script>bad()</script>');

    expect(row.querySelector('script')).toBeNull();
    expect(row.textContent).toContain('<script>bad()</script>');
  });
});

describe('escapeHtml — every builder runs text through it', () => {
  it('escapes the three characters the panel escapes', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('a surface label cannot inject markup through the header', () => {
    const [header] = buildHeader(document, '<img src=x onerror=alert(1)>');

    expect(header!.querySelector('img')).toBeNull();
    expect(header!.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('no builder lets content become markup', () => {
    const payload = '<script>bad()</script>';
    const rows = [
      buildTextRow(document, payload),
      buildBulletRow(document, payload, true),
      buildIndentedRow(document, payload),
      buildHintRow(document, payload),
      buildFooterRow(document, payload),
    ];

    for (const r of rows) {
      // `script` and the LIVE payload both: a script inserted via innerHTML is
      // inert by spec, so it only proves the markup was neutralised. An
      // `img onerror` is the one that would actually run.
      expect(r.querySelector('script, img, iframe, svg'), r.outerHTML).toBeNull();
      expect(r.textContent).toContain(payload);
    }
  });
});

describe('CHROME_STYLES — header clearance for the dock buttons', () => {
  it('keeps the header text out from under the collapse and close buttons', () => {
    // D2 inherits exactly one requirement from D1.3/D1.4: the dock's two buttons
    // sit in the frame's top-right corner, and header text must not run beneath
    // them.
    expect(ruleBody('.np-fixed-top')).toContain(`padding-right: ${FRAME_HEADER_CLEARANCE_PX}px`);
  });

  it('derives that clearance from the dock, so the two cannot drift apart', () => {
    // A value check alone cannot see the difference — `48` and
    // `DOCK_COLLAPSED_WIDTH_PX * 2` are the same number today, and the literal
    // would quietly survive someone widening the dock buttons. So assert the
    // expression, reading the source the way `panel.styles.test.ts` does.
    // Resolved from the vitest root, not `import.meta.url`: this file runs in the
    // jsdom environment, where `import.meta.url` is not a file: URL.
    const src = readFileSync(resolve(process.cwd(), 'src/ext-browser/ui/surfaces/chrome.ts'), 'utf8');
    const decl = src.match(/FRAME_HEADER_CLEARANCE_PX\s*=\s*([^;]+);/);

    expect(decl, 'FRAME_HEADER_CLEARANCE_PX must be declared').not.toBeNull();
    expect(decl![1]).toContain('DOCK_COLLAPSED_WIDTH_PX');
    expect(FRAME_HEADER_CLEARANCE_PX).toBe(DOCK_COLLAPSED_WIDTH_PX * 2);
  });
});
