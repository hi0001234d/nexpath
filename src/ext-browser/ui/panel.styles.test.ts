// Regression guard for the "short-viewport blank options / direct send-confirm" bug.
//
// On a short browser window the panel (`.np-root`, capped at calc(100vh - 40px))
// shrinks. If the header (`.np-fixed-top`) keeps a fixed size it squeezes the
// options band (`.np-scroll`) to zero height: no selectable option renders, and a
// blind Enter jumps straight to the "Send to your agent" confirm. Reproduced live
// across all 6 fixtures at viewport <= 230px.
//
// The fix is two CSS invariants in panel.js. jsdom cannot compute flexbox layout,
// so this test asserts the invariants at the source level — the live layout proof
// is the browser reproduction sweep (blank renders 19 -> 0, focused option visible
// at every height down to vp 180px, normal-window render byte-identical).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const panelSrc = readFileSync(fileURLToPath(new URL('./panel.js', import.meta.url)), 'utf8');

/** Return the declaration block for an exact CSS selector (first match). */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = panelSrc.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`CSS rule not found for selector: ${selector}`);
  return m[1];
}

describe('panel.js short-viewport layout invariants', () => {
  it('.np-fixed-top can shrink and clip so it never eats the whole panel', () => {
    const body = ruleBody('.np-fixed-top');
    // flex-shrink must be enabled (0 1 auto), not disabled (0 0 auto).
    expect(body).toMatch(/flex:\s*0\s+1\s+auto/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow:\s*hidden/);
    // explicit guard against the pre-fix value.
    expect(body).not.toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('.np-scroll reserves a non-zero minimum so >=1 option is always visible', () => {
    const body = ruleBody('.np-scroll');
    const m = body.match(/min-height:\s*(\d+)px/);
    expect(m, '.np-scroll must declare a px min-height').not.toBeNull();
    const minPx = Number(m![1]);
    // Must be tall enough to show at least the focused option row (line-height 15px).
    expect(minPx).toBeGreaterThanOrEqual(30);
    // explicit guard against the pre-fix value (min-height: 0).
    expect(body).not.toMatch(/min-height:\s*0\s*;/);
  });
});
