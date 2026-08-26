import { describe, expect, it } from 'vitest';
import { hasTextLanded, normalizeForLanding } from './landing-check.js';

describe('hasTextLanded — the honest "did my text land" check', () => {
  it('BLANK text never counts as landed (the old check said `"".includes("")` = true)', () => {
    expect(hasTextLanded('USER OWN IN-PROGRESS PROMPT', '')).toBe(false);
    expect(hasTextLanded('', '')).toBe(false);
    expect(hasTextLanded('anything', '   \n  ')).toBe(false);
  });

  it('a SHARED 20-CHAR PREFIX is not landing — this is what auto-submitted the wrong text', () => {
    const alreadyInComposer = 'Add a dark mode toggle to the settings page';
    const weAreInserting    = 'Add a dark mode toggle, but write the test first';
    // the old rule was composer.includes(text.slice(0,20)) → true → "success"
    expect(alreadyInComposer.includes(weAreInserting.slice(0, 20))).toBe(true);
    expect(hasTextLanded(alreadyInComposer, weAreInserting)).toBe(false);
  });

  it('the WHOLE text present counts as landed', () => {
    const text = 'Add a dark mode toggle, but write the test first';
    expect(hasTextLanded(`${text}`, text)).toBe(true);
    expect(hasTextLanded(`prefix ${text} suffix`, text)).toBe(true);
  });

  it('tolerates the whitespace rich editors legitimately re-flow', () => {
    const text = 'Line one\n\nLine two   with   spacing';
    const asRenderedByProseMirror = 'Line one Line two with spacing';
    expect(hasTextLanded(asRenderedByProseMirror, text)).toBe(true);
  });

  it('a truncated insert is NOT landed (partial delivery must fall through to a retry)', () => {
    const text = 'The full enhanced prompt with all of its sections included';
    expect(hasTextLanded('The full enhanced prompt with all of its', text)).toBe(false);
  });

  it('normalizeForLanding collapses runs and trims', () => {
    expect(normalizeForLanding('  a \n\t b  ')).toBe('a b');
  });
});
