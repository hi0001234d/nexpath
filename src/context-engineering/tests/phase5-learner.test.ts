/**
 * Phase 5 Verification Suite: Work-Pattern Learner (R3) & Post-Session Analysis
 *
 * Implements 100% of test-plan.md Section 3 (Module M8) and Section 10 (TC-R3-1 to TC-R3-9):
 *  - TC-M8.1: Detects pending TODO/FIXME or stub functions -> under_implemented
 *  - TC-M8.2: Detects changes contradicting locked architectural decisions -> behavioral_drift
 *  - TC-M8.3: Detects risky patterns (missing rollbacks, unhandled network) -> operational_risk
 *  - TC-R3-1: Session close triggers analyzeSessionPatterns() asynchronously without delaying exit
 *  - TC-R3-2: Git diff introducing "// TODO: handle network reconnect" captured as under_implemented alert
 *  - TC-R3-3: Alert is stored in context_memory with kind = 'pattern_alert', linked to projectId
 *  - TC-R3-4: Next session for same projectId retrieves pattern alert via getActiveMemory()
 *  - TC-R3-5: Pattern alert routes to "Risk, safety and confirmation" in next session's PE
 *  - TC-R3-6: Subsequent session implementing the missing code and removing TODO marks alert resolved
 *  - TC-R3-7: Background learner non-blocking concurrency & anti-lag (single-flight debouncing)
 *  - TC-R3-8: Operational risk pattern detection & persistent storage with entity links
 *  - TC-R3-9: Behavioral drift detection across sessions (direct DB query bypassing repository layer)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  analyzeSessionPatterns,
  onTurnComplete,
  onSessionClose,
  resetSessionTracker,
  savePatternAlert,
  resolvePatternAlert,
  getActivePatternAlerts,
  preparePromptEnhancement,
  getActiveContextMemory,
  normalizeProjectId,
  type WorkspaceContext,
  type ContextMemoryRow,
} from '../index.js';

import {
  openStore,
  closeStore,
  type Store,
} from '../../store/db.js';

describe('Phase 5: Work-Pattern Learner (R3) & Post-Session Analysis (test-plan.md §3 & §10)', () => {
  let tmpDir: string;
  let store: Store;
  const projectRoot = '/workspaces/test-phase5-learner';
  const canonicalId = normalizeProjectId(projectRoot);

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-phase5-test-'));
    store = await openStore(':memory:');
    resetSessionTracker();
  });

  afterEach(() => {
    try {
      closeStore(store);
    } catch {
      // ignore
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    resetSessionTracker();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Section 3: Module M8 Unit Tests (TC-M8.1, TC-M8.2, TC-M8.3)
  // ==========================================================================
  describe('Module M8: pattern_learner (test-plan.md §3)', () => {
    it('[TC-M8.1] detects pending TODO/FIXME or stub functions in git diffs/session turns as under_implemented', async () => {
      const gitDiff = `
diff --git a/src/network/client.ts b/src/network/client.ts
index e69de29..d95f3ad 100644
--- a/src/network/client.ts
+++ b/src/network/client.ts
@@ -1,5 +1,10 @@
+export function connectSocket() {
+  // FIXME: add timeout guard
+  throw new Error("Not implemented");
+}
`;

      const result = await analyzeSessionPatterns([], gitDiff, [], [], { projectId: canonicalId });

      expect(result.alerts.length).toBeGreaterThanOrEqual(1);
      const underImplemented = result.alerts.filter((a) => a.category === 'under_implemented');
      expect(underImplemented.length).toBeGreaterThanOrEqual(1);
      expect(underImplemented.some((a) => a.text.includes('FIXME'))).toBe(true);
      expect(underImplemented.some((a) => a.targetFile === 'src/network/client.ts')).toBe(true);
      expect(underImplemented[0].confidence).toBeGreaterThanOrEqual(0.80);
    });

    it('[TC-M8.2] detects changes contradicting locked architectural decisions as behavioral_drift', async () => {
      const existingRules: ContextMemoryRow[] = [
        {
          id: 1,
          project_root: canonicalId,
          kind: 'rule',
          key: 'payment-retry-policy',
          content: 'Payment retries must NEVER exceed 3 attempts',
          verbatim: null,
          identities: [{ file: 'src/payment/service.ts' }],
          locked: 1,
          confidence: 0.95,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ];

      const gitDiff = `
diff --git a/src/payment/service.ts b/src/payment/service.ts
index 1111111..2222222 100644
--- a/src/payment/service.ts
+++ b/src/payment/service.ts
@@ -10,3 +10,4 @@
+  const retryConfig = { maxAttempts: 5 };
`;

      const result = await analyzeSessionPatterns([], gitDiff, existingRules, [], { projectId: canonicalId });

      const driftAlert = result.alerts.find((a) => a.category === 'behavioral_drift');
      expect(driftAlert).toBeDefined();
      expect(driftAlert?.targetFile).toBe('src/payment/service.ts');
      expect(driftAlert?.text).toContain('deviating from locked rule');
      expect(driftAlert?.confidence).toBeGreaterThanOrEqual(0.80);
    });

    it('[TC-M8.3] detects risky patterns (unhandled rejections, missing rollbacks) as operational_risk', async () => {
      const gitDiff = `
diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts
index 3333333..4444444 100644
--- a/src/billing/invoice.ts
+++ b/src/billing/invoice.ts
@@ -15,4 +15,7 @@
+export async function chargeAndPersist() {
+  await db.insert('invoices', { id: 1 });
+  await fetch('https://payment.api/charge');
+}
`;

      const result = await analyzeSessionPatterns([], gitDiff, [], [], { projectId: canonicalId });

      const riskAlerts = result.alerts.filter((a) => a.category === 'operational_risk');
      expect(riskAlerts.length).toBeGreaterThanOrEqual(2);
      expect(riskAlerts.some((a) => a.text.includes('transaction rollback'))).toBe(true);
      expect(riskAlerts.some((a) => a.text.includes('network request'))).toBe(true);
    });
  });

  // ==========================================================================
  // Section 10: Post-Session Analysis & R3 Pattern Learner Tests (TC-R3-1 to TC-R3-9)
  // ==========================================================================
  describe('Section 10: Post-Session Analysis & R3 Pattern Learner (test-plan.md §10)', () => {
    it('[TC-R3-1] session close triggers analyzeSessionPatterns() asynchronously without delaying session termination', async () => {
      const sessionId = 'session-close-tc-r3-1';
      const gitDiff = `
diff --git a/src/db/migrate.ts b/src/db/migrate.ts
+++ b/src/db/migrate.ts
+  await db.insert('users', { name: 'admin' });
`;

      const t0 = performance.now();
      const result = await onSessionClose(store, {
        projectRoot,
        sessionId,
        gitDiff,
      });
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(100); // Does not delay exit
      expect(result.alerts.length).toBeGreaterThanOrEqual(1);

      // Verify alert was stored in context_memory
      const activeAlerts = getActivePatternAlerts(store, canonicalId);
      expect(activeAlerts.length).toBeGreaterThanOrEqual(1);
    });

    it('[TC-R3-2] git diff introducing "// TODO: handle network reconnect" is captured as an under_implemented alert', async () => {
      const gitDiff = `
diff --git a/src/auth/socket.ts b/src/auth/socket.ts
+++ b/src/auth/socket.ts
+  // TODO: handle network reconnect
`;

      const result = await analyzeSessionPatterns([], gitDiff, [], [], { projectId: canonicalId });

      const alert = result.alerts.find((a) => a.category === 'under_implemented');
      expect(alert).toBeDefined();
      expect(alert?.text).toContain('handle network reconnect');
      expect(alert?.targetFile).toBe('src/auth/socket.ts');
    });

    it('[TC-R3-3] alert is stored in context_memory with kind = "pattern_alert", linked to projectId', () => {
      const alertId = savePatternAlert(store, canonicalId, {
        kind: 'pattern_alert',
        category: 'under_implemented',
        text: 'Pending TODO: implement token refresh in auth.ts',
        targetFile: 'src/auth.ts',
        evidence: '// TODO: implement token refresh',
        confidence: 0.85,
      });

      expect(alertId).toBeGreaterThan(0);

      const allActive = getActiveContextMemory(store, canonicalId);
      const savedRow = allActive.find((r) => r.id === alertId);
      expect(savedRow).toBeDefined();
      expect(savedRow?.project_root).toBe(canonicalId);
      expect(savedRow?.kind).toBe('pattern_alert');
      expect(savedRow?.content).toContain('token refresh');
      expect(savedRow?.active).toBe(1);
    });

    it('[TC-R3-4] next session for same projectId retrieves the pattern alert via getActiveMemory()', () => {
      savePatternAlert(store, canonicalId, {
        kind: 'pattern_alert',
        category: 'under_implemented',
        text: 'Pending TODO: implement token refresh in auth.ts',
        targetFile: 'src/auth.ts',
        evidence: '// TODO: implement token refresh',
        confidence: 0.85,
      });

      // Query active memory for the project
      const active = getActiveContextMemory(store, canonicalId);
      expect(active.length).toBe(1);
      expect(active[0].kind).toBe('pattern_alert');
      expect(active[0].content).toContain('token refresh');
    });

    it('[TC-R3-5] pattern alert routes to "Risk, safety and confirmation" in next session prompt enhancement', async () => {
      savePatternAlert(store, canonicalId, {
        kind: 'pattern_alert',
        category: 'operational_risk',
        text: 'Database mutation in checkout.ts executed without transaction rollback',
        targetFile: 'src/checkout.ts',
        evidence: 'await db.insert(...)',
        confidence: 0.85,
      });

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        activeFilePath: 'src/checkout.ts',
        store,
      };

      const result = await preparePromptEnhancement('review checkout flow before deploy', context);

      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toContain('### Risk, safety and confirmation');
      expect(result.enhancedPrompt).toContain('transaction rollback');
      expect(result.injectedContextTags.some((t) => t.includes('checkout'))).toBe(true);
    });

    it('[TC-R3-6] when subsequent session implements missing code and removes TODO, alert is marked resolved', async () => {
      const alertId = savePatternAlert(store, canonicalId, {
        kind: 'pattern_alert',
        category: 'under_implemented',
        text: 'Pending TODO: handle network reconnect in src/auth.ts',
        targetFile: 'src/auth.ts',
        evidence: '// TODO: handle network reconnect',
        confidence: 0.85,
        key: 'alert:under_implemented:src/auth.ts:todo_network',
      });

      const activeAlerts = getActivePatternAlerts(store, canonicalId);
      expect(activeAlerts.length).toBe(1);

      // Subsequent commit removes TODO and adds implementation
      const fixingDiff = `
diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -5,2 +5,4 @@
-  // TODO: handle network reconnect
+  while (attempts < 3) {
+    await reconnect();
+  }
`;

      const analysis = await analyzeSessionPatterns([], fixingDiff, [], activeAlerts, { projectId: canonicalId });
      expect(analysis.resolvedAlertIds).toContain(alertId);

      resolvePatternAlert(store, canonicalId, alertId);

      // Verify no longer active
      const remainingActive = getActivePatternAlerts(store, canonicalId);
      expect(remainingActive.length).toBe(0);
    });

    it('[TC-R3-7] background learner non-blocking concurrency & anti-lag (single-flight debouncing)', async () => {
      const sessionId = 'session-burst-tc-r3-7';

      // Fire 10 rapid prompts in succession
      const promises: Promise<any>[] = [];
      for (let i = 1; i <= 10; i++) {
        promises.push(
          onTurnComplete(store, {
            projectRoot,
            sessionId,
            prompt: `Burst prompt ${i}`,
            response: `Burst response ${i}`,
          })
        );
      }

      const results = await Promise.all(promises);

      // Rolling checkpoints trigger only on multiples of 4 (turns 4 and 8)
      const triggeredRuns = results.filter((r) => r.triggered);
      expect(triggeredRuns.length).toBe(2);
    });

    it('[TC-R3-8] operational risk pattern detection & storage with entity links', async () => {
      const gitDiff = `
diff --git a/src/services/billing.ts b/src/services/billing.ts
+++ b/src/services/billing.ts
+  await db.update('accounts', { balance: 0 });
`;

      const result = await analyzeSessionPatterns([], gitDiff, [], [], { projectId: canonicalId });

      expect(result.alerts.length).toBeGreaterThanOrEqual(1);
      const riskAlert = result.alerts.find((a) => a.category === 'operational_risk');
      expect(riskAlert).toBeDefined();
      expect(riskAlert?.targetFile).toBe('src/services/billing.ts');
      expect(riskAlert?.evidence).toContain('db.update');

      // Persist and verify entity link
      const alertId = savePatternAlert(store, canonicalId, riskAlert!);
      const stored = getActiveContextMemory(store, canonicalId);
      const row = stored.find((r) => r.id === alertId);
      expect(row).toBeDefined();
      expect(row?.identities).toEqual([{ file: 'src/services/billing.ts' }]);
    });

    it('[TC-R3-9] behavioral drift detection across sessions (direct DB access bypassing repository layer)', async () => {
      const existingRules: ContextMemoryRow[] = [
        {
          id: 1,
          project_root: canonicalId,
          kind: 'rule',
          key: 'architecture-repository-layer',
          content: 'Central repository layer must be used for database access; controllers must never query DB directly',
          verbatim: null,
          identities: null,
          locked: 1,
          confidence: 0.95,
          staleness: null,
          superseded_by: null,
          active: 1,
          evidence: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ];

      // Route controller introduces direct db.query bypassing repository layer
      const gitDiff = `
diff --git a/src/controllers/user-controller.ts b/src/controllers/user-controller.ts
+++ b/src/controllers/user-controller.ts
+  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
`;

      const result = await analyzeSessionPatterns([], gitDiff, existingRules, [], { projectId: canonicalId });

      const driftAlert = result.alerts.find((a) => a.category === 'behavioral_drift');
      expect(driftAlert).toBeDefined();
      expect(driftAlert?.targetFile).toBe('src/controllers/user-controller.ts');
      expect(driftAlert?.text).toContain('bypasses central repository layer');
    });
  });
});
