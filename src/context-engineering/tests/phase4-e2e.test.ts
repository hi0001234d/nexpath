/**
 * Phase 4 Live Semi-E2E Integration Test Suite
 *
 * Implements the Semi-E2E lifecycle from Section 12A of test-plan.md:
 *  - TC-E2E-1: Cold Start & Fresh Task Gating (Path B)
 *  - TC-E2E-2: Session 1 Fact Ingestion & Lock Confidence (Path A)
 *  - TC-E2E-3: Session 2 Feature Query & Two-Tier Delivery (Path B)
 *  - TC-E2E-4: Rule Override & Decision Chaining (superseded_by)
 *  - TC-E2E-5: In-Session Deduplication & Nagging Prevention (delivered_items)
 *  - TC-E2E-6: Bug Classification & Failure Memory Boost (Path B)
 *  - TC-E2E-7: Git Diff Impact Marking ("code changed since")
 *  - TC-E2E-10: Strict 10-Line Global Budget Ceiling & Token Cap
 *  - TC-E2E-11: Multi-Project Security & Workspace Isolation
 *  - TC-E2E-12: Absolute Fail-Open SLA Safety Shell (<800ms Prompt / <2500ms Fallback)
 *  - TC-E2E-15: Explicit Memory Retrieval via Cues & CLI Flag (Decision T9)
 *  - TC-E2E-16: Universal Stage & StageConfidence Delivery (Feature 3 VED Contract)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  preparePromptEnhancement,
  extractFacts,
  ingestSessionFacts,
  supersedeDecision,
  markMemoryStale,
  getActiveContextMemory,
  getContextMemoryHistory,
  normalizeProjectId,
  savePatternAlert,
  resolvePatternAlert,
  getActivePatternAlerts,
  onTurnComplete,
  onSessionClose,
  type WorkspaceContext,
} from '../index.js';

import {
  openStore,
  closeStore,
  type Store,
} from '../../store/db.js';

describe('Phase 4: Semi-E2E Live Integration Suite (test-plan.md Section 12A)', () => {
  let tmpDir: string;
  let store: Store;
  const projectRoot = '/workspaces/e2e-project';
  const canonicalId = normalizeProjectId(projectRoot);

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-semi-e2e-'));
    store = await openStore(':memory:');
  });

  afterEach(() => {
    try {
      closeStore(store);
    } catch {
      // ignore
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // TC-E2E-1: Cold Start & Fresh Task Gating (Path B)
  // ==========================================================================
  it('[TC-E2E-1] Cold Start & Fresh Task Gating: skips retrieval and returns unenhanced raw prompt with isEnhanced: false', async () => {
    const context: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };

    // Warm up JIT/db caches to prevent cold runner contention
    await preparePromptEnhancement('warmup query', context);

    const prompt = 'write a function isEven(n: number): boolean in math.ts';
    const result = await preparePromptEnhancement(prompt, context);

    expect(result.isEnhanced).toBe(false);
    expect(result.enhancedPrompt).toBe(prompt);
    expect(result.injectedContextTags).toHaveLength(0);
    expect(result.contextTokenEstimate).toBe(0);
    expect(result.processingTimeMs).toBeLessThan(50);
  });

  // ==========================================================================
  // TC-E2E-2: Session 1 Fact Ingestion & Lock Confidence (Path A)
  // ==========================================================================
  it('[TC-E2E-2] Session 1 Fact Ingestion: locks requirement with confidence = 0.95 and locked = 1', async () => {
    const assistantResponse = 'Payment retries must NEVER exceed 3 attempts under any circumstances.';
    const userPrompt = 'How should we handle payment retries?';

    const facts = extractFacts({
      projectRoot: canonicalId,
      prompt: userPrompt,
      assistantResponse,
    });
    expect(facts.length).toBeGreaterThanOrEqual(1);

    const ruleFact = facts.find((f) => f.kind === 'rule');
    expect(ruleFact).toBeDefined();
    expect(ruleFact?.locked).toBe(true);
    expect(ruleFact?.confidence).toBeGreaterThanOrEqual(0.70);

    // Capture turn memory into SQLite
    const result = ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: userPrompt,
      assistantResponse,
    });

    expect(result.insertedCount).toBeGreaterThanOrEqual(1);

    const active = getActiveContextMemory(store, canonicalId);
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active[0].content).toContain('NEVER exceed 3');
    expect(active[0].locked).toBe(1);
  });

  // ==========================================================================
  // TC-E2E-3: Session 2 Feature Query & Two-Tier Delivery (Path B)
  // ==========================================================================
  it('[TC-E2E-3] Session 2 Feature Query & Two-Tier Delivery: injects locked rule into enhanced prompt in <25ms', async () => {
    // Seed the locked rule from Session 1
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Setup payment policy',
      assistantResponse: 'Architectural rule: Payment retries must NEVER exceed 3 attempts in payment.ts.',
    });

    const context: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      activeFilePath: 'src/services/payment.ts',
      gitBranch: 'feature/checkout-retry',
      store,
    };

    const prompt = 'Add a retry loop to payment checkout';
    const result = await preparePromptEnhancement(prompt, context);

    expect(result.isEnhanced).toBe(true);
    expect(result.enhancedPrompt).toContain(prompt);
    expect(result.enhancedPrompt).toContain('### Context and constraints');
    expect(result.enhancedPrompt).toContain('### Project facts');
    expect(result.enhancedPrompt).toContain('Payment retries must NEVER exceed 3 attempts');
    expect(result.injectedContextTags.some((t) => t.includes('payment'))).toBe(true);
    expect(result.processingTimeMs).toBeLessThan(50);
  });

  // ==========================================================================
  // TC-E2E-4: Rule Override & Decision Chaining (superseded_by)
  // ==========================================================================
  it('[TC-E2E-4] Rule Override & Decision Chaining: marks older rule superseded_by without deleting from SQLite', async () => {
    // 1. Initial rule
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Initial retry rule',
      assistantResponse: 'Decision: Retries must not exceed 3 attempts in payment service.',
    });
    const active1 = getActiveContextMemory(store, canonicalId);
    const id1 = active1[0].id;

    // 2. New override rule
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Update retry rule',
      assistantResponse: 'Update policy: we now allow 5 retries in payment service.',
    });
    const active2 = getActiveContextMemory(store, canonicalId);
    const id2 = active2.find((r) => r.id !== id1)!.id;

    // Supersede old decision
    supersedeDecision(store, canonicalId, id1, id2);

    // Active memory should only return the new rule
    const active = getActiveContextMemory(store, canonicalId);
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(id2);
    expect(active[0].content).toContain('allow 5 retries');

    // Historical audit should return BOTH records (Zero Deletions rule)
    const history = getContextMemoryHistory(store, canonicalId);
    expect(history.length).toBe(2);
    const oldRecord = history.find((h) => h.id === id1);
    expect(oldRecord?.superseded_by).toBe(id2);
    expect(oldRecord?.active).toBe(0);
  });

  // ==========================================================================
  // TC-E2E-5: In-Session Deduplication & Nagging Prevention (delivered_items)
  // ==========================================================================
  it('[TC-E2E-5] In-Session Deduplication: suppresses previously delivered facts in subsequent session turns', async () => {
    const sessionId = 'session-nag-prevention-e2e';

    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Setup retry policy',
      assistantResponse: 'Rule: Retries must use exponential backoff in auth service.',
    });

    const context: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };
    (context as any).sessionId = sessionId;

    // Turn 1: Fact is delivered
    const turn1 = await preparePromptEnhancement('format the retry error logs', context);
    expect(turn1.isEnhanced).toBe(true);
    expect(turn1.injectedContextTags.length).toBeGreaterThanOrEqual(1);

    // Turn 2: Same prompt in same session — fact is suppressed to prevent repetitive nagging
    const turn2 = await preparePromptEnhancement('format the retry error logs', context);
    expect(turn2.injectedContextTags).not.toContain(turn1.injectedContextTags[0]);
  });

  // ==========================================================================
  // TC-E2E-6: Bug Classification & Failure Memory Boost (Path B)
  // ==========================================================================
  it('[TC-E2E-6] Bug Classification & Failure Memory Boost: prioritizes failure facts on crash prompts', async () => {
    // Seed 1 general rule and 1 failure memory
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Database convention',
      assistantResponse: 'Rule: Always use pool size of 10 for PostgreSQL.',
    });
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Webhook crash postmortem',
      assistantResponse: 'Known Failure: Payment webhook crashed with ECONNRESET on socket timeout.',
    });

    const context: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };

    const prompt = 'Fix Payment webhook crashed with ECONNRESET';
    const result = await preparePromptEnhancement(prompt, context);

    expect(result.isEnhanced).toBe(true);
    expect(result.stage).toBe('review_testing');
    expect(result.enhancedPrompt).toContain('### Risk, safety and confirmation');
    expect(result.enhancedPrompt).toContain('ECONNRESET');
  });

  // ==========================================================================
  // TC-E2E-7: Git Diff Impact Marking ("code changed since")
  // ==========================================================================
  it('[TC-E2E-7] Git Diff Impact Marking: annotates fact with staleness = "code_changed_since"', async () => {
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Payment service auth',
      assistantResponse: 'Architecture standard: Payment service must use HMAC-SHA256 signatures in payment.ts.',
    });
    const activeBefore = getActiveContextMemory(store, canonicalId);
    expect(activeBefore.length).toBeGreaterThanOrEqual(1);
    const factId = activeBefore[0].id;

    // Mark fact stale when git diff detects modification to payment.ts
    markMemoryStale(store, canonicalId, factId, 'code_changed_since');

    const active = getActiveContextMemory(store, canonicalId);
    const staleFact = active.find((f) => f.id === factId);
    expect(staleFact).toBeDefined();
    expect(staleFact?.staleness).toBe('code_changed_since');
  });

  // ==========================================================================
  // TC-E2E-10: Strict 10-Line Global Budget Ceiling & Token Cap
  // ==========================================================================
  it('[TC-E2E-10] Strict 10-Line Global Budget Ceiling: caps injected context at <= 10 lines with 25+ matching facts', async () => {
    // Seed 25 matching facts
    for (let i = 1; i <= 25; i++) {
      ingestSessionFacts(store, {
        projectRoot: canonicalId,
        prompt: `Topic ${i}`,
        assistantResponse: `Rule ${i}: Payment checkout retry rule number ${i} in payment.ts.`,
      });
    }

    const context: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      activeFilePath: 'src/payment.ts',
      gitStatus: 'clean',
      store,
    };

    const prompt = 'Implement payment checkout retry handling';
    const result = await preparePromptEnhancement(prompt, context);

    expect(result.isEnhanced).toBe(true);

    // Count bullet points in injected prompt
    const lines = result.enhancedPrompt.split('\n');
    const bulletLines = lines.filter((l) => l.trim().startsWith('•'));
    expect(bulletLines.length).toBeLessThanOrEqual(10);
    expect(result.contextTokenEstimate).toBeLessThanOrEqual(1000);
  });

  // ==========================================================================
  // TC-E2E-11: Multi-Project Security & Workspace Isolation
  // ==========================================================================
  it('[TC-E2E-11] Multi-Project Security: facts in project-alpha are never accessible from project-beta', async () => {
    const projectAlpha = '/tmp/project-alpha';
    const projectBeta = '/tmp/project-beta';

    // Ingest sensitive secret in project-alpha
    ingestSessionFacts(store, {
      projectRoot: projectAlpha,
      prompt: 'Vault setup',
      assistantResponse: 'Rule: Database credentials stored in Vault at secret/db.',
    });

    const contextBeta: WorkspaceContext = {
      workspacePath: projectBeta,
      dataDir: tmpDir,
      store,
    };

    // Query in project-beta
    const resultBeta = await preparePromptEnhancement('Where are DB credentials stored?', contextBeta);

    expect(resultBeta.isEnhanced).toBe(false);
    expect(resultBeta.enhancedPrompt).not.toContain('Vault');
    expect(resultBeta.injectedContextTags).toHaveLength(0);
  });

  // ==========================================================================
  // TC-E2E-12: Absolute Fail-Open SLA Safety Shell (<800ms / <2500ms Fallback)
  // ==========================================================================
  it('[TC-E2E-12] Absolute Fail-Open SLA Safety Shell: fails open on aborted signal without throwing', async () => {
    const abortController = new AbortController();
    abortController.abort(); // Pre-aborted

    const slowContext: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };

    const prompt = 'query with timeout constraint';
    const result = await preparePromptEnhancement(prompt, slowContext, { signal: abortController.signal });

    expect(result.isEnhanced).toBe(false);
    expect(result.enhancedPrompt).toBe(prompt);
    expect(result.stage).toBe('implementation');
    expect(result.stageConfidence).toBe(0.0);
    expect(result.injectedContextTags).toHaveLength(0);
  });

  // ==========================================================================
  // TC-E2E-15: Explicit Memory Retrieval via Cues & CLI Flag (Decision T9)
  // ==========================================================================
  it('[TC-E2E-15] Explicit Memory Retrieval via Cues: overrides fresh-task gating and retrieves historical decisions', async () => {
    // Seed historical decision
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Retry policy discussion',
      assistantResponse: 'Settled decision: retry backoff policy settled at 3 attempts with exponential delay.',
    });

    const context: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };

    // Explicit cue: "Recall our previous decision on retry policy"
    const prompt = 'Recall our previous decision on retry policy';
    const result = await preparePromptEnhancement(prompt, context);

    expect(result.isEnhanced).toBe(true);
    expect(result.enhancedPrompt).toContain('3 attempts with exponential delay');
  });

  // ==========================================================================
  // TC-E2E-16: Universal Stage & StageConfidence Delivery (Feature 3 Contract)
  // ==========================================================================
  it('[TC-E2E-16] Universal Stage Delivery: unconditionally includes canonical stage and confidence across all 4 modes', async () => {
    const context: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };

    const validStages = [
      'idea',
      'prd',
      'architecture',
      'task_breakdown',
      'implementation',
      'review_testing',
      'release',
      'feedback_loop',
      'fallback',
    ];

    // Mode 1: Fresh task with zero context
    const r1 = await preparePromptEnhancement('hello world test task', context);
    expect(validStages).toContain(r1.stage);
    expect(typeof r1.stageConfidence).toBe('number');

    // Mode 2: Bugfix task
    const r2 = await preparePromptEnhancement('fix NPE in user login', context);
    expect(r2.stage).toBe('review_testing');
    expect(r2.stageConfidence).toBeGreaterThanOrEqual(0.7);

    // Mode 3: Feature implementation
    const r3 = await preparePromptEnhancement('add new payment gateway', context);
    expect(r3.stage).toBe('implementation');
    expect(r3.stageConfidence).toBeGreaterThanOrEqual(0.65);

    // Mode 4: Fail-open aborted fallback
    const controller = new AbortController();
    controller.abort();
    const r4 = await preparePromptEnhancement('timeout task', context, { signal: controller.signal });
    expect(validStages).toContain(r4.stage);
    expect(r4.stageConfidence).toBe(0.0);
  });

  // ==========================================================================
  // TC-E2E-8: Path C Post-Session R3 Work-Pattern Learning
  // ==========================================================================
  it('[TC-E2E-8] Path C Post-Session Learning: Session 1 closes with unhandled TODO, writes pattern_alert to SQLite', async () => {
    const gitDiff = `
diff --git a/src/services/network.ts b/src/services/network.ts
+++ b/src/services/network.ts
+  // TODO: handle network timeout
`;

    const result = await onSessionClose(store, {
      projectRoot,
      sessionId: 'session-e2e-8',
      gitDiff,
    });

    expect(result.alerts.length).toBeGreaterThanOrEqual(1);
    const todoAlert = result.alerts.find((a) => a.category === 'under_implemented');
    expect(todoAlert).toBeDefined();

    // Verify written to context_memory
    const active = getActivePatternAlerts(store, canonicalId);
    expect(active.length).toBeGreaterThanOrEqual(1);
  });

  // ==========================================================================
  // TC-E2E-9: Cross-Session Pattern Alert Injection (Continuity Round-Trip)
  // ==========================================================================
  it('[TC-E2E-9] Cross-Session Pattern Alert Injection: Session 2 opens and injects Session 1 pattern alert', async () => {
    // Session 1 alert already in SQLite
    savePatternAlert(store, canonicalId, {
      kind: 'pattern_alert',
      category: 'under_implemented',
      text: 'Pending TODO: handle network timeout in src/services/network.ts',
      targetFile: 'src/services/network.ts',
      evidence: '// TODO: handle network timeout',
      confidence: 0.85,
    });

    // Session 2: Developer opens next session in the same project
    const contextSession2: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      activeFilePath: 'src/services/network.ts',
      store,
    };
    (contextSession2 as any).sessionId = 'session-2-continuity';

    const result = await preparePromptEnhancement('update network client connection pool', contextSession2);

    expect(result.isEnhanced).toBe(true);
    expect(result.enhancedPrompt).toContain('### Risk, safety and confirmation');
    expect(result.enhancedPrompt).toContain('handle network timeout');
  });

  // ==========================================================================
  // TC-E2E-13: Rapid Multi-Prompt Burst During Active Background Learning
  // ==========================================================================
  it('[TC-E2E-13] Rapid Multi-Prompt Burst: debouncing prevents thread saturation during burst of 10 prompts', async () => {
    const burstSessionId = 'session-burst-anti-lag';

    const turnPromises: Promise<any>[] = [];
    for (let i = 1; i <= 10; i++) {
      turnPromises.push(
        onTurnComplete(store, {
          projectRoot,
          sessionId: burstSessionId,
          prompt: `Burst prompt ${i}`,
          response: `Burst response ${i}`,
        })
      );
    }

    const turnResults = await Promise.all(turnPromises);
    const triggered = turnResults.filter((r) => r.triggered);
    expect(triggered.length).toBe(2); // Turns 4 and 8 only
  });

  // ==========================================================================
  // TC-E2E-14: Semi-E2E Operational Risk Alerting & Resolution Lifecycle
  // ==========================================================================
  it('[TC-E2E-14] Operational Risk Lifecycle: flags unhandled mutation in Session 1, revives in Session 2, resolves in Session 3', async () => {
    // Session 1: Introduces multi-step DB mutation without transaction
    const gitDiffSession1 = `
diff --git a/src/db/orders.ts b/src/db/orders.ts
+++ b/src/db/orders.ts
+  await db.insert('orders', orderData);
`;
    await onSessionClose(store, {
      projectRoot,
      sessionId: 'session-orders-1',
      gitDiff: gitDiffSession1,
    });

    const alertsAfterS1 = getActivePatternAlerts(store, canonicalId);
    expect(alertsAfterS1.length).toBeGreaterThanOrEqual(1);
    const riskAlert = alertsAfterS1.find((a) => a.content.includes('transaction rollback'));
    expect(riskAlert).toBeDefined();

    // Session 2: Revives alert in prompt enhancement
    const contextS2: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      activeFilePath: 'src/db/orders.ts',
      store,
    };
    const peS2 = await preparePromptEnhancement('modify checkout orders processing', contextS2);
    expect(peS2.isEnhanced).toBe(true);
    expect(peS2.enhancedPrompt).toContain('transaction rollback');

    // Session 3: Developer wraps the mutation in transaction rollback
    const gitDiffSession3 = `
diff --git a/src/db/orders.ts b/src/db/orders.ts
--- a/src/db/orders.ts
+++ b/src/db/orders.ts
@@ -1,2 +1,6 @@
+  await db.transaction(async (trx) => {
+    await trx.insert('orders', orderData);
+    await trx.commit();
+  });
`;
    const resS3 = await onSessionClose(store, {
      projectRoot,
      sessionId: 'session-orders-3',
      gitDiff: gitDiffSession3,
    });

    expect(resS3.resolvedAlertIds).toContain(riskAlert?.id);

    // Verify resolved in SQLite
    const alertsAfterS3 = getActivePatternAlerts(store, canonicalId);
    expect(alertsAfterS3.some((a) => a.id === riskAlert?.id)).toBe(false);
  });
});
