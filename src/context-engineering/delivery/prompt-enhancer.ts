/**
 * Feature 1 — Context Engineering: Primary Pipeline Orchestrator & Public API Entry Point (Module 10)
 *
 * Implements preparePromptEnhancement(rawPrompt, context, options) satisfying 100% of the
 * Feature 3 (VED) TypeScript interface, SLA (<2500ms hard ceiling, <800ms target),
 * and Universal Zero-UI Engine Law.
 *
 * Execution Pipeline:
 *  1. withFailOpen wrapper boundary (timer race, zero unhandled errors).
 *  2. Project scope normalization (normalizeProjectId).
 *  3. Sub-5ms Gap Detector (detectPromptGaps).
 *  4. Deterministic Task Classifier (classifyTask).
 *  5. SQLite Historical Map query (getActiveContextMemory).
 *  6. 10-Line Budget Ranking & Deduplication Engine (rankAndAllocateBudget).
 *  7. Two-Tier Section Routing (routeSectionsAndCompose).
 *  8. Metadata tag generation & token estimation (generateContextTags, estimateTokenCount).
 *  9. Delivered items recording (insertDeliveredItem).
 *  10. Return synchronized 7-field EnhancementResult.
 */

import { openStore, closeStore, type Store } from '../../store/db.js';
import { normalizeProjectId } from '../core/project-scope.js';
import {
  getActiveContextMemory,
  getDeliveredTags,
  insertDeliveredItem,
} from '../store/historical-map-store.js';
import { detectPromptGaps } from '../retrieval/gap-detector.js';
import { classifyTask } from '../retrieval/task-classifier.js';
import { rankAndAllocateBudget } from '../retrieval/budget-ranker.js';
import { routeSectionsAndCompose } from './section-router.js';
import { generateContextTags, estimateTokenCount } from './tag-generator.js';
import { withFailOpen } from './fail-open.js';
import { F3ResourceClient } from '../clients/f3-resource-client.js';
import {
  executeLocalOrProCompletion,
  executeCloudProFallback,
  formatEnhancementChatMessages,
} from '../clients/f6-delegation-client.js';

import type {
  WorkspaceContext,
  EnhancementOptions,
  EnhancementResult,
  EnhancementStage,
  TaskType,
  F3ResourceRequest,
  F3FailType,
} from '../types/context-engineering.js';

/**
 * Sanitizes prompt text by stripping synthetic context tag tokens (@file:..., @rule:..., @alert:...).
 * Guarantees Clean Prompt Text rule for headless payload delivery to Ved.
 */
export function cleanPromptText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/@(file|rule|alert|decision|pattern|constraint):[^\s]+/gi, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Maps local execution failure strings to canonical F3FailType.
 * F3 M8 contract: LOCAL_TIMEOUT, LOCAL_ERROR, CONNECT_FAILED, BAD_OUTPUT.
 */
function mapToF3FailType(failType: string | null): F3FailType | null {
  if (!failType) return null;
  switch (failType) {
    case 'CONNECT_FAILED':
    case 'conn_refused':
      return 'CONNECT_FAILED';
    case 'LOCAL_TIMEOUT':
    case 'timeout':
      return 'LOCAL_TIMEOUT';
    case 'BAD_OUTPUT':
      return 'BAD_OUTPUT';
    case 'LOCAL_ERROR':
    default:
      return 'LOCAL_ERROR';
  }
}

/**
 * Public entry point for Prompt Enhancement invoked by Desktop Runtime and Nexpath CLI.
 * Strictly adheres to Universal Zero-UI Law (headless) and Clean Prompt Text Guarantee.
 */
