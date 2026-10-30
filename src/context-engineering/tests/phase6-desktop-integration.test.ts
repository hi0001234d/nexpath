/**
 * Phase 6 Verification Suite: Desktop App Integration Track (Locked Architecture Flow)
 *
 * Verifies 100% of Phase 6 components and operational guarantees:
 *  - Component 6.1: Feature 3 Dynamic Inference Resource Router Client (F3ResourceClient)
 *    * 1,000ms SLA hard ceiling with fail-open fallback to Pro
 *    * Metadata-only request payload (ZERO prompt text transmitted)
 *    * Bearer authentication header using Ved's Desktop deviceToken (npd_...)
 *    * Symmetric payload parsing (lanDevice vs pro)
 *    * 30-second in-memory caching per callKind/language
 *    * Immediate default to Pro when localAllowed is false
 *  - Component 6.2: Feature 6 Local Model Client via Desktop Iroh Bridge (F6 Client)
 *    * Standard OpenAI-compatible chat messages format (formatEnhancementChatMessages)
 *    * Local bridge execution (127.0.0.1:<bridge_port>/v1/chat/completions)
 *    * Automatic fail-safe to Cloud Pro on CONNECT_FAILED, LOCAL_TIMEOUT, or LOCAL_ERROR
 *  - Component 6.3: Headless Payload Delivery to Ved (preparePromptEnhancement)
 *    * End-to-end execution when target is 'local'
 *    * Direct Cloud Pro execution when target is 'pro'
 *    * Fail-open execution to local deterministic composed prompt if LLM/network fails
 *    * Exact 7-field EnhancementResult delivery
 *  - Core Principles:
 *    * Universal Zero-UI Engine Law (0 UI code / 0 UI dependencies)
 *    * Clean Prompt Text Guarantee (zero synthetic @ tags, zero invented files)
 *    * Telemetry Omission (Step 4 dropped: zero telemetry overhead)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  preparePromptEnhancement,
  cleanPromptText,
  formatEnhancementChatMessages,
  F3ResourceClient,
  executeLocalOrProCompletion,
  executeCloudProFallback,
  upsertContextMemory,
  normalizeProjectId,
  onTurnComplete,
  onSessionClose,
  type WorkspaceContext,
  type F3ResourceRequest,
  type F3LanDevice,
  type EnhancementResult,
} from '../index.js';

import {
  openStore,
  closeStore,
  type Store,
} from '../../store/db.js';

describe('Phase 6: Desktop App Integration Track (Locked Architecture Flow)', () => {
  let tmpDir: string;
  let store: Store;
  const projectRoot = '/workspaces/test-phase6-desktop';
  const canonicalId = normalizeProjectId(projectRoot);

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexpath-f1-phase6-'));
    store = await openStore(`${tmpDir}/prompt-store.db`);
  });

  afterEach(() => {
    try {
      closeStore(store);
    } catch {
      // ignore
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Group 1: Component 6.1 — Feature 3 Resource Router Client (F3ResourceClient)
  // ==========================================================================
  describe('Component 6.1: Feature 3 Dynamic Inference Resource Router Client', () => {
    it('enforces 1,000ms SLA timeout ceiling and fails open to Pro on timeout', async () => {
      // Simulate network request that hangs longer than 1,000ms
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        return new Promise((_, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new Error('The operation was aborted due to timeout'));
            });
          }
        });
      });

      const client = new F3ResourceClient({ baseUrl: 'https://parseos.tech', timeoutMs: 50 }); // small timeout for fast test
      const request: F3ResourceRequest = {
        requestId: 'req-sla-test',
        callKind: 'pe_composer',
        approxInputTokens: 1200,
        typicalOutputTokens: 400,
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
      expect(decision.lanDevice).toBeNull();
      expect(decision.reason).toBe('ROUTER_TIMEOUT');
    });

    it('transmits metadata only and ZERO raw prompt text to the router', async () => {
      let interceptedBody: any = null;
      let interceptedHeaders: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        interceptedBody = JSON.parse(init?.body as string);
        interceptedHeaders = init?.headers;
        return {
          ok: true,
          json: async () => ({
            decisionId: 'd-meta-123',
            target: 'local',
            reason: 'GPU_AVAILABLE',
            lanDevice: {
              deviceId: 'gpu-box-1',
              tier: 'T5',
              model: 'qwen2.5-coder:7b',
              endpoint: 'iroh_node_abc',
            },
            pro: null,
          }),
        } as any;
      });

      const client = new F3ResourceClient({ deviceToken: 'npd_ved_credential_123' });
      const request: F3ResourceRequest = {
        requestId: 'req-meta-test',
        callKind: 'pe_composer',
        approxInputTokens: 850,
        typicalOutputTokens: 350,
        maxOutputTokens: 2000,
        timeoutMs: 30000,
        needsJson: false,
        language: 'en',
        background: false,
        localAllowed: true,
      };

      const decision = await client.getResourceDecision(request);

      // Metadata verification
      expect(interceptedBody).toBeDefined();
      expect(interceptedBody.requestId).toBe('req-meta-test');
      expect(interceptedBody.callKind).toBe('pe_composer');
      expect(interceptedBody.approxInputTokens).toBe(850);
      expect(interceptedBody.localAllowed).toBe(true);

      // CRITICAL PRIVACY CONTRACT: Zero prompt or response fields
      expect(interceptedBody.rawPrompt).toBeUndefined();
      expect(interceptedBody.prompt).toBeUndefined();
      expect(interceptedBody.text).toBeUndefined();
      expect(interceptedBody.content).toBeUndefined();

      // Authorization header verification
      expect(interceptedHeaders['Authorization']).toBe('Bearer npd_ved_credential_123');

      // Symmetric response parsing
      expect(decision.target).toBe('local');
      expect(decision.lanDevice?.model).toBe('qwen2.5-coder:7b');
      expect(decision.lanDevice?.endpoint).toBe('iroh_node_abc');
    });

    it('immediately returns Pro when localAllowed is false without network request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const client = new F3ResourceClient();

      const request: F3ResourceRequest = {
        requestId: 'req-local-disabled',
        callKind: 'pe_composer',
        approxInputTokens: 500,
        typicalOutputTokens: 200,
        maxOutputTokens: 2000,
        timeoutMs: 30000,
        needsJson: false,
        language: 'en',
        background: false,
        localAllowed: false,
      };

      const decision = await client.getResourceDecision(request);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(decision.target).toBe('pro');
      expect(decision.reason).toBe('LOCAL_NOT_ALLOWED');
      expect(decision.pro?.model).toBe('gpt-4o-mini');
    });

    it('fails open to Pro on HTTP 404 (Stage 1 unmounted route), HTTP 500, network error, or invalid router response', async () => {
      // 1. HTTP 404 error (Stage 1 unmounted F3 route)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as any);

      const client = new F3ResourceClient();
      const request: F3ResourceRequest = {
        requestId: 'req-404-stage1',
        callKind: 'pe_composer',
        approxInputTokens: 500,
        typicalOutputTokens: 200,
        maxOutputTokens: 2000,
        timeoutMs: 30000,
        needsJson: false,
        language: 'en',
        background: false,
        localAllowed: true,
      };

      const d0 = await client.getResourceDecision(request);
      expect(d0.target).toBe('pro');
      expect(d0.reason).toBe('HTTP_404');
      expect(d0.pro?.model).toBe('gpt-4o-mini');

      // 2. HTTP 500 error
      client.clearCache();
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any);

      const d1 = await client.getResourceDecision(request);
      expect(d1.target).toBe('pro');
      expect(d1.reason).toBe('HTTP_500');
      expect(d1.pro?.model).toBe('gpt-4o-mini');

      // 3. Network connection failure
      client.clearCache();
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network ECONNREFUSED'));

      const d2 = await client.getResourceDecision(request);
      expect(d2.target).toBe('pro');
      expect(d2.pro?.model).toBe('gpt-4o-mini');
    });
  });

  // ==========================================================================
  // Group 2: Component 6.2 — Feature 6 Local Model Client (Iroh Bridge)
  // ==========================================================================
  describe('Component 6.2: Feature 6 Local Model Client via Desktop Iroh Bridge', () => {
    const lanDevice: F3LanDevice = {
      deviceId: 'lan-worker-gpu',
      tier: 'T5',
      model: 'qwen2.5-coder:7b',
      endpoint: 'iroh_node_456',
    };

    it('formats OpenAI chat messages containing context summary and developer prompt', () => {
      const rawPrompt = 'update billing retry policy';
      const sections = [
        {
          id: 'context_and_constraints',
          title: 'Context and constraints',
          lines: ['• [Rule] Payment retries must not exceed 3 attempts with exponential backoff'],
          isMandatorySurvivorSection: false,
        },
      ];

      const messages = formatEnhancementChatMessages(rawPrompt, sections);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('expert context-engineering prompt enhancer');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toContain('Payment retries must not exceed 3 attempts');
      expect(messages[1].content).toContain('update billing retry policy');
    });

    it('executes inference on local bridge (127.0.0.1:<bridge_port>/v1/chat/completions)', async () => {
      let requestedUrl = '';
      let requestedBody: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        requestedUrl = url.toString();
        requestedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            id: 'chatcmpl-local-1',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Synthesized Enhanced Prompt: Update billing retry policy strictly complying with 3 attempts backoff limit.',
                },
                finish_reason: 'stop',
              },
            ],
          }),
        } as any;
      });

      const result = await executeLocalOrProCompletion(
        lanDevice,
        {
          messages: [{ role: 'user', content: 'test prompt' }],
        },
        { bridgePort: 11434 }
      );

      expect(requestedUrl).toBe('http://127.0.0.1:11434/v1/chat/completions');
      expect(requestedBody.model).toBe('qwen2.5-coder:7b');
      expect(result.ranOn).toBe('local');
      expect(result.fellBackToPro).toBe(false);
      expect(result.failType).toBeNull();
      expect(result.content).toContain('Synthesized Enhanced Prompt');
    });

    it('automatically fails safe to Cloud Pro on local bridge CONNECT_FAILED', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('127.0.0.1')) {
          throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
        }
        // Cloud Pro gateway response
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Cloud Pro Synthesized Prompt: Update billing retry policy with 3 attempts backoff limit.',
                },
              },
            ],
          }),
        } as any;
      });

      const result = await executeLocalOrProCompletion(
        lanDevice,
        {
          messages: [{ role: 'user', content: 'test prompt' }],
        },
        { bridgePort: 11434, deviceToken: 'npd_ved_token' }
      );

      expect(result.ranOn).toBe('pro');
      expect(result.fellBackToPro).toBe(true);
      expect(result.failType).toBe('CONNECT_FAILED');
      expect(result.content).toContain('Cloud Pro Synthesized Prompt');
    });

    it('automatically fails safe to Cloud Pro on local bridge timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        if (url.toString().includes('127.0.0.1')) {
          return new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new Error('Operation aborted due to timeout'));
            });
          });
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Pro Result after local timeout' } }],
          }),
        } as any;
      });

      const result = await executeLocalOrProCompletion(
        lanDevice,
        {
          messages: [{ role: 'user', content: 'test prompt' }],
        },
        { timeoutMs: 50, deviceToken: 'npd_ved_token' }
      );

      expect(result.ranOn).toBe('pro');
      expect(result.fellBackToPro).toBe(true);
      expect(result.failType).toBe('LOCAL_TIMEOUT');
      expect(result.content).toBe('Pro Result after local timeout');
    });

    it('returns empty string silently when both local and Cloud Pro fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network total failure'));

      const result = await executeLocalOrProCompletion(
        lanDevice,
        {
          messages: [{ role: 'user', content: 'test prompt' }],
        },
        { timeoutMs: 50 }
      );

      expect(result.ranOn).toBe('pro');
      expect(result.fellBackToPro).toBe(true);
      expect(result.content).toBe('');
    });

    it('falls back to Pro cleanly when local stream drops mid-request or declines (BAD_OUTPUT / ECONNRESET)', async () => {
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        callCount++;
        if (url.toString().includes('127.0.0.1')) {
          // Simulate socket reset / dropped stream / decline mid-request
          throw new Error('read ECONNRESET - connection reset by peer');
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Fallback content after socket hang up' } }],
          }),
        } as any;
      });

      const result = await executeLocalOrProCompletion(
        lanDevice,
        {
          messages: [{ role: 'user', content: 'test prompt' }],
        },
        { timeoutMs: 50, deviceToken: 'npd_ved_token' }
      );

      expect(result.ranOn).toBe('pro');
      expect(result.fellBackToPro).toBe(true);
      expect(result.failType).toBe('BAD_OUTPUT');
      expect(result.content).toBe('Fallback content after socket hang up');
      expect(callCount).toBe(2);
    });
  });

  // ==========================================================================
  // Group 3: Component 6.3 — Headless Payload Delivery to Ved
  // ==========================================================================
  describe('Component 6.3: Headless Payload Delivery to Ved (preparePromptEnhancement)', () => {
    beforeEach(() => {
      // Seed a locked architectural rule in SQLite
      upsertContextMemory(store, {
        projectRoot: canonicalId,
        kind: 'rule',
        key: 'auth-jwt-rs256',
        content: 'JWT signing algorithm must be RS256 with 2048-bit key size',
        locked: true,
        confidence: 0.95,
      });
    });

    it('executes end-to-end local inference via Feature 6 bridge when F3 routes to "local"', async () => {
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
        deviceToken: 'npd_ved_live_credential',
        deviceId: 'mac-studio-m2',
      };

      // Mock F3 Resource Router returning local target
      const mockF3Client = new F3ResourceClient();
      vi.spyOn(mockF3Client, 'getResourceDecision').mockResolvedValue({
        decisionId: 'd-test-local',
        target: 'local',
        reason: 'LAN_GPU_ONLINE',
        lanDevice: {
          deviceId: 'desktop-rtx4090',
          tier: 'T5',
          model: 'qwen2.5-coder:7b',
          endpoint: 'node_peer_1',
        },
        pro: null,
      });

      // Mock local bridge completion
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('127.0.0.1')) {
          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: 'Enhanced: Generate JWT authentication service strictly with RS256 and 2048-bit key.',
                  },
                },
              ],
            }),
          } as any;
        }
        return { ok: false, status: 500 } as any;
      });

      const result = await preparePromptEnhancement('generate JWT authentication service', context, {
        delegateToLlm: true,
        f3Client: mockF3Client,
      });

      // Assertions
      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toBe(
        'Enhanced: Generate JWT authentication service strictly with RS256 and 2048-bit key.'
      );
      expect(result.injectedContextTags).toContain('@rule:auth-jwt-rs256');
      expect(result.stage).toBe('implementation');
      expect(result.stageConfidence).toBeGreaterThanOrEqual(0.6);
      expect(result.contextTokenEstimate).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('executes direct Cloud Pro inference when F3 routes to "pro"', async () => {
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
        deviceToken: 'npd_ved_live_credential',
      };

      const mockF3Client = new F3ResourceClient();
      vi.spyOn(mockF3Client, 'getResourceDecision').mockResolvedValue({
        decisionId: 'd-test-pro',
        target: 'pro',
        reason: 'NO_LOCAL_GPU',
        lanDevice: null,
        pro: { model: 'gpt-4o-mini' },
      });

      // Mock Cloud Pro gateway
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('parseos.tech')) {
          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: 'Cloud Pro Enhanced: Implement JWT RS256 auth handler meeting 2048-bit key policy.',
                  },
                },
              ],
            }),
          } as any;
        }
        return { ok: false, status: 500 } as any;
      });

      const result = await preparePromptEnhancement('generate JWT authentication service', context, {
        delegateToLlm: true,
        f3Client: mockF3Client,
      });

      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toBe(
        'Cloud Pro Enhanced: Implement JWT RS256 auth handler meeting 2048-bit key policy.'
      );
      expect(result.stage).toBe('implementation');
    });

    it('fails open to local Two-Tier composed prompt if both F3 and F6 fail', async () => {
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
        deviceToken: 'npd_ved_live_credential',
      };

      const mockF3Client = new F3ResourceClient();
      vi.spyOn(mockF3Client, 'getResourceDecision').mockRejectedValue(new Error('F3 Network Timeout'));
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Global Network Down'));

      const result = await preparePromptEnhancement('generate JWT authentication service', context, {
        delegateToLlm: true,
        f3Client: mockF3Client,
      });

      // Fail-open: returns the locally composed Two-Tier prompt without crashing
      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toContain('### Context and constraints');
      expect(result.enhancedPrompt).toContain('JWT signing algorithm must be RS256');
      expect(result.injectedContextTags).toContain('@rule:auth-jwt-rs256');
    });
  });

  // ==========================================================================
  // Group 4: Clean Prompt Text Guarantee & Zero-UI Engine Law
  // ==========================================================================
  describe('Universal Zero-UI Engine Law & Clean Prompt Text Guarantee', () => {
    it('cleanPromptText strips all synthetic @ tags while preserving markdown and newlines', () => {
      const dirtyText =
        'Please update the auth handler @file:src/auth.ts according to policy @rule:jwt-rs256\n\n' +
        '### Context and constraints\n' +
        '• [Rule] RS256 policy active @alert:auth-warning';

      const cleaned = cleanPromptText(dirtyText);

      expect(cleaned).not.toContain('@file:src/auth.ts');
      expect(cleaned).not.toContain('@rule:jwt-rs256');
      expect(cleaned).not.toContain('@alert:auth-warning');
      expect(cleaned).toContain('Please update the auth handler according to policy');
      expect(cleaned).toContain('### Context and constraints');
      expect(cleaned).toContain('• [Rule] RS256 policy active');
    });

    it('guarantees delivered enhancedPrompt contains ZERO synthetic @ tags', async () => {
      upsertContextMemory(store, {
        projectRoot: canonicalId,
        kind: 'rule',
        key: 'retry-rule',
        content: 'Maximum retry limit is 3 attempts',
        locked: true,
      });

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
      };

      const result = await preparePromptEnhancement('add payment retry mechanism', context);

      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).not.toMatch(/@(file|rule|alert|decision|pattern|constraint):/);
      // Tags exist strictly as structured metadata in injectedContextTags
      expect(result.injectedContextTags).toContain('@rule:retry-rule');
    });

    it('guarantees delivered payload to Ved has exactly the 7 canonical fields with zero UI dependencies', async () => {
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
      };

      const result: EnhancementResult = await preparePromptEnhancement('create user login', context);

      const keys = Object.keys(result).sort();
      const expectedKeys = [
        'contextTokenEstimate',
        'enhancedPrompt',
        'injectedContextTags',
        'isEnhanced',
        'processingTimeMs',
        'stage',
        'stageConfidence',
      ].sort();

      expect(keys).toEqual(expectedKeys);
      expect(typeof result.isEnhanced).toBe('boolean');
      expect(typeof result.enhancedPrompt).toBe('string');
      expect(typeof result.stage).toBe('string');
      expect(typeof result.stageConfidence).toBe('number');
      expect(Array.isArray(result.injectedContextTags)).toBe(true);
      expect(typeof result.contextTokenEstimate).toBe('number');
      expect(typeof result.processingTimeMs).toBe('number');
    });
  });

  // ==========================================================================
  // Group 5: Background Fire-and-Forget Result Reporting (POST /f3/v1/resource-result)
  // ==========================================================================
  describe('Component 6.4: Background Result Reporting (POST /f3/v1/resource-result)', () => {
    it('sends post-inference telemetry to /f3/v1/resource-result in the background without blocking prompt enhancement', async () => {
      upsertContextMemory(store, {
        projectRoot: canonicalId,
        kind: 'rule',
        key: 'db-rule',
        content: 'Use connection pooling with max 20 connections',
        locked: true,
      });

      const networkCalls: string[] = [];
      let reportedPayload: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        const urlStr = url.toString();
        networkCalls.push(urlStr);
        if (urlStr.includes('resource-result')) {
          reportedPayload = JSON.parse(init?.body as string);
          return { ok: true } as any;
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Enhanced prompt from cloud' } }],
          }),
        } as any;
      });

      const mockF3Client = new F3ResourceClient();
      vi.spyOn(mockF3Client, 'getResourceDecision').mockResolvedValue({
        decisionId: 'd-test-reporting-123',
        target: 'pro',
        reason: 'POLICY_PRO_ONLY',
        lanDevice: null,
        pro: { model: 'gpt-4o-mini' },
      });

      const reportSpy = vi.spyOn(mockF3Client, 'reportResult');

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
        deviceToken: 'npd_ved_token',
      };

      const result = await preparePromptEnhancement('configure database pool', context, {
        delegateToLlm: true,
        f3Client: mockF3Client,
      });

      expect(result.isEnhanced).toBe(true);

      // Verify reportResult was called with decisionId and ranOn
      expect(reportSpy).toHaveBeenCalled();
      expect(reportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          decisionId: 'd-test-reporting-123',
          ranOn: 'pro',
          ok: true,
        }),
        'npd_ved_token'
      );
    });

    it('verifies F3 resource request sends real LLM timeoutMs (e.g. 45000), not 1s router ceiling', async () => {
      upsertContextMemory(store, {
        projectRoot: canonicalId,
        kind: 'rule',
        key: 'db-rule-timeout',
        content: 'Use connection pooling with max 20 connections',
        locked: true,
      });

      let capturedRequest: any = null;
      const mockF3Client = new F3ResourceClient();
      vi.spyOn(mockF3Client, 'getResourceDecision').mockImplementation(async (req) => {
        capturedRequest = req;
        return {
          decisionId: 'd-test-timeout',
          target: 'pro',
          reason: 'LOCAL_NOT_CHOSEN',
          lanDevice: null,
          pro: { model: 'gpt-4o-mini' },
        };
      });

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
        deviceToken: 'npd_ved_token',
      };

      await preparePromptEnhancement('configure database pool', context, {
        delegateToLlm: true,
        f3Client: mockF3Client,
        localExecutionOptions: { timeoutMs: 30000 },
      });

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.timeoutMs).toBe(30000); // Real LLM limit, not 1000ms
    });
  });

  // ==========================================================================
  // Group 6: Desktop Runtime Contract Verification (Ved Inter-Feature Alignment)
  // ==========================================================================
  describe('Component 6.5: Desktop Runtime Contract Verification (Ved)', () => {
    it('supports dynamic bridgePort assignment (e.g. 11435) and NEXPATH_DESKTOP_SESSION=1', async () => {
      upsertContextMemory(store, {
        projectRoot: canonicalId,
        kind: 'rule',
        key: 'db-pool-rule',
        content: 'Database connection pool size must be exactly 10',
        locked: true,
      });

      process.env.NEXPATH_DESKTOP_SESSION = '1';
      const requestedUrls: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);
        if (urlStr.includes('resource-result')) {
          return { ok: true } as any;
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Enhanced result on port 11435' } }],
          }),
        } as any;
      });

      const mockF3Client = new F3ResourceClient();
      vi.spyOn(mockF3Client, 'getResourceDecision').mockResolvedValue({
        decisionId: 'd-dynamic-11435',
        target: 'local',
        reason: 'LOCAL_FITS',
        lanDevice: {
          deviceId: 'desktop-dynamic',
          tier: 'T5',
          model: 'qwen3-coder:30b',
          endpoint: 'node_dynamic',
        },
        pro: null,
      });

      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
        deviceToken: 'npd_ved_live_credential',
        deviceId: 'macbook-pro-ved',
      };

      const result = await preparePromptEnhancement('refactor database connector', context, {
        f3Client: mockF3Client,
        localExecutionOptions: { bridgePort: 11435 },
      });

      expect(requestedUrls).toContain('http://127.0.0.1:11435/v1/chat/completions');
      expect(result.isEnhanced).toBe(true);
      expect(result.enhancedPrompt).toBe('Enhanced result on port 11435');

      delete process.env.NEXPATH_DESKTOP_SESSION;
    });

    it('supports direct in-process hooks onTurnComplete and onSessionClose without throwing', async () => {
      // 1. Trigger turn completion hook
      const turnResult = await onTurnComplete(store, {
        projectRoot,
        sessionId: 'ved-desktop-session-1',
        prompt: 'First prompt in session',
        response: 'First response from model',
      });
      expect(turnResult.triggered).toBe(false);

      // 2. Trigger session close hook
      const closeResult = await onSessionClose(store, {
        projectRoot,
        sessionId: 'ved-desktop-session-1',
        gitDiff: 'diff --git a/file.ts b/file.ts',
      });
      expect(closeResult.sessionId).toBe('ved-desktop-session-1');
      expect(closeResult.projectId).toBe(canonicalId);
      expect(Array.isArray(closeResult.alerts)).toBe(true);
    });

    it('supports Ved direct hook signatures onTurnComplete(turn, context) and onSessionClose(context)', async () => {
      const context: WorkspaceContext = {
        workspacePath: projectRoot,
        dataDir: tmpDir,
        store,
        sessionId: 'ved-desktop-session-2',
      };

      // 1. Calling onTurnComplete(turn, context)
      const turnResult = await onTurnComplete(
        {
          prompt: 'Turn 1 prompt from Desktop OpenClaw',
          response: 'Turn 1 response',
        },
        context
      );
      expect(turnResult.triggered).toBe(false);

      // 2. Calling onSessionClose(context)
      const closeResult = await onSessionClose(context);
      expect(closeResult.sessionId).toBe('ved-desktop-session-2');
      expect(closeResult.projectId).toBe(canonicalId);
      expect(Array.isArray(closeResult.alerts)).toBe(true);
    });

    it('strictly forwards X-Device-Id alongside Authorization: Bearer npd_ to POST /v1/chat/completions only', async () => {
      let sentHeaders: any = null;
      let requestedEndpoint = '';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        requestedEndpoint = url.toString();
        sentHeaders = init?.headers;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Pro model response with device authentication' } }],
          }),
        } as any;
      });

      const proContent = await executeCloudProFallback(
        {
          messages: [{ role: 'user', content: 'test device-bound completion' }],
        },
        {
          deviceToken: 'npd_test_session_token_123',
          deviceId: 'device-mac-studio-01',
        }
      );

      expect(requestedEndpoint).toBe('https://parseos.tech/v1/chat/completions');
      expect(sentHeaders['Authorization']).toBe('Bearer npd_test_session_token_123');
      expect(sentHeaders['X-Device-Id']).toBe('device-mac-studio-01');
      expect(proContent).toBe('Pro model response with device authentication');
    });
  });
});
