/**
 * Comprehensive Runner for All 16 Semi-E2E Live Integration Tests
 * Spec: test-plan.md Section 12A (TC-E2E-1 through TC-E2E-16)
 *
 * Exercises the complete Feature 1 runtime lifecycle:
 *  - Path A: Stop Hook Ingestion & SQLite WAL Persistence
 *  - Path B: Gap Detection, Task Classification, 4-Factor Ranking & Two-Tier Routing
 *  - Path C: Module 8 R3 Work-Pattern Learning & Cross-Session Alert Injection
 *  - Edge & Contract: Multi-Project Security, Deduplication, Fail-Open SLA & Ved Payload Schema
 */

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
  type EnhancementResult,
} from '../src/context-engineering/index.js';

import { openStore, closeStore, type Store } from '../src/store/db.js';

let passedCount = 0;
let totalCount = 0;

function assertCheck(cond: boolean, label: string, detail?: string) {
  totalCount++;
  if (cond) {
    passedCount++;
    console.log(`    ✅ [PASS] ${label}`);
  } else {
    console.error(`    ❌ [FAIL] ${label}`);
    if (detail) console.error(`       Detail: ${detail}`);
    process.exitCode = 1;
  }
}

async function runSemiE2ETests() {
  console.log('='.repeat(80));
  console.log('🧪 NEXPATH FEATURE 1 — ALL 16 SEMI-E2E INTEGRATION TESTS (test-plan.md §12A)');
  console.log('='.repeat(80));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semi-e2e-suite-'));
  const dbPath = path.join(tmpDir, 'e2e-store.db');
  const store = await openStore(dbPath);
  const projectRoot = '/workspaces/ecommerce-platform';
  const canonicalId = normalizeProjectId(projectRoot);

  try {
    // ------------------------------------------------------------------------
    // TC-E2E-1: Cold Start & Fresh Task Gating (Path B)
    // ------------------------------------------------------------------------
    console.log('\n[1/16] TC-E2E-1: Cold Start & Fresh Task Gating (Path B)');
    console.log('       Scenario: First prompt in clean workspace. Zero facts in DB.');
    const t1Start = performance.now();
    const ctxFresh: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };
    const resFresh = await preparePromptEnhancement('initialize new repository structure', ctxFresh);
    const t1Ms = Math.round(performance.now() - t1Start);
    assertCheck(resFresh.isEnhanced === false, `Prompt unenhanced: isEnhanced = false`);
    assertCheck(resFresh.enhancedPrompt === 'initialize new repository structure', `Prompt text untouched`);
    assertCheck(resFresh.injectedContextTags.length === 0, `Zero injected tags`);
    assertCheck(t1Ms < 30, `Executed in ${t1Ms}ms (<30ms ceiling)`);

    // ------------------------------------------------------------------------
    // TC-E2E-2: Session 1 Fact Ingestion & Lock Confidence (Path A)
    // ------------------------------------------------------------------------
    console.log('\n[2/16] TC-E2E-2: Session 1 Fact Ingestion & Lock Confidence (Path A)');
    console.log('       Scenario: Developer states locked constraint: "Payment retries must NEVER exceed 3 attempts"');
    const userPromptS1 = 'How should we handle payment retries?';
    const assistantRespS1 = 'Payment retries must NEVER exceed 3 attempts under any circumstances.';
    const factsExtracted = extractFacts({
      projectRoot: canonicalId,
      prompt: userPromptS1,
      assistantResponse: assistantRespS1,
    });
    assertCheck(factsExtracted.length >= 1, `Extracted ${factsExtracted.length} fact(s)`);
    const ruleFact = factsExtracted.find((f) => f.kind === 'rule');
    assertCheck(ruleFact !== undefined && ruleFact.locked === true, `Rule extracted with locked = true`);
    assertCheck((ruleFact?.confidence ?? 0) >= 0.7, `Assigned lock confidence >= 0.70`);

    const ingestResS1 = ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: userPromptS1,
      assistantResponse: assistantRespS1,
    });
    assertCheck(ingestResS1.insertedCount >= 1, `Captured turn memory into SQLite`);
    const storedFactsS1 = getActiveContextMemory(store, canonicalId);
    assertCheck(storedFactsS1.length >= 1 && storedFactsS1[0].locked === 1, `Fact persisted in SQLite context_memory table with locked = 1`);

    // ------------------------------------------------------------------------
    // TC-E2E-3: Session 2 Feature Query & Two-Tier Delivery (Path B)
    // ------------------------------------------------------------------------
    console.log('\n[3/16] TC-E2E-3: Session 2 Feature Query & Two-Tier Delivery (Path B)');
    console.log('       Scenario: Session 2 starts. Developer prompts: "Add a retry loop to payment checkout"');
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Setup payment policy',
      assistantResponse: 'Architectural rule: Payment retries must NEVER exceed 3 attempts in payment.ts.',
    });

    const ctxS2: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      activeFilePath: 'src/services/payment.ts',
      gitBranch: 'feature/checkout-retry',
      store,
    };
    const t3Start = performance.now();
    const resS2 = await preparePromptEnhancement('Add a retry loop to payment checkout', ctxS2);
    const t3Ms = Math.round(performance.now() - t3Start);
    assertCheck(resS2.isEnhanced === true, `isEnhanced = true (triggers 6-second Cancel Toast)`);
    assertCheck(resS2.enhancedPrompt.includes('### Context and constraints'), `Routed into Tier 1 Context and constraints`);
    assertCheck(resS2.enhancedPrompt.includes('### Project facts'), `Routed into Tier 2 Project facts`);
    assertCheck(resS2.enhancedPrompt.includes('Payment retries must NEVER exceed 3 attempts'), `Locked rule injected verbatim`);
    assertCheck(resS2.injectedContextTags.some((t) => t.includes('payment')), `injectedContextTags contains relevant file tag`);
    assertCheck(t3Ms < 50, `Pipeline completed in ${t3Ms}ms (<50ms SLA)`);

    // ------------------------------------------------------------------------
    // TC-E2E-4: Rule Override & Decision Chaining (superseded_by)
    // ------------------------------------------------------------------------
    console.log('\n[4/16] TC-E2E-4: Rule Override & Decision Chaining (superseded_by)');
    console.log('       Scenario: Developer overrides policy: "Update policy: we now allow 5 retries"');
    const proj4 = `${canonicalId}-tc4`;
    ingestSessionFacts(store, {
      projectRoot: proj4,
      prompt: 'Initial retry rule',
      assistantResponse: 'Decision: Retries must not exceed 3 attempts in payment service.',
    });
    const activeBeforeOverride = getActiveContextMemory(store, proj4);
    const oldId = activeBeforeOverride[0].id;

    ingestSessionFacts(store, {
      projectRoot: proj4,
      prompt: 'Update retry rule',
      assistantResponse: 'Update policy: we now allow 5 retries in payment service.',
    });
    const activeAfterIngest = getActiveContextMemory(store, proj4);
    const newId = activeAfterIngest.find((r) => r.id !== oldId)!.id;

    supersedeDecision(store, proj4, oldId, newId);
    const activeAfterOverride = getActiveContextMemory(store, proj4);
    const historyAfterOverride = getContextMemoryHistory(store, proj4);
    assertCheck(activeAfterOverride.length === 1, `Active facts count is exactly 1`);
    assertCheck(activeAfterOverride[0].id === newId, `Active fact is the updated 5-retries rule`);
    assertCheck(historyAfterOverride.length >= 2, `Audit history preserves all facts (Zero Deletions rule)`);
    const oldRow = historyAfterOverride.find((r) => r.id === oldId);
    assertCheck(oldRow?.superseded_by === newId, `Old rule superseded_by pointer updated to new id (${newId})`);
    assertCheck(oldRow?.active === 0, `Old rule active flag set to 0`);

    // ------------------------------------------------------------------------
    // TC-E2E-5: In-Session Deduplication & Nagging Prevention (delivered_items)
    // ------------------------------------------------------------------------
    console.log('\n[5/16] TC-E2E-5: In-Session Deduplication & Nagging Prevention (delivered_items)');
    console.log('       Scenario: Turn 2 of same session: "format the retry error logs"');
    const sessionIdDedupe = 'session-nag-prevention-e2e';
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Setup retry policy',
      assistantResponse: 'Rule: Retries must use exponential backoff in auth service.',
    });

    const ctxDedupe: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };
    (ctxDedupe as any).sessionId = sessionIdDedupe;

    const turn1 = await preparePromptEnhancement('format the retry error logs', ctxDedupe);
    assertCheck(turn1.isEnhanced === true, `Turn 1: Injects rule`);
    assertCheck(turn1.injectedContextTags.length >= 1, `Turn 1: Tags recorded`);

    const turn2 = await preparePromptEnhancement('format the retry error logs', ctxDedupe);
    assertCheck(!turn2.injectedContextTags.includes(turn1.injectedContextTags[0]), `Turn 2: Suppresses previously delivered fact (nagging prevented)`);

    // ------------------------------------------------------------------------
    // TC-E2E-6: Bug Classification & Failure Memory Boost (Path B)
    // ------------------------------------------------------------------------
    console.log('\n[6/16] TC-E2E-6: Bug Classification & Failure Memory Boost (Path B)');
    console.log('       Scenario: Developer submits crash stack trace: "Payment webhook crashed with ECONNRESET"');
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

    const ctxCrash: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };
    const resCrash = await preparePromptEnhancement('Fix Payment webhook crashed with ECONNRESET', ctxCrash);
    assertCheck(resCrash.isEnhanced === true, `Crash prompt enhanced`);
    assertCheck(resCrash.stage === 'review_testing', `Task classified as review_testing for bug`);
    assertCheck(resCrash.enhancedPrompt.includes('### Risk, safety and confirmation'), `Routed into Risk, safety and confirmation`);
    assertCheck(resCrash.enhancedPrompt.includes('ECONNRESET'), `Prioritized failure root cause`);

    // ------------------------------------------------------------------------
    // TC-E2E-7: Git Diff Impact Marking ("code changed since")
    // ------------------------------------------------------------------------
    console.log('\n[7/16] TC-E2E-7: Git Diff Impact Marking ("code changed since")');
    console.log('       Scenario: Developer modifies source file since fact creation');
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Payment service auth',
      assistantResponse: 'Architecture standard: Payment service must use HMAC-SHA256 signatures in payment.ts.',
    });
    const activeBeforeStale = getActiveContextMemory(store, canonicalId);
    const factIdToStale = activeBeforeStale[0].id;
    markMemoryStale(store, canonicalId, factIdToStale, 'code_changed_since');

    const activeAfterStale = getActiveContextMemory(store, canonicalId);
    const staleFact = activeAfterStale.find((f) => f.id === factIdToStale);
    assertCheck(staleFact !== undefined && staleFact.staleness === 'code_changed_since', `Staleness annotated with "code_changed_since"`);

    // ------------------------------------------------------------------------
    // TC-E2E-8: Path C Post-Session R3 Work-Pattern Learning
    // ------------------------------------------------------------------------
    console.log('\n[8/16] TC-E2E-8: Path C Post-Session R3 Work-Pattern Learning');
    console.log('       Scenario: Session 1 closes with unhandled "// TODO: handle network timeout" in diff');
    const gitDiffWithTodo = `
diff --git a/src/services/network.ts b/src/services/network.ts
+++ b/src/services/network.ts
+  // TODO: handle network timeout
`;
    const sCloseResult = await onSessionClose(store, {
      projectRoot,
      sessionId: 'session-e2e-8',
      gitDiff: gitDiffWithTodo,
    });
    assertCheck(sCloseResult.alerts.length >= 1, `Module 8 detected pending TODO alert`);
    const todoAlert = sCloseResult.alerts.find((a) => a.category === 'under_implemented');
    assertCheck(todoAlert !== undefined, `Alert categorized as under_implemented`);

    const storedAlerts = getActivePatternAlerts(store, canonicalId);
    assertCheck(storedAlerts.length >= 1, `Pattern alert persisted in SQLite context_memory`);

    // ------------------------------------------------------------------------
    // TC-E2E-9: Cross-Session Pattern Alert Injection (Continuity Round-Trip)
    // ------------------------------------------------------------------------
    console.log('\n[9/16] TC-E2E-9: Cross-Session Pattern Alert Injection (Continuity Round-Trip)');
    console.log('       Scenario: Next session opens. Injects Session 1 pattern alert into Risk section');
    const ctxNextDay: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      activeFilePath: 'src/services/network.ts',
      store,
    };
    const resNextDay = await preparePromptEnhancement('refactor network module', ctxNextDay);
    assertCheck(resNextDay.isEnhanced === true, `Next day prompt enhanced`);
    assertCheck(resNextDay.enhancedPrompt.includes('### Risk, safety and confirmation'), `Injected into Risk, safety and confirmation`);
    assertCheck(resNextDay.enhancedPrompt.includes('handle network timeout'), `Alert details surfaced to developer`);

    // ------------------------------------------------------------------------
    // TC-E2E-10: Strict 10-Line Global Budget Ceiling & Token Cap
    // ------------------------------------------------------------------------
    console.log('\n[10/16] TC-E2E-10: Strict 10-Line Global Budget Ceiling & Token Cap');
    console.log('        Scenario: 25 matching candidate facts. Enforces 10-line hard cap.');
    for (let i = 1; i <= 25; i++) {
      ingestSessionFacts(store, {
        projectRoot: canonicalId,
        prompt: `Topic ${i}`,
        assistantResponse: `Rule ${i}: Payment checkout retry rule number ${i} in payment.ts.`,
      });
    }
    const ctxBulk: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      activeFilePath: 'src/payment.ts',
      gitStatus: 'clean',
      store,
    };
    const resBulk = await preparePromptEnhancement('Implement payment checkout retry handling', ctxBulk);
    const bulletLines = resBulk.enhancedPrompt.split('\n').filter((l) => l.trim().startsWith('•'));
    assertCheck(bulletLines.length <= 10, `Hard cap enforced: ${bulletLines.length} bullet lines (<= 10 max)`);
    assertCheck(resBulk.contextTokenEstimate <= 1000, `Token ceiling respected (${resBulk.contextTokenEstimate} <= 1000 tokens)`);

    // ------------------------------------------------------------------------
    // TC-E2E-11: Multi-Project Security & Workspace Isolation
    // ------------------------------------------------------------------------
    console.log('\n[11/16] TC-E2E-11: Multi-Project Security & Workspace Isolation');
    console.log('        Scenario: Project Alpha has Vault credentials. Project Beta queries credentials.');
    const projectAlpha = '/tmp/project-alpha';
    const projectBeta = '/tmp/project-beta';
    ingestSessionFacts(store, {
      projectRoot: projectAlpha,
      prompt: 'Vault setup',
      assistantResponse: 'Rule: Database credentials stored in Vault at secret/db.',
    });

    const ctxBeta: WorkspaceContext = {
      workspacePath: projectBeta,
      dataDir: tmpDir,
      store,
    };
    const resBeta = await preparePromptEnhancement('Where are DB credentials stored?', ctxBeta);
    assertCheck(resBeta.isEnhanced === false, `Project Beta returns isEnhanced = false`);
    assertCheck(!resBeta.enhancedPrompt.includes('Vault'), `Zero cross-project bleed: Vault facts omitted`);
    assertCheck(resBeta.injectedContextTags.length === 0, `Zero tags injected in Beta`);

    // ------------------------------------------------------------------------
    // TC-E2E-12: Absolute Fail-Open SLA Safety Shell (<800ms / <2500ms Fallback)
    // ------------------------------------------------------------------------
    console.log('\n[12/16] TC-E2E-12: Absolute Fail-Open SLA Safety Shell (<800ms / <2500ms Fallback)');
    console.log('        Scenario: Trigger AbortController signal during execution.');
    const abortCtrl = new AbortController();
    abortCtrl.abort();
    const slowContext: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };
    const resAborted = await preparePromptEnhancement('query with timeout constraint', slowContext, {
      signal: abortCtrl.signal,
    });
    assertCheck(resAborted.isEnhanced === false, `Fails open gracefully: isEnhanced = false`);
    assertCheck(resAborted.enhancedPrompt === 'query with timeout constraint', `Returns original text untouched`);
    assertCheck(resAborted.stageConfidence === 0.0, `stageConfidence = 0.0`);
    assertCheck(resAborted.injectedContextTags.length === 0, `injectedContextTags is empty`);

    // ------------------------------------------------------------------------
    // TC-E2E-13: Rapid Multi-Prompt Burst (Anti-Lag Concurrency Stress Test)
    // ------------------------------------------------------------------------
    console.log('\n[13/16] TC-E2E-13: Rapid Multi-Prompt Burst (Anti-Lag Concurrency Stress Test)');
    console.log('        Scenario: Burst of 10 rapid prompts during active background learning.');
    const burstPromises: Promise<any>[] = [];
    for (let i = 1; i <= 10; i++) {
      burstPromises.push(
        onTurnComplete(store, {
          projectRoot,
          sessionId: 'session-burst-anti-lag',
          prompt: `Burst prompt ${i}`,
          response: `Burst response ${i}`,
        })
      );
    }
    const burstResults = await Promise.all(burstPromises);
    const checkpointsFired = burstResults.filter((r) => r.triggered);
    assertCheck(checkpointsFired.length === 2, `Single-flight debouncing: Checkpoints fired exactly on turns 4 and 8 (2 total)`);

    // ------------------------------------------------------------------------
    // TC-E2E-14: Operational Risk Alerting & Resolution Lifecycle
    // ------------------------------------------------------------------------
    console.log('\n[14/16] TC-E2E-14: Operational Risk Alerting & Resolution Lifecycle');
    console.log('        Scenario: Session 1 adds unhandled mutation -> Session 2 warns -> Session 3 fixes and resolves');
    const diffRiskS1 = `
diff --git a/src/db/orders.ts b/src/db/orders.ts
+++ b/src/db/orders.ts
+  await db.insert('orders', orderData);
`;
    await onSessionClose(store, {
      projectRoot,
      sessionId: 'sess-orders-1',
      gitDiff: diffRiskS1,
    });
    const alertsRiskS1 = getActivePatternAlerts(store, canonicalId);
    const mutationAlert = alertsRiskS1.find((a) => a.content.includes('transaction rollback'));
    assertCheck(mutationAlert !== undefined, `Session 1: Operational risk detected for multi-step DB mutation`);

    const ctxRiskS2: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
      activeFilePath: 'src/db/orders.ts',
    };
    const peRiskS2 = await preparePromptEnhancement('modify checkout orders processing', ctxRiskS2);
    assertCheck(peRiskS2.enhancedPrompt.includes('transaction rollback'), `Session 2: Injected risk warning into prompt`);

    const diffRiskS3 = `
diff --git a/src/db/orders.ts b/src/db/orders.ts
--- a/src/db/orders.ts
+++ b/src/db/orders.ts
@@ -1,2 +1,6 @@
+  await db.transaction(async (trx) => {
+    await trx.insert('orders', orderData);
+    await trx.commit();
+  });
`;
    const resRiskS3 = await onSessionClose(store, {
      projectRoot,
      sessionId: 'sess-orders-3',
      gitDiff: diffRiskS3,
    });
    assertCheck(resRiskS3.resolvedAlertIds.includes(mutationAlert!.id), `Session 3: Alert marked resolved after transaction added`);
    const alertsAfterS3 = getActivePatternAlerts(store, canonicalId);
    assertCheck(!alertsAfterS3.some((a) => a.id === mutationAlert!.id), `Resolved alert cleanly excluded from active memory`);

    // ------------------------------------------------------------------------
    // TC-E2E-15: Explicit Memory Retrieval via Cues (Decision T9)
    // ------------------------------------------------------------------------
    console.log('\n[15/16] TC-E2E-15: Explicit Memory Retrieval via Cues (Decision T9)');
    console.log('        Scenario: User enters prompt with explicit recall cue: "Recall our previous decision on retry policy"');
    ingestSessionFacts(store, {
      projectRoot: canonicalId,
      prompt: 'Retry policy discussion',
      assistantResponse: 'Settled decision: retry backoff policy settled at 3 attempts with exponential delay.',
    });
    const ctxCue: WorkspaceContext = {
      workspacePath: projectRoot,
      dataDir: tmpDir,
      store,
    };
    const resCue = await preparePromptEnhancement('Recall our previous decision on retry policy', ctxCue);
    assertCheck(resCue.isEnhanced === true, `Overrides fresh-task gating: isEnhanced = true`);
    assertCheck(resCue.enhancedPrompt.includes('3 attempts with exponential delay'), `Successfully retrieved historical decision fact`);

    // ------------------------------------------------------------------------
    // TC-E2E-16: Universal Stage Delivery (Feature 3 VED Contract)
    // ------------------------------------------------------------------------
    console.log('\n[16/16] TC-E2E-16: Universal Stage Delivery (Feature 3 VED Contract)');
    console.log('        Scenario: Validates canonical stage enum & numeric confidence across all 4 modes');
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

    // Mode 1: Fresh task
    const r1 = await preparePromptEnhancement('hello world test task', ctxFresh);
    assertCheck(validStages.includes(r1.stage) && typeof r1.stageConfidence === 'number', `Mode 1 (Fresh Task): valid stage & confidence`);

    // Mode 2: Bugfix task
    const r2 = await preparePromptEnhancement('fix NPE in user login', ctxS2);
    assertCheck(r2.stage === 'review_testing' && r2.stageConfidence >= 0.7, `Mode 2 (Bugfix): stage = review_testing & confidence >= 0.7`);

    // Mode 3: Feature implementation
    const r3 = await preparePromptEnhancement('add new payment gateway', ctxS2);
    assertCheck(r3.stage === 'implementation' && r3.stageConfidence >= 0.65, `Mode 3 (Feature): stage = implementation & confidence >= 0.65`);

    // Mode 4: Fail-open aborted fallback
    const r4 = await preparePromptEnhancement('timeout task', ctxS2, { signal: abortCtrl.signal });
    assertCheck(validStages.includes(r4.stage) && r4.stageConfidence === 0.0, `Mode 4 (Fallback): stage in enum & confidence = 0.0`);

    console.log('\n' + '='.repeat(80));
    console.log(`🎉 ALL 16 SEMI-E2E LIVE INTEGRATION TESTS COMPLETED: ${passedCount}/${totalCount} CHECKS PASSED`);
    console.log('='.repeat(80));

  } finally {
    try {
      closeStore(store);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

runSemiE2ETests().catch((err) => {
  console.error('Fatal error during Semi-E2E execution:', err);
  process.exit(1);
});
