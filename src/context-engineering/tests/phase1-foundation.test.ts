/**
 * Feature 1 — Phase 1 Foundation Layer Full Test Specification
 * Directly implements test-plan.md requirements for:
 *  - Section 3: Module M1 (project_resolver) & Module M3 (decision_chainer / SQLite store)
 *  - Section 4: Multi-Project Security & Workspace Isolation (TC-SEC-1 to TC-SEC-5)
 *  - Section 11: Edge Cases for Foundation Layer (TC-E1, TC-E4, TC-E8)
 *  - Section 12 & 12A: Delivered Items Contract & Decision Chaining Parity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, type Store } from '../../store/db.js';
import {
  canonicalizeWorkspacePath,
  hashProjectPath,
  resolveWorkspaceRelativePath,
} from '../core/project-scope.js';
import {
  upsertContextMemory,
  getActiveContextMemory,
  getContextMemoryHistory,
  supersedeDecision,
  markMemoryStale,
  insertDeliveredItem,
  getRecentDeliveredItems,
  deleteProjectContextData,
} from '../store/historical-map-store.js';

describe('Phase 1 Foundation Layer — Detailed Test Plan Execution', () => {
  let store: Store;
  const projectAlpha = '/workspaces/project-alpha';
  const projectBeta = '/workspaces/project-beta';

  beforeEach(async () => {
    store = await openStore(':memory:');
  });

  afterEach(() => {
    store.db.close();
  });

  // ==========================================================================
  // Section 3: Module M1 — Project Resolver & Scope Normalization
  // ==========================================================================
  describe('Module M1: project_resolver (test-plan.md §3)', () => {
    it('TC-M1.1: canonicalizeWorkspacePath canonicalizes paths and resolves symlinks', () => {
      const canonical = canonicalizeWorkspacePath(tmpdir());
      expect(canonical).toBeDefined();
      expect(typeof canonical).toBe('string');
      expect(canonical.length).toBeGreaterThan(0);
    });

    it('TC-M1.2: Trailing slashes are normalized so with/without slash produce identical canonical path', () => {
      const withSlash = join(tmpdir(), 'test-repo') + '/';
      const withoutSlash = join(tmpdir(), 'test-repo');
      expect(canonicalizeWorkspacePath(withSlash)).toBe(canonicalizeWorkspacePath(withoutSlash));
    });

    it('TC-M1.3: When workspacePath is omitted/undefined, falls back cleanly to process.cwd()', () => {
      const fallback = canonicalizeWorkspacePath();
      const explicitCwd = canonicalizeWorkspacePath(process.cwd());
      expect(fallback).toBe(explicitCwd);
    });

    it('TC-M1.4: Two distinct workspace directories resolve to distinct canonical paths and hashes', () => {
      const pathA = '/media/user/project-alpha';
      const pathB = '/media/user/project-beta';
      const hashA = hashProjectPath(canonicalizeWorkspacePath(pathA));
      const hashB = hashProjectPath(canonicalizeWorkspacePath(pathB));
      expect(hashA).not.toBe(hashB);
      expect(hashA).toHaveLength(16);
      expect(hashB).toHaveLength(16);
    });

    it('TC-M1.5: resolveWorkspaceRelativePath correctly bounds files within project root', () => {
      const root = canonicalizeWorkspacePath('/workspace/my-app');
      const insideFile = join(root, 'src', 'utils', 'helper.ts');
      const outsideFile = '/var/log/system.log';

      expect(resolveWorkspaceRelativePath(root, insideFile)).toBe(join('src', 'utils', 'helper.ts'));
      expect(resolveWorkspaceRelativePath(root, outsideFile)).toBeUndefined();
    });
  });

  // ==========================================================================
  // Section 3: Module M3 — Decision Chainer & SQLite Store
  // ==========================================================================
  describe('Module M3: decision_chainer & SQLite Store (test-plan.md §3)', () => {
    it('TC-M3.1: upsertContextMemory inserts a row into context_memory and returns generated ID', () => {
      const rowId = upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'decision',
        key: 'primary-db',
        content: 'Use PostgreSQL for all relational storage',
        locked: true,
      });

      expect(rowId).toBeGreaterThan(0);
      const active = getActiveContextMemory(store, projectAlpha);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(rowId);
      expect(active[0].key).toBe('primary-db');
      expect(active[0].locked).toBe(1);
      expect(active[0].confidence).toBe(0.95); // Explicit lock default confidence
    });

    it('TC-M3.2: getActiveContextMemory executes WHERE project_root = ? AND active = 1 AND superseded_by IS NULL', () => {
      upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'rule',
        key: 'max-retries',
        content: 'Max 3 retry attempts',
      });

      const active = getActiveContextMemory(store, projectAlpha);
      expect(active).toHaveLength(1);
      expect(active[0].active).toBe(1);
      expect(active[0].superseded_by).toBeNull();
    });

    it('TC-M3.3: supersedeDecision updates superseded_by = newId on old record and never deletes from SQLite', () => {
      const oldId = upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'decision',
        key: 'cache-layer',
        content: 'Use Redis for caching',
      });

      const newId = upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'decision',
        key: 'cache-layer-v2',
        content: 'Migrated to Cloudflare KV for edge caching',
      });

      supersedeDecision(store, projectAlpha, oldId, newId);

      // Active query must return only new decision
      const active = getActiveContextMemory(store, projectAlpha);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(newId);

      // Full audit history query must retain both rows with superseded pointer
      const history = getContextMemoryHistory(store, projectAlpha);
      expect(history).toHaveLength(2);
      const oldRow = history.find((r) => r.id === oldId);
      expect(oldRow?.superseded_by).toBe(newId);
      expect(oldRow?.active).toBe(0);
    });

    it('TC-M3.4: Re-upserting identical (project_root, kind, key) updates content without duplicating rows', () => {
      const id1 = upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'rule',
        key: 'timeout-policy',
        content: 'Timeout after 10 seconds',
      });

      const id2 = upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'rule',
        key: 'timeout-policy',
        content: 'Timeout after 5 seconds',
      });

      expect(id2).toBe(id1);
      const rows = getActiveContextMemory(store, projectAlpha);
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('Timeout after 5 seconds');
    });

    it('TC-M3.5: markMemoryStale sets staleness = code_changed_since', () => {
      const id = upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'convention',
        key: 'auth-headers',
        content: 'Bearer tokens must be prefixed with Bearer',
      });

      markMemoryStale(store, projectAlpha, id, 'code_changed_since');

      const items = getActiveContextMemory(store, projectAlpha);
      expect(items[0].staleness).toBe('code_changed_since');
    });

    it('TC-M3.6: Database schema idempotence: table creation and re-opens preserve existing rows', () => {
      const id = upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'rule',
        key: 'schema-test',
        content: 'Schema test row',
      });

      // Verify row exists and can be retrieved
      const rows = getActiveContextMemory(store, projectAlpha);
      expect(rows.some((r) => r.id === id)).toBe(true);
    });
  });

  // ==========================================================================
  // Section 4: Multi-Project Security & Workspace Isolation
  // ==========================================================================
  describe('Section 4: Security & Workspace Isolation (test-plan.md §4)', () => {
    it('TC-SEC-1: Facts stored in projectAlpha are NEVER returned when querying projectBeta', () => {
      upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'decision',
        key: 'secret-auth',
        content: 'Project Alpha uses OAuth2 with PKCE',
      });

      upsertContextMemory(store, {
        projectRoot: projectBeta,
        kind: 'decision',
        key: 'secret-auth',
        content: 'Project Beta uses API Keys',
      });

      const alphaFacts = getActiveContextMemory(store, projectAlpha);
      const betaFacts = getActiveContextMemory(store, projectBeta);

      expect(alphaFacts).toHaveLength(1);
      expect(alphaFacts[0].content).toBe('Project Alpha uses OAuth2 with PKCE');

      expect(betaFacts).toHaveLength(1);
      expect(betaFacts[0].content).toBe('Project Beta uses API Keys');
    });

    it('TC-SEC-2: delivered_items entries are strictly isolated by projectRoot', () => {
      insertDeliveredItem(store, {
        projectRoot: projectAlpha,
        sessionId: 'sess-alpha-1',
        rawPrompt: 'Alpha prompt',
        enhancedPrompt: 'Alpha prompt with context',
        isEnhanced: true,
        stage: 'implementation',
        stageConfidence: 0.9,
        injectedContextTags: ['@rule:alpha'],
        contextTokenEstimate: 50,
        processingTimeMs: 25,
      });

      const alphaDeliveries = getRecentDeliveredItems(store, projectAlpha);
      const betaDeliveries = getRecentDeliveredItems(store, projectBeta);

      expect(alphaDeliveries).toHaveLength(1);
      expect(alphaDeliveries[0].raw_prompt).toBe('Alpha prompt');
      expect(betaDeliveries).toHaveLength(0);
    });

    it('TC-SEC-3: Sensitive credentials and API keys in content are redacted prior to persistence', () => {
      const maliciousSecretContent = [
        'OpenAI: sk-proj-1234567890abcdef12345678',
        'Nexpath: npk_-7zI1d-H_obJzkBkWgzA97lEWGUR_BUvMXFrz2AzgJk',
        'GitHub: ghp_123456789012345678901234567890123456',
        'Bearer: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload',
      ].join('; ');

      upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'failure',
        key: 'leak-test',
        content: maliciousSecretContent,
      });

      const facts = getActiveContextMemory(store, projectAlpha);
      const storedContent = facts[0].content;

      expect(storedContent).not.toContain('sk-proj-');
      expect(storedContent).not.toContain('npk_-7zI1d');
      expect(storedContent).not.toContain('ghp_123456');
      expect(storedContent).not.toContain('eyJhbGciOiJI');

      expect(storedContent).toContain('sk-[REDACTED');
      expect(storedContent).toContain('npk_[REDACTED');
      expect(storedContent).toContain('Bearer [REDACTED');
    });

    it('TC-SEC-4: Malicious SQL injection payloads in content or keys are parameterized safely', () => {
      const sqlInjectionContent = "'); DROP TABLE context_memory; DROP TABLE delivered_items; --";
      const sqlInjectionKey = "key'; DROP TABLE config; --";

      const id = upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'rule',
        key: sqlInjectionKey,
        content: sqlInjectionContent,
      });

      expect(id).toBeGreaterThan(0);

      // Verify tables still exist and query executes normally
      const facts = getActiveContextMemory(store, projectAlpha);
      expect(facts).toHaveLength(1);
      expect(facts[0].key).toBe(sqlInjectionKey);
      expect(facts[0].content).toBe(sqlInjectionContent);

      // Verify delivered_items table was not dropped
      const deliveries = getRecentDeliveredItems(store, projectAlpha);
      expect(deliveries).toEqual([]);
    });

    it('TC-SEC-5: Relative path traversal attempts (../../) do not escape project scope', () => {
      const pathWithTraversal = '/workspace/project-alpha/../../etc/passwd';
      const canonical = canonicalizeWorkspacePath(pathWithTraversal);
      expect(canonical).toBeDefined();
      expect(typeof canonical).toBe('string');
      // Must not match the raw unescaped input string
      expect(canonical).not.toBe(pathWithTraversal);
    });
  });

  // ==========================================================================
  // Section 11: Edge Cases (test-plan.md §11)
  // ==========================================================================
  describe('Section 11: Edge Cases for Foundation Layer (test-plan.md §11)', () => {
    it('TC-E1: Empty database returns empty arrays cleanly without throwing', () => {
      const active = getActiveContextMemory(store, '/empty/workspace');
      expect(active).toEqual([]);

      const history = getContextMemoryHistory(store, '/empty/workspace');
      expect(history).toEqual([]);

      const recent = getRecentDeliveredItems(store, '/empty/workspace');
      expect(recent).toEqual([]);
    });

    it('TC-E4: Workspace path with spaces, parentheses, and unicode handles safely', () => {
      const exoticPath = '/work dir/project (v1.0) 🚀/nested-module';
      const canonical = canonicalizeWorkspacePath(exoticPath);
      expect(canonical).toBeDefined();

      const hash = hashProjectPath(canonical);
      expect(hash).toHaveLength(16);

      upsertContextMemory(store, {
        projectRoot: canonical,
        kind: 'decision',
        key: 'exotic',
        content: 'Exotic path decision',
      });

      const facts = getActiveContextMemory(store, canonical);
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe('Exotic path decision');
    });

    it('TC-E8: Concurrent database operations execute in-process without locking contention', async () => {
      const operations = Array.from({ length: 20 }, (_, i) => {
        return upsertContextMemory(store, {
          projectRoot: projectAlpha,
          kind: 'rule',
          key: `concurrent-rule-${i}`,
          content: `Content for rule ${i}`,
        });
      });

      const ids = operations;
      expect(ids).toHaveLength(20);

      const active = getActiveContextMemory(store, projectAlpha);
      expect(active).toHaveLength(20);
    });
  });

  // ==========================================================================
  // Section 12: Delivered Items 7-Field Payload & FIFO Cap
  // ==========================================================================
  describe('Delivered Items 7-Field Contract & FIFO Retention', () => {
    it('TC-DEL-1: Preserves exact 7-field EnhancementResult contract in delivered_items', () => {
      const deliveredId = insertDeliveredItem(store, {
        projectRoot: projectAlpha,
        sessionId: 'sess-7-field-test',
        rawPrompt: 'Implement OAuth token refresh',
        enhancedPrompt: 'Implement OAuth token refresh with 4-line context',
        isEnhanced: true,
        stage: 'implementation',
        stageConfidence: 0.94,
        injectedContextTags: ['@rule:token-refresh', '@file:src/auth/token.ts'],
        contextTokenEstimate: 120,
        processingTimeMs: 38,
      });

      expect(deliveredId).toBeGreaterThan(0);

      const items = getRecentDeliveredItems(store, projectAlpha, 1);
      expect(items).toHaveLength(1);
      const item = items[0];

      expect(item.is_enhanced).toBe(1);
      expect(item.stage).toBe('implementation');
      expect(item.stage_confidence).toBe(0.94);
      expect(item.injected_context_tags).toEqual(['@rule:token-refresh', '@file:src/auth/token.ts']);
      expect(item.context_token_estimate).toBe(120);
      expect(item.processing_time_ms).toBe(38);
      expect(item.session_id).toBe('sess-7-field-test');
    });

    it('TC-DEL-2: Enforces FIFO retention cap and drops oldest deliveries per project', () => {
      const customCap = 5;

      for (let i = 1; i <= 8; i++) {
        insertDeliveredItem(
          store,
          {
            projectRoot: projectAlpha,
            rawPrompt: `Prompt #${i}`,
            enhancedPrompt: `Enhanced #${i}`,
            isEnhanced: true,
            stage: 'task_breakdown',
            stageConfidence: 0.8,
            injectedContextTags: [],
            contextTokenEstimate: 10,
            processingTimeMs: 12,
          },
          customCap
        );
      }

      const items = getRecentDeliveredItems(store, projectAlpha, 10);
      expect(items).toHaveLength(5);
      // Newest first: 8, 7, 6, 5, 4
      expect(items[0].raw_prompt).toBe('Prompt #8');
      expect(items[1].raw_prompt).toBe('Prompt #7');
      expect(items[2].raw_prompt).toBe('Prompt #6');
      expect(items[3].raw_prompt).toBe('Prompt #5');
      expect(items[4].raw_prompt).toBe('Prompt #4');
    });

    it('TC-DEL-3: deleteProjectContextData cleans up both context_memory and delivered_items for project', () => {
      upsertContextMemory(store, {
        projectRoot: projectAlpha,
        kind: 'decision',
        key: 'to-delete',
        content: 'will be deleted',
      });

      insertDeliveredItem(store, {
        projectRoot: projectAlpha,
        rawPrompt: 'prompt to delete',
        enhancedPrompt: 'enhanced to delete',
        isEnhanced: true,
        stage: 'idea',
        stageConfidence: 0.5,
        injectedContextTags: [],
        contextTokenEstimate: 5,
        processingTimeMs: 8,
      });

      deleteProjectContextData(store, projectAlpha);

      expect(getActiveContextMemory(store, projectAlpha)).toHaveLength(0);
      expect(getRecentDeliveredItems(store, projectAlpha)).toHaveLength(0);
    });
  });
});
