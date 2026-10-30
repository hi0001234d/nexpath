import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, type Store } from '../../store/db.js';
import {
  upsertContextMemory,
  getActiveContextMemory,
  getContextMemoryHistory,
  supersedeDecision,
  markMemoryStale,
  insertDeliveredItem,
  getRecentDeliveredItems,
  deleteProjectContextData,
} from './historical-map-store.js';

describe('Feature 1 — Historical Map & Context Memory Store', () => {
  let store: Store;
  const projectA = '/workspaces/project-alpha';
  const projectB = '/workspaces/project-beta';

  beforeEach(async () => {
    store = await openStore(':memory:');
  });

  afterEach(() => {
    store.db.close();
  });

  describe('context_memory CRUD & Isolation', () => {
    it('inserts a context memory row with sanitized secrets', () => {
      const id = upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'decision',
        key: 'db-engine',
        content: 'Use PostgreSQL with key sk-proj-1234567890abcdef12345678 for auth.',
        locked: true,
      });

      expect(id).toBeGreaterThan(0);

      const items = getActiveContextMemory(store, projectA);
      expect(items).toHaveLength(1);
      expect(items[0].key).toBe('db-engine');
      expect(items[0].locked).toBe(1);
      expect(items[0].confidence).toBe(0.95);
      // Secret must be redacted
      expect(items[0].content).not.toContain('sk-proj-');
      expect(items[0].content).toContain('sk-[REDACTED');
    });

    it('updates in place when upserting identical (project_root, kind, key)', () => {
      const id1 = upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'rule',
        key: 'backoff',
        content: 'Fixed backoff 5s',
      });

      const id2 = upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'rule',
        key: 'backoff',
        content: 'Exponential backoff 5s/15s/45s',
      });

      expect(id2).toBe(id1);

      const items = getActiveContextMemory(store, projectA);
      expect(items).toHaveLength(1);
      expect(items[0].content).toBe('Exponential backoff 5s/15s/45s');
    });

    it('strictly isolates memory by projectRoot', () => {
      upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'decision',
        key: 'auth',
        content: 'Use JWT',
      });

      upsertContextMemory(store, {
        projectRoot: projectB,
        kind: 'decision',
        key: 'auth',
        content: 'Use Session Cookies',
      });

      const itemsA = getActiveContextMemory(store, projectA);
      expect(itemsA).toHaveLength(1);
      expect(itemsA[0].content).toBe('Use JWT');

      const itemsB = getActiveContextMemory(store, projectB);
      expect(itemsB).toHaveLength(1);
      expect(itemsB[0].content).toBe('Use Session Cookies');
    });

    it('filters by kind when requested', () => {
      upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'decision',
        key: 'k1',
        content: 'Decision 1',
      });

      upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'failure',
        key: 'k2',
        content: 'Failure 1',
      });

      const decisions = getActiveContextMemory(store, projectA, { kind: 'decision' });
      expect(decisions).toHaveLength(1);
      expect(decisions[0].key).toBe('k1');

      const failures = getActiveContextMemory(store, projectA, { kind: 'failure' });
      expect(failures).toHaveLength(1);
      expect(failures[0].key).toBe('k2');
    });
  });

  describe('Decision Superseding & Chaining', () => {
    it('chains older decision to newer decision and excludes older from active queries', () => {
      const oldId = upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'decision',
        key: 'db-mongo',
        content: 'Use MongoDB for storage',
      });

      const newId = upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'decision',
        key: 'db-postgres',
        content: 'Migrated to PostgreSQL for ACID compliance',
      });

      supersedeDecision(store, projectA, oldId, newId);

      // Active query must return ONLY newId
      const active = getActiveContextMemory(store, projectA);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(newId);
      expect(active[0].key).toBe('db-postgres');

      // History query must retain both rows with superseded_by pointer
      const history = getContextMemoryHistory(store, projectA);
      expect(history).toHaveLength(2);
      const oldRecord = history.find((r) => r.id === oldId);
      expect(oldRecord?.superseded_by).toBe(newId);
      expect(oldRecord?.active).toBe(0);
    });

    it('marks memory row as stale with code_changed_since', () => {
      const id = upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'convention',
        key: 'api-style',
        content: 'All endpoints under /v1',
      });

      markMemoryStale(store, projectA, id, 'code_changed_since');

      const items = getActiveContextMemory(store, projectA);
      expect(items).toHaveLength(1);
      expect(items[0].staleness).toBe('code_changed_since');
    });
  });

  describe('delivered_items & FIFO Retention', () => {
    it('inserts delivered payload with secret redaction and preserves 7-field metrics', () => {
      const id = insertDeliveredItem(store, {
        projectRoot: projectA,
        sessionId: 'sess-100',
        rawPrompt: 'Add retry with Bearer secret-token-xyz-1234567890',
        enhancedPrompt: 'Enhanced prompt with Bearer secret-token-xyz-1234567890 and context',
        isEnhanced: true,
        stage: 'implementation',
        stageConfidence: 0.92,
        injectedContextTags: ['@rule:backoff', '@file:src/auth.ts'],
        contextTokenEstimate: 145,
        processingTimeMs: 42,
      });

      expect(id).toBeGreaterThan(0);

      const recent = getRecentDeliveredItems(store, projectA, 5);
      expect(recent).toHaveLength(1);
      expect(recent[0].is_enhanced).toBe(1);
      expect(recent[0].stage).toBe('implementation');
      expect(recent[0].stage_confidence).toBe(0.92);
      expect(recent[0].injected_context_tags).toEqual(['@rule:backoff', '@file:src/auth.ts']);
      expect(recent[0].context_token_estimate).toBe(145);
      expect(recent[0].processing_time_ms).toBe(42);

      // Verify redaction on both raw and enhanced
      expect(recent[0].raw_prompt).not.toContain('secret-token-xyz-1234567890');
      expect(recent[0].raw_prompt).toContain('Bearer [REDACTED');
      expect(recent[0].enhanced_prompt).not.toContain('secret-token-xyz-1234567890');
      expect(recent[0].enhanced_prompt).toContain('Bearer [REDACTED');
    });

    it('enforces FIFO retention cap and drops oldest deliveries per project', () => {
      const maxRetention = 3;

      for (let i = 1; i <= 5; i++) {
        insertDeliveredItem(
          store,
          {
            projectRoot: projectA,
            rawPrompt: `Prompt ${i}`,
            enhancedPrompt: `Enhanced ${i}`,
            isEnhanced: false,
            stage: 'task_breakdown',
            stageConfidence: 0.85,
            injectedContextTags: [],
            contextTokenEstimate: 0,
            processingTimeMs: 15,
          },
          maxRetention
        );
      }

      const recent = getRecentDeliveredItems(store, projectA, 10);
      expect(recent).toHaveLength(3);
      // Newest first
      expect(recent[0].raw_prompt).toBe('Prompt 5');
      expect(recent[1].raw_prompt).toBe('Prompt 4');
      expect(recent[2].raw_prompt).toBe('Prompt 3');
    });

    it('clears project context data cleanly', () => {
      upsertContextMemory(store, {
        projectRoot: projectA,
        kind: 'decision',
        key: 'temp',
        content: 'temp content',
      });
      insertDeliveredItem(store, {
        projectRoot: projectA,
        rawPrompt: 'p',
        enhancedPrompt: 'ep',
        isEnhanced: true,
        stage: 'idea',
        stageConfidence: 1.0,
        injectedContextTags: [],
        contextTokenEstimate: 10,
        processingTimeMs: 5,
      });

      deleteProjectContextData(store, projectA);

      expect(getActiveContextMemory(store, projectA)).toHaveLength(0);
      expect(getRecentDeliveredItems(store, projectA)).toHaveLength(0);
    });
  });
});
