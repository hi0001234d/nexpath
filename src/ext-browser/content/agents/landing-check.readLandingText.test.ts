// @vitest-environment jsdom
/**
 * `readLandingText` — the composer read a landing check has to use.
 *
 * These tests pin the defect the reader exists for: on every composer this kit
 * targets, a MULTI-LINE prompt is rendered as separate BLOCK elements, and
 * `textContent` concatenates those blocks with no separator at all. The text
 * being looked for has had its newlines normalised to spaces, so the two can
 * never match — at any prompt length.
 *
 * The strings below are not invented: they are the shapes measured live on
 * Bolt's real ProseMirror composer in Chrome on 2026-08-27, where `textContent`
 * failed at 300 / 2,500 / 8,000 / 20,000 and 50,000 characters while the text
 * sat perfectly in the composer, and `innerText` matched at every one.
 */
import { describe, expect, it } from 'vitest';
import { hasTextLanded, readLandingText } from './landing-check.js';

/** A ProseMirror/CodeMirror-shaped composer: one block element per line. */
function blockComposer(lines: readonly string[]): HTMLElement {
  const el = document.createElement('div');
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line;
    el.appendChild(p);
  }
  return el;
}

/**
 * jsdom does not implement `innerText`, so a real browser's value is supplied
 * explicitly. A browser joins block children with newlines — that is the whole
 * difference this reader depends on.
 */
function withInnerText(el: HTMLElement, value: string): HTMLElement {
  Object.defineProperty(el, 'innerText', { value, configurable: true });
  return el;
}

describe('readLandingText — why textContent cannot be trusted here', () => {
  const PROMPT = 'Scope:\n- Export a single invoice\n\nAcceptance:\n1. Button appears';
  const LINES = ['Scope:', '- Export a single invoice', 'Acceptance:', '1. Button appears'];

  it('textContent runs the blocks together, so the landing check FAILS on text that DID land', () => {
    const composer = blockComposer(LINES);
    // This is the exact failure: the words are all there, in order, correct.
    expect(composer.textContent).toBe('Scope:- Export a single invoiceAcceptance:1. Button appears');
    expect(hasTextLanded(composer.textContent ?? '', PROMPT)).toBe(false);
  });

  it('the rendered read matches the same landed text', () => {
    const composer = withInnerText(blockComposer(LINES), LINES.join('\n'));
    expect(hasTextLanded(readLandingText(composer), PROMPT)).toBe(true);
  });

  it('fails identically at every size — this is not a timing or length problem', () => {
    for (const repeats of [1, 20, 200, 2_000]) {
      const lines = Array.from({ length: repeats }, () => LINES).flat();
      const body = Array.from({ length: repeats }, () => PROMPT).join('\n');
      const raw = blockComposer(lines);
      const rendered = withInnerText(blockComposer(lines), lines.join('\n'));
      expect(hasTextLanded(raw.textContent ?? '', body)).toBe(false);
      expect(hasTextLanded(readLandingText(rendered), body)).toBe(true);
    }
  });

  it('a SINGLE-line prompt was never affected — which is why this went unnoticed', () => {
    const single = 'Add a dark mode toggle';
    const composer = blockComposer([single]);
    expect(hasTextLanded(composer.textContent ?? '', single)).toBe(true);
  });
});

describe('readLandingText — the fallback', () => {
  it('falls back to textContent when innerText is ABSENT (jsdom, and any partial DOM)', () => {
    const composer = blockComposer(['one', 'two']);
    expect('innerText' in composer).toBe(false);
    expect(readLandingText(composer)).toBe(composer.textContent);
  });

  it('falls back when innerText is EMPTY but the element holds text (an unrendered composer)', () => {
    // A display:none composer reports '' from innerText; reporting an empty box
    // for an element that demonstrably holds text would be a worse answer.
    const composer = withInnerText(blockComposer(['hidden but present']), '');
    expect(readLandingText(composer)).toBe('hidden but present');
  });

  it('prefers innerText whenever it carries text', () => {
    const composer = withInnerText(blockComposer(['a', 'b']), 'a\nb');
    expect(readLandingText(composer)).toBe('a\nb');
  });

  it('a genuinely empty composer reads as empty by either route', () => {
    const composer = withInnerText(document.createElement('div'), '');
    expect(readLandingText(composer)).toBe('');
    // and an empty read is never "landed" — the blank-text guard still holds
    expect(hasTextLanded(readLandingText(composer), 'anything')).toBe(false);
  });

  it('tolerates a null textContent without throwing', () => {
    expect(readLandingText({ textContent: null })).toBe('');
    expect(readLandingText({})).toBe('');
  });
});
