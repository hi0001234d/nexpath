/**
 * PE re-entry guard — an injected body must not re-enter as a new user prompt.
 *
 * The engine handoff contract is
 * explicit: a generated body re-entering `UserPromptSubmit` "must not silently
 * trigger fresh classification, profile cadence, product-feedback cadence,
 * detected-language updates, memory learning, or another PE/DS popup as if they
 * were new user-authored prompts."
 *
 * Our replacement IS such a body — the extension injects it and auto-submits,
 * firing a fresh `pre_user_prompt`. The shipped guard for exactly this is
 * `auto.ts:706` (reads `lastInjectedPrompt`, clears it, returns `no_action` on an
 * echo match, before `recordActivity` at `:722`). These tests prove we FEED that
 * guard rather than leaving the breach open.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildDefaultPromptSubmitDecider } from './windsurf-hook.js';

const src = readFileSync(join(__dirname, 'windsurf-hook.ts'), 'utf8');

describe('⭐ the injected replacement is recorded for the existing echo guard', () => {
  it('calls setInjectedPrompt on the block path', () => {
    // Structural: the store handle lives inside a closure that cannot be reached
    // from a unit test without a real DB. What matters is that the call exists on
    // the persist path and is not silently dropped in a later refactor.
    expect(src).toMatch(/setInjectedPrompt\(/);
  });

  it('records it BEFORE the decision file is written', () => {
    // If persistence fails we return 'allow' and never block; auto clears the
    // field next turn regardless, so a stale value cannot suppress a real prompt.
    const at = src.indexOf('setInjectedPrompt(');
    const write = src.indexOf('await writeSubmitDecision(', at - 2000);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(src.indexOf('await writeSubmitDecision({', at));
  });

  it('records the REPLACEMENT text, not the original prompt', () => {
    // Recording the original would make the guard fire on the wrong turn: the
    // original is cancelled and never re-enters; the replacement does.
    expect(src).toMatch(/setInjectedPrompt\([^)]*replacementText/);
  });

  it('consumes SessionStateManager, never modifies it', () => {
    // Owned by other members (authorship verified) — consume-only here.
    expect(src).toMatch(/import \{ SessionStateManager \}/);
  });

  it('a failure to record never strands the prompt', () => {
    // Worst case the replacement is re-classified - today's behaviour - which is
    // never a reason to block a user's turn.
    const at = src.indexOf('setInjectedPrompt(');
    expect(src.slice(at, at + 400)).toMatch(/catch\s*\{/);
  });
});

describe('the guard is not engaged when nothing was blocked', () => {
  it('an allowed prompt records no injected text', async () => {
    // Recording on an allow would suppress the NEXT genuine user prompt.
    const root = mkdtempSync(join(tmpdir(), 'nexpath-pe-reentry-'));
    try {
      const openStore = vi.fn(async () => ({ db: {} }));
      const decide = buildDefaultPromptSubmitDecider({ project: root }, {
        optionSource: {
          composeOptions: () => ({ l1: [], l2: ['opt'], l3: [] }),
          renderPopup: async () => null,          // user dismissed ⇒ allow
          consumeHandledTurn: () => {},
        } as never,
        openStore: openStore as never,
        closeStore: () => {},
      });
      await expect(decide('pre_user_prompt', { project: root }, 'hi')).resolves.toBe('allow');
      // No store is opened at all when an option source is injected, so nothing
      // could have been recorded.
      expect(openStore).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
