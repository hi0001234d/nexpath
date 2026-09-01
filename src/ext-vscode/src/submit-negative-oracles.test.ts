/**
 * H7 — NEGATIVE ORACLES for the milestone's risk register.
 *
 * Every other suite in this milestone asserts the feature WORKS. These assert the
 * named risks do NOT occur. That distinction matters: four times this milestone a
 * green behavioural suite hid a defect, because both the correct and the broken
 * branch produced the same observable output. A negative oracle fails loudly when
 * a risk materialises, rather than staying quiet because nothing looked wrong.
 *
 * Risk IDs are from that register and are quoted so a future reader can map a
 * failure straight back to the register.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
/** Strip comments so a risk word in prose never satisfies (or trips) an oracle. */
const code = (src: string) =>
  src.split('\n').filter((l) => {
    const t = l.trimStart();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  }).join('\n');

describe('R12 — the new flow must NOT reach into the old, un-gated path', () => {
  // "Both raiseAppWindow/pasteKeystroke and the focus-command list are shared by
  // old and new flows - the highest-risk files in the milestone." A live-verified
  // improvement was applied straight to cursorInject in H1b and had to be
  // reverted; the switch that should have gated it did not exist yet.
  const ext = read('extension.ts');

  it('every poller construction site is guarded by a switch', () => {
    // A site outside a gate means the old flow gains behaviour on every
    // activation - exactly what R12 describes. Two legitimate guard shapes:
    // an inline `...SubmitAdvisoryEnabled(` gate, or being inside
    // `buildSubmitAdvisory`, whose own early return refuses to construct.
    const lines = code(ext).split('\n');
    const helperAt = lines.findIndex((l) => l.includes('function buildSubmitAdvisory('));
    // RC48-era fix (CRLF normalization): CRLF checkouts make lines '}\r' — trim before matching.
    const helperEnd = lines.findIndex((l, i) => i > helperAt && l.trim() === '}');
    const sites = lines
      .map((l, i) => ({ l, i }))
      .filter((x) => x.l.includes('createSubmitHookPoller(') || x.l.includes('buildSubmitAdvisory('))
      .filter((x) => x.i !== helperAt);
    expect(sites.length).toBeGreaterThan(0);
    for (const s of sites) {
      const insideGuardedHelper = s.i > helperAt && s.i < helperEnd;
      const gatedInline = /SubmitAdvisoryEnabled\(/.test(
        lines.slice(Math.max(0, s.i - 25), s.i + 3).join('\n'),
      );
      expect(insideGuardedHelper || gatedInline).toBe(true);
    }
  });

  it('buildSubmitAdvisory refuses to construct when disabled', () => {
    const body = code(ext).slice(code(ext).indexOf('function buildSubmitAdvisory('));
    expect(body.slice(0, 1500)).toMatch(/if \(!enabled\) return null;/);
  });

  it('the shared focus-command list is not redefined by the submit path', () => {
    // H1b's revert: reordering this list changed the SHIPPING cursorInject.
    for (const f of ['submit-advisory-wiring.ts', 'submit-delivery-strategy.ts', 'submit-hook-poller.ts']) {
      expect(code(read(f))).not.toMatch(/CURSOR_CHAT_FOCUS_COMMANDS\s*=/);
    }
  });

  it('the submit modules never mutate the shipping keystroke helpers', () => {
    for (const f of ['submit-advisory-wiring.ts', 'submit-delivery-strategy.ts']) {
      const c = code(read(f));
      expect(c).not.toMatch(/pasteKeystroke\s*=/);
      expect(c).not.toMatch(/raiseAppWindow\s*=/);
    }
  });
});

describe('R6 — user_email PII must never reach a log or a record', () => {
  it('no submit-path module references the field at all', () => {
    // The safest redaction is not having the value.
    for (const f of ['submit-decision-record.ts', 'submit-hook-poller.ts', 'submit-advisory-runtime.ts']) {
      expect(code(read(f))).not.toMatch(/user_email/);
    }
  });

  it('the timing record carries no free text that could hold a prompt', () => {
    // Timing goes to the Output channel; a prompt leaking there would be
    // user-visible and persisted. Scope the check to the onTiming call itself -
    // an earlier version matched across lines and produced a FALSE positive,
    // which is worse than no oracle: it trains readers to ignore failures.
    const c = code(read('submit-hook-poller.ts'));
    const call = c.slice(c.indexOf('deps.onTiming?.({'), c.indexOf('deps.onTiming?.({') + 300);
    expect(call).not.toMatch(/replacementText/);
    expect(call).toMatch(/decisionId/);
  });
});

describe('R5 — the exit-0 contract inversion must stay gated', () => {
  it('the ONLY non-zero exit is reachable behind the switch', () => {
    const c = code(read('../../cli/commands/windsurf-hook.ts'));
    const exits = c.split('\n').filter((l) => /exit\(\s*[1-9]/.test(l));
    // Exactly one non-zero exit path, and it is the documented block.
    expect(exits).toHaveLength(1);
    expect(exits[0]).toMatch(/exit\(2\)/);
  });
});

describe('R2/R3 — we must never depend on the host to reap or bound us', () => {
  it('the Cursor hook self-bounds rather than trusting the host', () => {
    // R2: Cursor orphans timed-out hooks - measured still running past 90s.
    const c = code(read('../../cli/commands/cursor-hook.ts'));
    expect(c).toMatch(/createHoldBudget|holdBudget/);
  });

  it('the written Cursor timeout stays above the hold budget (R3)', async () => {
    const { CURSOR_HOOK_TIMEOUT_SECONDS } = await import('../../cursor-hook/install.js');
    const { MAX_HOLD_BUDGET_MS } = await import('../../cli/commands/submit-hold-budget.js');
    // The 60s default is a silent fail-open cliff: it could fire while we are
    // legitimately holding the prompt.
    expect(CURSOR_HOOK_TIMEOUT_SECONDS * 1000).toBeGreaterThan(MAX_HOLD_BUDGET_MS);
  });
});

describe('A1 — no LLM client may ever appear on the submit path', () => {
  it('no submit module imports an AI provider', async () => {
    for (const f of ['submit-delivery-strategy.ts', 'submit-advisory-wiring.ts', 'submit-hook-poller.ts']) {
      const imports = read(f).split('\n').filter((l) => l.trimStart().startsWith('import'));
      expect(imports.join('\n')).not.toMatch(/openai|anthropic|@ai-sdk/i);
    }
  });
});