export async function preparePromptEnhancement(
  rawPrompt: string,
  context?: WorkspaceContext,
  options?: EnhancementOptions
): Promise<EnhancementResult> {
  return withFailOpen(
    rawPrompt,
    async (signal) => {
      const startTime = performance.now();

      // 1. Sanity check: Empty or whitespace prompts immediately return unenhanced
      if (!rawPrompt || typeof rawPrompt !== 'string' || rawPrompt.trim().length === 0) {
        return {
          isEnhanced: false,
          enhancedPrompt: rawPrompt || '',
          stage: 'implementation',
          stageConfidence: 0.0,
          injectedContextTags: [],
          contextTokenEstimate: 0,
          processingTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        };
      }

      // Check abort signal
      if (signal.aborted) {
        throw new Error('Enhancement aborted by signal');
      }

      // 2. Normalize Project ID & Session ID
      const workspacePath = context?.workspacePath || process.cwd();
      const projectId = normalizeProjectId(workspacePath);
      const sessionId = (context as any)?.sessionId || undefined;

      // 3. Sub-5ms Gap Detector
      const gapAnalysis = detectPromptGaps(rawPrompt, context);

      // 4. Deterministic Task Classifier
      const taskClassification = classifyTask(rawPrompt);
      const stage = mapTaskToStage(taskClassification.taskType);
      const stageConfidence = taskClassification.confidence;

      // 5. Open SQLite store (reuse provided store or open isolated project DB)
      let store: Store;
      let shouldCloseStore = false;

      if (context?.store) {
        store = context.store;
      } else {
        const dbPath = context?.dataDir ? `${context.dataDir}/prompt-store.db` : undefined;
        store = await openStore(dbPath);
        shouldCloseStore = true;
      }

      try {
        if (signal.aborted) {
          throw new Error('Enhancement aborted by signal');
        }

        // 6. Query active memory facts for this project
        const candidateFacts = getActiveContextMemory(store, projectId);

        // 7. Retrieve session delivered tags for deduplication
        const deliveredTags = getDeliveredTags(store, projectId, sessionId);

        // 8. 10-Line Budget Ranking & Deduplication
        const budgetResult = rankAndAllocateBudget(
          rawPrompt,
          candidateFacts,
          taskClassification.taskType,
          {
            context,
            deliveredTags,
            sessionId,
            maxTotalLines: 10,
          }
        );

        // 9. If no relevant facts qualify, return unenhanced cleanly (<5ms)
        if (budgetResult.allocatedLines.length === 0 && budgetResult.workspaceLines.length === 0) {
          return {
            isEnhanced: false,
            enhancedPrompt: rawPrompt,
            stage,
            stageConfidence,
            injectedContextTags: [],
            contextTokenEstimate: 0,
            processingTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
          };
        }

        // 10. Two-Tier Section Routing & Prompt Composition
        const routingResult = routeSectionsAndCompose(
          rawPrompt,
          budgetResult.allocatedLines,
          budgetResult.workspaceLines
        );

        if (!routingResult.hasInjectedContent) {
          return {
            isEnhanced: false,
            enhancedPrompt: rawPrompt,
            stage,
            stageConfidence,
            injectedContextTags: [],
            contextTokenEstimate: 0,
            processingTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
          };
        }

        // 11. Generate metadata tags & token estimate
        const injectedContextTags = generateContextTags(budgetResult.allocatedLines, context);
        const injectedTextOnly = routingResult.sections.map((s) => s.lines.join('\n')).join('\n');
        const contextTokenEstimate = estimateTokenCount(injectedTextOnly);

        // 12. Desktop App Track: LLM Synthesis Delegation via F3 / F6 / Pro (Phase 6)
        let finalEnhancedPrompt = routingResult.enhancedPrompt;
        const isDesktopOrLlmMode = Boolean(
          options?.delegateToLlm ||
          options?.f3Client ||
          context?.deviceToken ||
          process.env.NEXPATH_DESKTOP_SESSION === '1'
        );

        if (isDesktopOrLlmMode && routingResult.sections.length > 0) {
          try {
            const f3Client: F3ResourceClient =
              options?.f3Client ||
              new F3ResourceClient({
                deviceToken: context?.deviceToken,
                timeoutMs: 1000,
              });

            const rawTokens = estimateTokenCount(rawPrompt);
            const approxInputTokens = rawTokens + contextTokenEstimate + 150;
            const llmTimeoutMs = options?.localExecutionOptions?.timeoutMs || 45000;

            const f3Request: F3ResourceRequest = {
              requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              callKind: 'pe_composer',
              approxInputTokens,
              typicalOutputTokens: Math.max(300, Math.min(1000, approxInputTokens)),
              maxOutputTokens: 2000,
              timeoutMs: llmTimeoutMs, // Real LLM limit (e.g. 45,000ms) so F3 can evaluate if local machine can finish within 70%
              needsJson: false,
              language: 'en',
              background: false,
              localAllowed: options?.localAllowed !== false,
            };

            const decision = await f3Client.getResourceDecision(f3Request, context?.deviceToken);
            const chatMessages = formatEnhancementChatMessages(rawPrompt, routingResult.sections);
            const execOptions = {
              ...options?.localExecutionOptions,
              deviceToken: context?.deviceToken || options?.localExecutionOptions?.deviceToken,
              deviceId: context?.deviceId || options?.localExecutionOptions?.deviceId,
            };

            if (decision.target === 'local' && decision.lanDevice) {
              const localRes = await executeLocalOrProCompletion(
                decision.lanDevice,
                { messages: chatMessages },
                execOptions
              );
              if (localRes.content && localRes.content.trim().length > 0) {
                finalEnhancedPrompt = localRes.content.trim();
              }

              // Asynchronously report result to F3 in background (fire-and-forget, zero critical path latency)
              try {
                f3Client.reportResult(
                  {
                    decisionId: decision.decisionId,
                    ranOn: localRes.ranOn,
                    ok: !localRes.fellBackToPro,
                    latencyMs: localRes.latencyMs,
                    failType: mapToF3FailType(localRes.failType),
                    fellBackToPro: localRes.fellBackToPro,
                  },
                  context?.deviceToken
                );
              } catch {
                // Ignore telemetry errors
              }
            } else {
              const tPro0 = performance.now();
              const proContent = await executeCloudProFallback(
                { messages: chatMessages },
                execOptions
              );
              const proLatency = Math.round(performance.now() - tPro0);
              const ok = Boolean(proContent && proContent.trim().length > 0);

              if (ok) {
                finalEnhancedPrompt = proContent.trim();
              }

              // Asynchronously report result to F3 in background (fire-and-forget, zero critical path latency)
              try {
                f3Client.reportResult(
                  {
                    decisionId: decision.decisionId,
                    ranOn: 'pro',
                    ok,
                    latencyMs: proLatency,
                    failType: ok ? null : 'PRO_ERROR',
                    fellBackToPro: false,
                  },
                  context?.deviceToken
                );
              } catch {
                // Ignore telemetry errors
              }
            }
          } catch {
            // Fail-open guarantee: silently preserve routingResult.enhancedPrompt
          }
        }

        // Enforce Clean Prompt Text Guarantee (no synthetic @ tags)
        finalEnhancedPrompt = cleanPromptText(finalEnhancedPrompt);
        const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));

        // 13. Record delivered item to SQLite (enforces FIFO cap)
        try {
          insertDeliveredItem(store, {
            projectRoot: projectId,
            sessionId,
            rawPrompt,
            enhancedPrompt: finalEnhancedPrompt,
            isEnhanced: true,
            stage,
            stageConfidence,
            injectedContextTags,
            contextTokenEstimate,
            processingTimeMs,
          });
        } catch {
          // Failure to log delivered items should never fail the user prompt
        }

        return {
          isEnhanced: true,
          enhancedPrompt: finalEnhancedPrompt,
          stage,
          stageConfidence,
          injectedContextTags,
          contextTokenEstimate,
          processingTimeMs,
          sections: routingResult.sections,
        };
      } finally {
        if (shouldCloseStore) {
          try {
            closeStore(store);
          } catch {
            // ignore
          }
        }
      }
    },
    options
  );
}

/**
 * Maps deterministic TaskType to canonical EnhancementStage.
 */
function mapTaskToStage(taskType: TaskType): EnhancementStage {
  switch (taskType) {
    case 'bugfix':
      return 'review_testing';
    case 'feature':
      return 'implementation';
    case 'refactor':
      return 'implementation';
    case 'test':
      return 'review_testing';
    case 'config':
      return 'task_breakdown';
    case 'general':
    default:
      return 'implementation';
  }
}
