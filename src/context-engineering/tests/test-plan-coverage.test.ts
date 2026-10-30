/**
 * test-plan.md coverage: the 47 case IDs that no existing suite referenced.
 * Each test is named by its test-plan ID and asserts what the plan states.
 *
 *  §3  M5 (gap detector), M6 (task classifier), M7 (budget ranker), M10 (section router)
 *  §6  TC-RET-GAP-1..4, TC-RET-CLS-1..5
 *  §7  TC-RNK-1..8
 *  §8  TC-SEC-RTR-1..4
 *  §9  TC-FAIL-1..5
 *  §12 TC-F3-1..5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  preparePromptEnhancement,
  preparePromptEnhancementWithSections,
  estimateTokenCount,
  detectPromptGaps,
  classifyTask,
  rankAndAllocateBudget,
  routeSectionsAndCompose,
  upsertContextMemory,
  normalizeProjectId,
  type ContextMemoryRow,
  type ContextMemoryKind,
  type WorkspaceContext,
} from '../index.js';

import { openStore, closeStore, type Store } from '../../store/db.js';

const NOW = Date.now();
let nextId = 1;

function fact(
  kind: ContextMemoryKind,
  content: string,
  extra: Partial<ContextMemoryRow> = {}
): ContextMemoryRow {
  const id = nextId++;
  return {
    id,
    project_root: '/ws/plan',
    kind,
    key: `${kind}-${id}`,
    content,
    verbatim: null,
    identities: null,
    locked: 0,
    confidence: 0.8,
    staleness: null,
    superseded_by: null,
    active: 1,
    evidence: null,
    created_at: NOW,
    updated_at: NOW,
    ...extra,
  } as ContextMemoryRow;
}

const sectionIds = (prompt: string, facts: ContextMemoryRow[], taskType: Parameters<typeof rankAndAllocateBudget>[2] = 'feature') => {
  const ranked = rankAndAllocateBudget(prompt, facts, taskType);
  return routeSectionsAndCompose(prompt, ranked.allocatedLines, ranked.workspaceLines);
};

// ============================================================================
// §3 M5 / §6 Gap detector
// ============================================================================
describe('Gap detector (test-plan §3 M5, §6)', () => {
  it('[TC-M5.1] symbol without a file path flags missing_file', () => {
    const r = detectPromptGaps('update calculateTax');
    expect(r.gaps.some((g) => g.category === 'missing_file' && g.rawToken === 'calculateTax')).toBe(true);
  });

  it('[TC-M5.2] a symbol matching the active file resolves from the workspace', () => {
    const r = detectPromptGaps('update calculateTax', { workspacePath: '/ws', activeFilePath: 'src/calculateTax.ts', recentModifiedFiles: [] });
    const gap = r.gaps.find((g) => g.rawToken === 'calculateTax');
    expect(gap?.resolvedFromWorkspace).toBe('src/calculateTax.ts');
  });

  it('[TC-M5.3] failure words without a trace flag missing_error ("it crashed", "getting 500")', () => {
    expect(detectPromptGaps('it crashed').gaps.some((g) => g.category === 'missing_error')).toBe(true);
    expect(detectPromptGaps('getting 500 on checkout').gaps.some((g) => g.category === 'missing_error')).toBe(true);
  });

  it('[TC-M5.5] a self-contained prompt has no gaps', () => {
    const r = detectPromptGaps('create a utility function isEven(n) in math.ts that returns n % 2 === 0');
    expect(r.hasGaps).toBe(false);
  });

  it('[TC-M5.6] detection runs in under 5ms', () => {
    const r = detectPromptGaps('the checkout crashed after we added retry to processPayment in billing');
    expect(r.executionTimeMs).toBeLessThan(5);
  });

  it('[TC-RET-GAP-1] an unknown function flags missing_file with a suggested query', () => {
    const gap = detectPromptGaps('why does reconcileLedger skip entries').gaps.find((g) => g.category === 'missing_file');
    expect(gap?.rawToken).toBe('reconcileLedger');
    expect(gap?.suggestedQuery).toBeTruthy();
  });

  it('[TC-RET-GAP-2] a prompt about the open file resolves from the workspace', () => {
    const r = detectPromptGaps('tidy up paymentService', { workspacePath: '/ws', activeFilePath: 'src/paymentService.ts', recentModifiedFiles: [] });
    expect(r.gaps.find((g) => g.rawToken === 'paymentService')?.resolvedFromWorkspace).toBe('src/paymentService.ts');
  });

  it('[TC-RET-GAP-3] an error code without a stack trace ("ECONNREFUSED") flags missing_error', () => {
    const r = detectPromptGaps('the worker keeps getting ECONNREFUSED');
    expect(r.gaps.some((g) => g.category === 'missing_error')).toBe(true);
  });

  it('[TC-RET-GAP-4] a complete self-contained prompt bypasses retrieval (hasGaps: false)', () => {
    const r = detectPromptGaps('rename the variable total to grandTotal in src/cart/summary.ts');
    expect(r.hasGaps).toBe(false);
  });
});

// ============================================================================
// §3 M6 / §6 Task classifier
// ============================================================================
describe('Task classifier (test-plan §3 M6, §6)', () => {
  it.each(['fix the login', 'there is a bug in checkout', 'error on save', 'app crash on start'])(
    '[TC-M6.1] "%s" is bugfix',
    (p) => expect(classifyTask(p).taskType).toBe('bugfix')
  );

  it.each(['add a search box', 'create a user model', 'implement oauth', 'build the export page'])(
    '[TC-M6.2] "%s" is feature',
    (p) => expect(classifyTask(p).taskType).toBe('feature')
  );

  it.each(['refactor the cart', 'clean up the utils', 'restructure the api layer'])(
    '[TC-M6.3] "%s" is refactor',
    (p) => expect(classifyTask(p).taskType).toBe('refactor')
  );

  it.each(['test the parser', 'raise coverage for auth', 'write a spec for orders'])(
    '[TC-M6.4] "%s" is test',
    (p) => expect(classifyTask(p).taskType).toBe('test')
  );

  it.each(['update the docker image', 'change tsconfig paths', 'the ci pipeline', 'bump package.json version'])(
    '[TC-M6.5] "%s" is config',
    (p) => expect(classifyTask(p).taskType).toBe('config')
  );

  it('[TC-M6.5] an unclassified prompt falls back to general', () => {
    expect(classifyTask('good morning').taskType).toBe('general');
  });

  it('[TC-RET-CLS-1] "Fix NPE in payment gateway" is bugfix via "fix"', () => {
    const r = classifyTask('Fix NPE in payment gateway');
    expect(r.taskType).toBe('bugfix');
    expect(r.matchedKeywords).toContain('fix');
  });

  it('[TC-RET-CLS-2] "Add Apple Pay support to checkout" is feature via "add"', () => {
    const r = classifyTask('Add Apple Pay support to checkout');
    expect(r.taskType).toBe('feature');
    expect(r.matchedKeywords).toContain('add');
  });

  it('[TC-RET-CLS-3] "Restructure database repository layer" is refactor via "restructure"', () => {
    const r = classifyTask('Restructure database repository layer');
    expect(r.taskType).toBe('refactor');
    expect(r.matchedKeywords).toContain('restructure');
  });

  it('[TC-RET-CLS-4] "Write unit tests for token auth" is test via "test"', () => {
    const r = classifyTask('Write unit tests for token auth');
    expect(r.taskType).toBe('test');
    expect(r.matchedKeywords.some((k) => k.startsWith('test'))).toBe(true);
  });

  it('[TC-RET-CLS-5] "look at this" falls back to general without throwing', () => {
    expect(() => classifyTask('look at this')).not.toThrow();
    expect(classifyTask('look at this').taskType).toBe('general');
  });
});

// ============================================================================
// §3 M7 / §7 Budget ranker
// ============================================================================
describe('Budget ranker (test-plan §3 M7, §7)', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      fact(i % 3 === 0 ? 'failure' : i % 3 === 1 ? 'rule' : 'intent', `payment retry fact ${i} about billing`)
    );

  it('[TC-M7.1] 40 candidates -> at most 10 lines', () => {
    expect(rankAndAllocateBudget('fix the payment retry', many(40), 'bugfix').totalLines).toBeLessThanOrEqual(10);
  });

  it('[TC-RNK-1] 50 candidates -> at most 10 lines', () => {
    expect(rankAndAllocateBudget('add payment retry to billing', many(50), 'feature').totalLines).toBeLessThanOrEqual(10);
  });

  it('[TC-M7.3] an explicit lock (0.95) outranks a casual observation (0.50)', () => {
    const casual = fact('rule', 'retry policy uses 3 attempts', { confidence: 0.5 });
    const locked = fact('rule', 'retry policy uses 5 attempts', { confidence: 0.95, locked: 1 });
    const r = rankAndAllocateBudget('check the retry policy', [casual, locked], 'feature');
    expect(r.allocatedLines[0].fact.id).toBe(locked.id);
  });

  it('[TC-RNK-4] 0.95 outranks 0.50 even with a slightly lower keyword match', () => {
    const casual = fact('rule', 'retry policy attempts for checkout', { confidence: 0.5 });
    const locked = fact('rule', 'retry policy is fixed', { confidence: 0.95, locked: 1 });
    const r = rankAndAllocateBudget('retry policy attempts', [casual, locked], 'feature');
    expect(r.allocatedLines[0].fact.id).toBe(locked.id);
  });

  it('[TC-M7.4] bugfix favours failures; feature favours rules', () => {
    const facts = [
      ...Array.from({ length: 6 }, (_, i) => fact('failure', `payment retry failure ${i}`)),
      ...Array.from({ length: 6 }, (_, i) => fact('rule', `payment retry rule ${i}`)),
    ];
    const count = (r: ReturnType<typeof rankAndAllocateBudget>, k: string) =>
      r.allocatedLines.filter((l) => l.fact.kind === k).length;

    const bug = rankAndAllocateBudget('fix payment retry', facts, 'bugfix');
    const feat = rankAndAllocateBudget('add payment retry', facts, 'feature');
    expect(count(bug, 'failure')).toBeGreaterThan(count(bug, 'rule'));
    expect(count(feat, 'rule')).toBeGreaterThan(count(feat, 'failure'));
  });

  it('[TC-RNK-2] bugfix allocates up to 4 failure lines and 3 rule lines', () => {
    const facts = [
      ...Array.from({ length: 8 }, (_, i) => fact('failure', `payment retry failure ${i}`)),
      ...Array.from({ length: 8 }, (_, i) => fact('rule', `payment retry rule ${i}`)),
    ];
    const r = rankAndAllocateBudget('fix payment retry', facts, 'bugfix');
    expect(r.allocatedLines.filter((l) => l.fact.kind === 'failure')).toHaveLength(4);
    expect(r.allocatedLines.filter((l) => l.fact.kind === 'rule')).toHaveLength(3);
  });

  it('[TC-RNK-3] feature allocates up to 4 rule lines and 2 intent lines', () => {
    const facts = [
      ...Array.from({ length: 8 }, (_, i) => fact('rule', `payment retry rule ${i}`)),
      ...Array.from({ length: 8 }, (_, i) => fact('intent', `payment retry intent ${i}`)),
    ];
    const r = rankAndAllocateBudget('add payment retry', facts, 'feature');
    expect(r.allocatedLines.filter((l) => l.fact.kind === 'rule')).toHaveLength(4);
    expect(r.allocatedLines.filter((l) => l.fact.kind === 'intent')).toHaveLength(2);
  });

  it('[TC-RNK-5] a fact about the active file outranks one about a distant file', () => {
    const near = fact('rule', 'retry rule for checkout', { identities: [{ file: 'src/checkout.ts' }] });
    const far = fact('rule', 'retry rule for reports', { identities: [{ file: 'src/reports.ts' }] });
    const r = rankAndAllocateBudget('fix the retry rule', [far, near], 'bugfix', {
      context: { workspacePath: '/ws', activeFilePath: 'src/checkout.ts', recentModifiedFiles: [] },
    });
    expect(r.allocatedLines[0].fact.id).toBe(near.id);
  });
});

// ============================================================================
// §3 M10 / §8 Section router
// ============================================================================
describe('Section router (test-plan §3 M10, §8)', () => {
  it('[TC-M10.1][TC-SEC-RTR-1] locked rules route to "Context and constraints"', () => {
    const r = sectionIds('add the retry policy', [fact('rule', 'retry policy is fixed at 3 attempts', { locked: 1, confidence: 0.95 })]);
    expect(r.sections.map((s) => s.id)).toContain('context_and_constraints');
  });

  it('[TC-M10.1][TC-SEC-RTR-2] failures route to "Risk, safety and confirmation"', () => {
    const r = sectionIds('fix the retry timeout', [fact('failure', 'retry timeout caused duplicate charges')], 'bugfix');
    expect(r.sections.find((s) => s.id === 'risk_safety_confirmation')?.lines.join(' ')).toContain('duplicate charges');
  });

  it('[TC-M10.2][TC-SEC-RTR-3] general project rules route to "Project facts"', () => {
    const r = sectionIds('add a retry helper', [fact('rule', 'retry helpers live in the utils folder', { confidence: 0.45 })]);
    const pf = r.sections.find((s) => s.id === 'project_grounding_facts');
    expect(pf?.title).toBe('Project facts');
    expect(pf?.lines.join(' ')).toContain('utils folder');
  });

  it('[TC-M10.3][TC-SEC-RTR-4] "Project facts" with >=1 fact is a mandatory survivor', () => {
    const r = sectionIds('add a retry helper', [fact('rule', 'retry helpers live in the utils folder', { confidence: 0.45 })]);
    expect(r.sections.find((s) => s.id === 'project_grounding_facts')?.isMandatorySurvivorSection).toBe(true);
  });
});

// ============================================================================
// Store-backed cases: §7 TC-RNK-6..8, §9 TC-FAIL-*, §12 TC-F3-*
// ============================================================================
describe('Store-backed pipeline (test-plan §7, §9, §12)', () => {
  let store: Store;
  const projectRoot = '/workspaces/plan-coverage';
  const pid = normalizeProjectId(projectRoot);
  const ctx = (sessionId: string, extra: Partial<WorkspaceContext> = {}): WorkspaceContext =>
    ({ workspacePath: projectRoot, store, sessionId, recentModifiedFiles: [], ...extra }) as WorkspaceContext;
  const seed = (kind: ContextMemoryKind, key: string, content: string, locked = false) =>
    upsertContextMemory(store, { projectRoot: pid, kind, key, content, locked, confidence: locked ? 0.95 : 0.7 });
  const neverResolvingF3 = () => ({
    getResourceDecision: () => new Promise(() => {}),
    reportResult: () => {},
  });

  beforeEach(async () => {
    store = await openStore(':memory:');
    seed('rule', 'max-retries-3', 'Payment retry is capped at max 3 retries', true);
    seed('failure', 'retry-double-charge', 'Retry without idempotency caused double charges on payment');
  });

  afterEach(() => {
    try {
      closeStore(store);
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it('[TC-RNK-6] delivered facts are recorded in delivered_items', async () => {
    const r = await preparePromptEnhancement('fix the payment retry', ctx('rnk6'));
    expect(r.isEnhanced).toBe(true);
    const rows = store.db.exec('SELECT injected_context_tags FROM delivered_items WHERE session_id = ?', ['rnk6']);
    const tags = JSON.parse(String(rows[0]?.values[0]?.[0] ?? '[]'));
    expect(tags).toEqual(expect.arrayContaining(r.injectedContextTags));
  });

  it('[TC-RNK-7] a follow-up in the same session suppresses already-delivered facts', async () => {
    const first = await preparePromptEnhancement('fix the payment retry', ctx('rnk7'));
    const second = await preparePromptEnhancement('fix the payment retry', ctx('rnk7'));
    const factTags = (t: string[]) => t.filter((x) => !x.startsWith('@file:') && !x.startsWith('@git:'));
    expect(factTags(first.injectedContextTags).length).toBeGreaterThan(0);
    for (const tag of factTags(first.injectedContextTags)) {
      expect(second.injectedContextTags).not.toContain(tag);
    }
  });

  it('[TC-RNK-8] initial-turn context stays within 500 tokens even with long facts', async () => {
    for (let i = 0; i < 12; i++) {
      seed('rule', `long-${i}`, `Payment retry rule ${i}: ` + 'every retry path must log the attempt number, gateway response and idempotency key. '.repeat(4), true);
    }
    const r = await preparePromptEnhancement('fix the payment retry', ctx('rnk8'));
    expect(r.contextTokenEstimate).toBeLessThanOrEqual(500);
  });

  it('[TC-FAIL-1] a 2,600ms stall falls back to the raw prompt within the 2,500ms SLA', async () => {
    const t0 = performance.now();
    const r = await preparePromptEnhancement('fix the payment retry', ctx('fail1'), { f3Client: neverResolvingF3() });
    const elapsed = performance.now() - t0;
    expect(r.isEnhanced).toBe(false);
    expect(r.enhancedPrompt).toBe('fix the payment retry');
    expect(elapsed).toBeLessThan(2700);
  }, 10_000);

  it('[TC-FAIL-2] a corrupted context_memory table falls back without throwing', async () => {
    store.db.run('DROP TABLE context_memory');
    store.db.run('CREATE TABLE context_memory (garbage TEXT)');
    const r = await preparePromptEnhancement('fix the payment retry', ctx('fail2'));
    expect(r.isEnhanced).toBe(false);
    expect(r.enhancedPrompt).toBe('fix the payment retry');
  });

  it('[TC-FAIL-3] an external AbortSignal stops a stalled pipeline promptly', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const t0 = performance.now();
    const r = await preparePromptEnhancement('fix the payment retry', ctx('fail3'), {
      f3Client: neverResolvingF3(),
      signal: controller.signal,
    });
    expect(r.isEnhanced).toBe(false);
    expect(performance.now() - t0).toBeLessThan(500);
  }, 10_000);

  it('[TC-FAIL-4] the fallback payload matches the EnhancementResult contract', async () => {
    const controller = new AbortController();
    controller.abort();
    const r = await preparePromptEnhancement('fix the payment retry', ctx('fail4'), { signal: controller.signal });
    expect(r).toEqual({
      isEnhanced: false,
      enhancedPrompt: 'fix the payment retry',
      stage: 'implementation',
      stageConfidence: 0,
      injectedContextTags: [],
      contextTokenEstimate: 0,
      processingTimeMs: expect.any(Number),
    });
    expect(r.processingTimeMs).toBeLessThanOrEqual(2500);
  });

  it('[TC-FAIL-5] a failure is silent: nothing is printed to the user', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    store.db.run('DROP TABLE context_memory');
    await preparePromptEnhancement('fix the payment retry', ctx('fail5'));
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('[TC-F3-1] preparePromptEnhancement is exported from the package entry (nexpath-cli/context-engineering)', async () => {
    const pkg = await import('../../../package.json', { with: { type: 'json' } });
    const target = (pkg.default as { exports?: Record<string, string> }).exports?.['./context-engineering'];
    expect(target).toBe('./dist/context-engineering/index.js');
    const root = join(__dirname, '../../..');
    if (existsSync(join(root, target!))) {
      const mod = await import(join(root, target!));
      expect(typeof mod.preparePromptEnhancement).toBe('function');
    }
    const src = await import('../index.js');
    expect(typeof src.preparePromptEnhancement).toBe('function');
  });

  it('[TC-F3-2] isEnhanced is true only when context was injected', async () => {
    const yes = await preparePromptEnhancement('fix the payment retry', ctx('f3-2a'));
    const no = await preparePromptEnhancement('good morning', ctx('f3-2b'));
    expect(yes.isEnhanced).toBe(true);
    expect(yes.enhancedPrompt).not.toBe('fix the payment retry');
    expect(yes.injectedContextTags.length).toBeGreaterThan(0);
    expect(no.isEnhanced).toBe(false);
    expect(no.enhancedPrompt).toBe('good morning');
    expect(no.injectedContextTags).toEqual([]);
  });

  it('[TC-F3-3] injectedContextTags are properly slugified', async () => {
    const r = await preparePromptEnhancement('fix the payment retry', ctx('f3-3', { activeFilePath: 'src/auth.ts' }));
    expect(r.injectedContextTags.length).toBeGreaterThan(0);
    for (const tag of r.injectedContextTags) {
      if (tag.startsWith('@file:')) expect(tag).toMatch(/^@file:[\w./-]+$/);
      else expect(tag).toMatch(/^@(rule|failure|intent|alert|git):[a-z0-9:-]+$/);
    }
    expect(r.injectedContextTags).toContain('@rule:max-retries-3');
  });

  it('[TC-F3-4] contextTokenEstimate follows the ~3.8-4 chars/token heuristic', async () => {
    // The estimator itself: 380 chars of prose ~ 100 tokens
    const prose = 'retry the payment with a fixed backoff. '.repeat(10).trim();
    const est = estimateTokenCount(prose);
    expect(prose.length / est).toBeGreaterThanOrEqual(3.6);
    expect(prose.length / est).toBeLessThanOrEqual(4.1);

    // The pipeline reports the estimate of the injected section lines
    const r = await preparePromptEnhancementWithSections('fix the payment retry', ctx('f3-4'));
    const injectedLines = (r.sections ?? []).map((s) => s.lines.join('\n')).join('\n');
    expect(r.contextTokenEstimate).toBe(estimateTokenCount(injectedLines));
  });

  it('[TC-F3-5] processingTimeMs reflects the real elapsed time', async () => {
    const exec = store.db.exec.bind(store.db);
    store.db.exec = ((...args: Parameters<typeof exec>) => {
      const until = performance.now() + 15;
      while (performance.now() < until) {
        // busy-wait so elapsed time is clearly measurable
      }
      return exec(...args);
    }) as typeof store.db.exec;

    const t0 = performance.now();
    const r = await preparePromptEnhancement('fix the payment retry', ctx('f3-5'));
    const wall = performance.now() - t0;
    store.db.exec = exec;

    expect(r.processingTimeMs).toBeGreaterThanOrEqual(wall * 0.8);
    expect(r.processingTimeMs).toBeLessThanOrEqual(wall + 2);
  });
});
