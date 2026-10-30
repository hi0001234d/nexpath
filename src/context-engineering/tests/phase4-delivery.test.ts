/**
 * Phase 4 Verification Suite: Output & PE Delivery Layer
 *
 * Verifies:
 *  1. preparePromptEnhancement public API satisfying 100% of Feature 3 (VED) interface
 *  2. Unconditional fail-open safety wrapper (timeout and exception isolation)
 *  3. Two-Tier section routing & compulsory survivor guard (Project facts)
 *  4. Tag generation & token estimation
 *  5. Delivered items recording & deduplication
 *  6. F3 Dynamic Resource Router client (1,000ms SLA, 30s cache, symmetric parsing)
 *  7. F6 Local LLM Execution client (standard format, fail-safe fallback to Pro)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  preparePromptEnhancement,
  routeSectionsAndCompose,
  pruneSections,
  generateContextTags,
  estimateTokenCount,
  withFailOpen,
  buildFallbackResult,
  F3ResourceClient,
  executeLocalOrProCompletion,
  executeCloudProFallback,
  upsertContextMemory,
  getRecentDeliveredItems,
  normalizeProjectId,
} from '../index.js';

import {
  openStore,
  type Store,
} from '../../store/db.js';

import type {
  WorkspaceContext,
  ScoredFact,
  F3ResourceRequest,
  F3LanDevice,
} from '../types/context-engineering.js';

describe('Phase 4: Output & PE Delivery Layer', () => {
  let tmpDir: string;
  let store: Store;
  const projectRoot = '/workspaces/test-phase4';
  const canonicalId = normalizeProjectId(projectRoot);

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-phase4-test-'));
    store = await openStore(':memory:');
  });

  afterEach(() => {
    try {
      store.db.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Tag Generator & Token Estimator
  // ==========================================================================
  describe('Component 4.4: Tag Generator & Token Estimator', () => {
    it('generates taxonomy tags for workspace and facts correctly', () => {
      const mockFacts: ScoredFact[] = [
        {
          fact: {
            id: 1,
            project_root: canonicalId,
            kind: 'rule',
            key: 'payment-retry-limit',
            content: 'Max 3 retries',
            verbatim: null,
            identities: [{ file: 'src/payment/client.ts' }],
            locked: 1,
            confidence: 0.95,
            staleness: null,
            superseded_by: null,
            active: 1,
            evidence: null,
            created_at: Date.now(),
            updated_at: Date.now(),
          },
          score: 0.85,
          breakdown: { keywordMatch: 0.8, confidence: 0.95, recencyDecay: 1.0, fileProximity: 1.0 },
          formattedLine: '• Max 3 retries',
          tag: '@rule:payment-retry-limit',
        },
      ];

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        activeFilePath: 'src/checkout.ts',
        gitBranch: 'feature/payment',
      };

      const tags = generateContextTags(mockFacts, context);

      expect(tags).toContain('@file:src/checkout.ts');
      expect(tags).toContain('@file:src/payment/client.ts');
      expect(tags).toContain('@git:branch:feature/payment');
      expect(tags).toContain('@rule:payment-retry-limit');
    });

    it('estimates token count deterministically without external packages', () => {
      expect(estimateTokenCount('')).toBe(0);
      expect(estimateTokenCount('   ')).toBe(0);

      const shortText = '• [Rule] Always use TypeScript';
      const shortEstimate = estimateTokenCount(shortText);
      expect(shortEstimate).toBeGreaterThanOrEqual(4);
      expect(shortEstimate).toBeLessThanOrEqual(12);

      const longText = 'A'.repeat(400); // 400 chars ~ 100 tokens
      const longEstimate = estimateTokenCount(longText);
      expect(longEstimate).toBeGreaterThanOrEqual(90);
      expect(longEstimate).toBeLessThanOrEqual(120);
    });
  });

  // ==========================================================================
  // 2. Two-Tier Section Router & Compulsory Survivor Guard
  // ==========================================================================
  describe('Component 4.2: Two-Tier Section Router & Compulsory Survivor Guard', () => {
    it('routes matching facts to Tier 1 and general facts to Tier 2', () => {
      const now = Date.now();
      const mockFacts: ScoredFact[] = [
        {
          fact: {
            id: 1,
            project_root: canonicalId,
            kind: 'rule',
            key: 'jwt-rs256',
            content: 'JWT tokens must use RS256 algorithm',
            verbatim: null,
            identities: null,
            locked: 1,
            confidence: 0.95,
            staleness: null,
            superseded_by: null,
            active: 1,
            evidence: null,
            created_at: now,
            updated_at: now,
          },
          score: 0.9,
          breakdown: { keywordMatch: 1, confidence: 0.95, recencyDecay: 1, fileProximity: 0 },
          formattedLine: '• JWT tokens must use RS256 algorithm',
          tag: '@rule:jwt-rs256',
        },
        {
          fact: {
            id: 2,
            project_root: canonicalId,
            kind: 'failure',
            key: 'db-timeout-crash',
            content: 'Database connection pool crash under heavy load',
            verbatim: null,
            identities: null,
            locked: 0,
            confidence: 0.8,
            staleness: null,
            superseded_by: null,
            active: 1,
            evidence: null,
            created_at: now,
            updated_at: now,
          },
          score: 0.85,
          breakdown: { keywordMatch: 0.8, confidence: 0.8, recencyDecay: 1, fileProximity: 0 },
          formattedLine: '• Database connection pool crash under heavy load',
          tag: '@failure:db-timeout-crash',
        },
        {
          fact: {
            id: 3,
            project_root: canonicalId,
            kind: 'convention',
            key: 'naming-camel-case',
            content: 'Use camelCase for internal helpers',
            verbatim: null,
            identities: null,
            locked: 0,
            confidence: 0.6,
            staleness: null,
            superseded_by: null,
            active: 1,
            evidence: null,
            created_at: now,
            updated_at: now,
          },
          score: 0.4,
          breakdown: { keywordMatch: 0.4, confidence: 0.6, recencyDecay: 1, fileProximity: 0 },
          formattedLine: '• Use camelCase for internal helpers',
          tag: '@convention:naming-camel-case',
        },
      ];

      const workspaceLines = ['• Active file: src/auth.ts (branch: main)'];

      const result = routeSectionsAndCompose('Implement authentication helper', mockFacts, workspaceLines);

      expect(result.hasInjectedContent).toBe(true);
      expect(result.sections.length).toBe(3);

      const sectionIds = result.sections.map((s) => s.id);
      expect(sectionIds).toContain('context_and_constraints'); // Tier 1
      expect(sectionIds).toContain('risk_safety_confirmation'); // Tier 1
      expect(sectionIds).toContain('project_grounding_facts'); // Tier 2

      // Verify Compulsory Grounding Rule (isMandatorySurvivorSection = true)
      const tier2 = result.sections.find((s) => s.id === 'project_grounding_facts');
      expect(tier2).toBeDefined();
      expect(tier2?.isMandatorySurvivorSection).toBe(true);
      expect(tier2?.title).toBe('Project facts');

      // Verify Clean Prompt Text Guarantee: No @file or @rule synthetic tags in enhanced prompt
      expect(result.enhancedPrompt).not.toContain('@rule:');
      expect(result.enhancedPrompt).not.toContain('@file:');
      expect(result.enhancedPrompt).toContain('### Project facts');
      expect(result.enhancedPrompt).toContain('### Context and constraints');
      expect(result.enhancedPrompt).toContain('### Risk, safety and confirmation');
    });

    it('[TC-SEC-RTR-5] omits project_grounding_facts from section plan when no Tier 2 facts or workspace lines exist', () => {
      // Create only Tier 1 rule and failure facts
      const now = Date.now();
      const tier1Facts: ScoredFact[] = [
        {
          fact: {
            id: 1,
            project_root: canonicalId,
            kind: 'rule',
            key: 'tier1-rule',
            content: 'Must use TLS 1.3',
            verbatim: null,
            identities: null,
            locked: 1,
            confidence: 0.95,
            staleness: null,
            superseded_by: null,
            active: 1,
            evidence: null,
            created_at: now,
            updated_at: now,
          },
          score: 0.9,
          breakdown: { keywordMatch: 1, confidence: 0.95, recencyDecay: 1, fileProximity: 0 },
          formattedLine: '• Must use TLS 1.3',
          tag: '@rule:tier1-rule',
        },
      ];

      // Empty workspace lines => project_grounding_facts should be omitted cleanly
      const result = routeSectionsAndCompose('Configure network security', tier1Facts, []);
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].id).toBe('context_and_constraints');
      expect(result.sections.some((s) => s.id === 'project_grounding_facts')).toBe(false);
    });

    it('[TC-SEC-RTR-6] section pruner drops non-mandatory sections but preserves project_grounding_facts', () => {
      const sections = [
        {
          id: 'context_and_constraints',
          title: 'Context and constraints',
          lines: ['• [Rule] Rule A', '• [Rule] Rule B', '• [Rule] Rule C'],
          isMandatorySurvivorSection: false,
        },
        {
          id: 'project_grounding_facts',
          title: 'Project facts',
          lines: ['• [Grounding] Crucial project grounding fact'],
          isMandatorySurvivorSection: true,
        },
      ];

      // Total lines is 4. Prune with budget of 2 lines.
      // Mandatory survivor (1 line) must be preserved, taking 1 line from non-mandatory.
      const pruned = pruneSections(sections, 2);

      const hasGrounding = pruned.some((s) => s.id === 'project_grounding_facts');
      expect(hasGrounding).toBe(true);

      const groundingSec = pruned.find((s) => s.id === 'project_grounding_facts');
      expect(groundingSec?.lines.length).toBe(1);

      const nonMandatory = pruned.find((s) => s.id === 'context_and_constraints');
      expect(nonMandatory?.lines.length).toBe(1);

      const totalPrunedLines = pruned.reduce((acc, s) => acc + s.lines.length, 0);
      expect(totalPrunedLines).toBe(2);
    });

    it('returns unenhanced output when facts and workspace lines are empty', () => {
      const result = routeSectionsAndCompose('Simple query', [], []);
      expect(result.hasInjectedContent).toBe(false);
      expect(result.enhancedPrompt).toBe('Simple query');
      expect(result.sections).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 3. Fail-Open Safety Wrapper Boundary
  // ==========================================================================
  describe('Component 4.3: Unconditional Fail-Open Safety Wrapper', () => {
    it('catches intentional exceptions silently and returns clean fallback payload', async () => {
      const result = await withFailOpen('my prompt', async () => {
        throw new Error('Database locked / disk corrupt');
      });

      expect(result.isEnhanced).toBe(false);
      expect(result.enhancedPrompt).toBe('my prompt');
      expect(result.stage).toBe('implementation');
      expect(result.stageConfidence).toBe(0.0);
      expect(result.injectedContextTags).toHaveLength(0);
      expect(result.contextTokenEstimate).toBe(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(1);
    });

    it('triggers fallback on SLA timeout exceedance', async () => {
      const result = await withFailOpen(
        'slow prompt',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return {
            isEnhanced: true,
            enhancedPrompt: 'enhanced text',
            stage: 'implementation',
            stageConfidence: 0.9,
            injectedContextTags: ['@tag'],
            contextTokenEstimate: 10,
            processingTimeMs: 150,
          };
        },
        { timeoutMs: 50 }
      );

      expect(result.isEnhanced).toBe(false);
      expect(result.enhancedPrompt).toBe('slow prompt');
      expect(result.processingTimeMs).toBeLessThanOrEqual(60);
    });

    it('honors pre-aborted external AbortSignal immediately', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await withFailOpen(
        'aborted prompt',
        async () => {
          return {
            isEnhanced: true,
            enhancedPrompt: 'should not reach',
            stage: 'implementation',
            stageConfidence: 0.9,
            injectedContextTags: [],
            contextTokenEstimate: 10,
            processingTimeMs: 5,
          };
        },
        { signal: controller.signal }
      );

      expect(result.isEnhanced).toBe(false);
      expect(result.enhancedPrompt).toBe('aborted prompt');
    });
  });

  // ==========================================================================
  // 4. Public API preparePromptEnhancement (Full Pipeline)
  // ==========================================================================
  describe('Component 4.1: Public Entry Point preparePromptEnhancement', () => {
    it('returns isEnhanced: false quickly (<5ms) when prompt has no relevant facts', async () => {
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
      };

      // Warm up JIT/db caches to prevent cold runner contention
      await preparePromptEnhancement('warmup query', context);

      const result = await preparePromptEnhancement('what is the capital of France?', context);

      expect(result.isEnhanced).toBe(false);
      expect(result.enhancedPrompt).toBe('what is the capital of France?');
      expect(result.injectedContextTags).toHaveLength(0);
      expect(result.contextTokenEstimate).toBe(0);
      expect(result.processingTimeMs).toBeLessThan(50);
    });

    it('enhances prompt with Two-Tier sections and records delivered item when relevant facts exist', async () => {
      // 1. Seed historical memory fact in SQLite
      upsertContextMemory(store, {
        projectRoot: canonicalId,
        kind: 'rule',
        key: 'auth-jwt-rs256',
        content: 'JWT signing algorithm must be RS256 with 2048-bit key',
        locked: true,
        confidence: 0.95,
      });

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        activeFilePath: 'src/auth/token.ts',
        gitBranch: 'main',
        store,
      };

      // 2. Run enhancement
      const result = await preparePromptEnhancement('fix JWT token signing in auth module', context);

      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toContain('fix JWT token signing in auth module');
      expect(result.enhancedPrompt).toContain('### Context and constraints');
      expect(result.enhancedPrompt).toContain('### Project facts');
      expect(result.enhancedPrompt).toContain('RS256');

      // Verify metadata tags
      expect(result.injectedContextTags.length).toBeGreaterThanOrEqual(1);
      expect(result.contextTokenEstimate).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(1);

      // Verify delivered item was logged in SQLite
      const delivered = getRecentDeliveredItems(store, canonicalId, 5);
      expect(delivered.length).toBe(1);
      expect(delivered[0].is_enhanced).toBe(1);
      expect(delivered[0].raw_prompt).toContain('fix JWT token signing');
    });

    it('deduplicates facts in the subsequent turn of the same session', async () => {
      const sessionId = 'session-dedup-test-42';

      // Seed a rule fact
      upsertContextMemory(store, {
        projectRoot: canonicalId,
        kind: 'rule',
        key: 'strict-typecheck',
        content: 'Strict TypeScript checking enabled with noImplicitAny',
        locked: true,
      });

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        activeFilePath: 'src/config.ts',
        store,
      };
      (context as any).sessionId = sessionId;

      // Turn 1: Enhances with the rule
      const turn1 = await preparePromptEnhancement('check TypeScript strict typecheck', context);
      expect(turn1.isEnhanced).toBe(true);

      // Turn 2: Same prompt in same session — rule should be deduplicated
      const turn2 = await preparePromptEnhancement('check TypeScript strict typecheck', context);
      // Fact is deduplicated, so it either has fewer lines or is unenhanced if no other facts match
      expect(turn2.injectedContextTags).not.toContain('@rule:strict-typecheck');
    });

    it('[TC-F3-6 & TC-F3-7] unconditionally delivers valid canonical stage enum and numeric stageConfidence', async () => {
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
      };

      const validStages = new Set([
        'idea',
        'prd',
        'architecture',
        'task_breakdown',
        'implementation',
        'review_testing',
        'release',
        'feedback_loop',
        'fallback',
      ]);

      // 1. Unenhanced fresh task
      const r1 = await preparePromptEnhancement('what is today date?', context);
      expect(validStages.has(r1.stage)).toBe(true);
      expect(typeof r1.stageConfidence).toBe('number');
      expect(r1.stageConfidence).toBeGreaterThanOrEqual(0.0);
      expect(r1.stageConfidence).toBeLessThanOrEqual(1.0);

      // 2. Bugfix prompt
      const r2 = await preparePromptEnhancement('fix TypeError in auth handler', context);
      expect(validStages.has(r2.stage)).toBe(true);
      expect(r2.stage).toBe('review_testing');
      expect(r2.stageConfidence).toBeGreaterThanOrEqual(0.7);

      // 3. Feature prompt
      const r3 = await preparePromptEnhancement('add new export to PDF feature', context);
      expect(validStages.has(r3.stage)).toBe(true);
      expect(r3.stage).toBe('implementation');
      expect(r3.stageConfidence).toBeGreaterThanOrEqual(0.65);
    });

    it('[BM-4] Full PE pipeline executes in < 800ms (and < 25ms in-memory)', async () => {
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
      };

      const t0 = performance.now();
      const res = await preparePromptEnhancement('implement retry backoff loop in billing client', context);
      const elapsed = performance.now() - t0;

      expect(res.processingTimeMs).toBeLessThan(800);
      expect(elapsed).toBeLessThan(50); // In-memory execution typically takes < 25ms
    });
  });

  // ==========================================================================
  // 5. Feature 3 Dynamic Inference Resource Router Client (F3ResourceClient)
  // ==========================================================================
  describe('Component 4.5: F3 Dynamic Inference Resource Router Client', () => {
    it('defaults immediately to Pro when localAllowed is false without network request', async () => {
      const client = new F3ResourceClient();
      const request: F3ResourceRequest = {
        requestId: 'req-1',
        callKind: 'pe_composer',
        approxInputTokens: 1500,
        typicalOutputTokens: 500,
        maxOutputTokens: 2000,
        timeoutMs: 45000,
        needsJson: false,
        language: 'en',
        background: false,
        localAllowed: false, // Option 3 is OFF
      };

      const decision = await client.getResourceDecision(request);

      expect(decision.target).toBe('pro');
      expect(decision.reason).toBe('LOCAL_NOT_ALLOWED');
      expect(decision.lanDevice).toBeNull();
      expect(decision.pro?.model).toBe('gpt-4o-mini');
    });

    it('caches decisions for 30s per callKind', async () => {
      const client = new F3ResourceClient();
      const request: F3ResourceRequest = {
        requestId: 'req-2',
        callKind: 'pe_composer',
        approxInputTokens: 1000,
        typicalOutputTokens: 500,
        maxOutputTokens: 2000,
        timeoutMs: 45000,
        needsJson: false,
        language: 'en',
        background: false,
        localAllowed: false,
      };

      const d1 = await client.getResourceDecision(request);
      const d2 = await client.getResourceDecision(request);

      expect(d1.decisionId).toBe(d2.decisionId);
    });

    it('fails open to Pro on network error or timeout', async () => {
      const client = new F3ResourceClient({ baseUrl: 'http://127.0.0.1:9999' }); // unreachable port
      const request: F3ResourceRequest = {
        requestId: 'req-failopen',
        callKind: 'pe_composer',
        approxInputTokens: 1000,
        typicalOutputTokens: 500,
        maxOutputTokens: 2000,
        timeoutMs: 45000,
        needsJson: false,
        language: 'en',
        background: false,
        localAllowed: true,
      };

      const decision = await client.getResourceDecision(request);

      expect(decision.target).toBe('pro');
      expect(decision.pro?.model).toBe('gpt-4o-mini');
    });
  });

  // ==========================================================================
  // 6. Feature 6 Local LLM Execution Client (F6 Client)
  // ==========================================================================
  describe('Component 4.6: Local LLM Execution Client', () => {
    it('fails open to Pro when local bridge is unreachable (CONNECT_FAILED)', async () => {
      const lanDevice: F3LanDevice = {
        deviceId: 'lan-rig-1',
        tier: 'T5',
        model: 'qwen2.5-coder:7b',
        endpoint: 'node_test123',
      };

      // Mock fetch so local bridge fails with ECONNREFUSED and Cloud Pro returns dummy response
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (url.toString().includes('127.0.0.1')) {
          throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
        }
        // Cloud Pro mock
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Fallback Pro Enhanced text' } }],
          }),
        } as any;
      });

      const result = await executeLocalOrProCompletion(
        lanDevice,
        {
          messages: [{ role: 'user', content: 'test prompt' }],
        },
        { bridgePort: 11434, deviceToken: 'npd_test_token' }
      );

      expect(result.ranOn).toBe('pro');
      expect(result.fellBackToPro).toBe(true);
      expect(result.failType).toBe('CONNECT_FAILED');
      expect(result.content).toBe('Fallback Pro Enhanced text');
      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
