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
import { withFailOpen, DEFAULT_TIMEOUT_MS } from './fail-open.js';
import { F3ResourceClient } from '../clients/f3-resource-client.js';
import { linkAbortSignal, untilAborted } from '../clients/abort-link.js';
import {
  executeLocalOrProCompletion,
  executeCloudProFallback,
  formatEnhancementChatMessages,
} from '../clients/f6-delegation-client.js';

import type {
  WorkspaceContext,
  EnhancementOptions,
  EnhancementResult,
  EnhancementResultWithSections,
  EnhancementStage,
  TaskType,
  F3ResourceRequest,
  F3FailType,
  Feature1SelectedFact,
  PromptSection,
  ScoredFact,
} from '../types/context-engineering.js';

/** Time kept back from the LLM step for the delivery write that follows it. */
const LLM_RESERVE_MS = 300;
/** Below this, there is no point starting the F3 decision and rewrite at all. */
const MIN_LLM_BUDGET_MS = 250;
/** The F3 decision never waits longer than this, whatever the budget. */
const F3_DECISION_TIMEOUT_MS = 1000;

/**
 * The fail-open timer cannot fire while synchronous work (sql.js, ranking) runs,
 * so the pipeline checks the clock itself between steps. Throwing here lands in
 * withFailOpen, which returns the unenhanced fallback.
 */
function assertWithinDeadline(startTime: number, timeoutMs: number): void {
  if (performance.now() - startTime > timeoutMs) {
    throw new Error(`Context-engineering SLA timeout exceeded (${timeoutMs}ms)`);
  }
}

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
 * Public entry point for Prompt Enhancement invoked by Desktop Runtime.
 * Returns exactly the 7-field EnhancementResult contract (no extra fields).
 * Strictly adheres to Universal Zero-UI Law (headless) and Clean Prompt Text Guarantee.
 */
export async function preparePromptEnhancement(
  rawPrompt: string,
  context?: WorkspaceContext,
  options?: EnhancementOptions
): Promise<EnhancementResult> {
  const { sections: _sections, facts: _facts, ...result } = await preparePromptEnhancementWithSections(rawPrompt, context, options);
  return result;
}

/**
 * Same pipeline as preparePromptEnhancement, plus the Two-Tier sections.
 * Used by the open-source CLI popup, which renders the sections itself.
 */
export async function preparePromptEnhancementWithSections(
  rawPrompt: string,
  context?: WorkspaceContext,
  options?: EnhancementOptions
): Promise<EnhancementResultWithSections> {
  return withFailOpen<EnhancementResultWithSections>(
    rawPrompt,
    async (signal) => {
      const startTime = performance.now();
      const timeoutMs = options?.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

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

        assertWithinDeadline(startTime, timeoutMs);

        // 9. If no relevant facts qualify, return unenhanced cleanly (<5ms).
        //    Workspace lines alone (active file / git status) are not worth an enhancement.
        if (budgetResult.allocatedLines.length === 0) {
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

        // The LLM step (F3 decision + local/cloud rewrite) gets only the time left in
        // timeoutMs, minus a reserve for the delivery write. When that budget runs out the
        // calls are cancelled and the non-LLM enhanced prompt is returned; when the caller
        // cancels, every call stops and the original prompt is returned (fail-open).
        const llmBudgetMs = Math.floor(timeoutMs - (performance.now() - startTime) - LLM_RESERVE_MS);
        if (
          isDesktopOrLlmMode &&
          options?.skipLlmRewrite !== true &&
          routingResult.sections.length > 0 &&
          llmBudgetMs >= MIN_LLM_BUDGET_MS
        ) {
          const llmController = new AbortController();
          const budgetTimer = setTimeout(() => llmController.abort(), llmBudgetMs);
          const unlinkCaller = linkAbortSignal(llmController, signal);
          try {
            // The server's desktop gate in front of /f3/v1/* takes the desktop's own device
            // token (Bearer npd_...) together with its X-Device-Id, and answers 401 without it.
            const f3Token = context?.deviceToken;
            const f3Client: F3ResourceClient =
              options?.f3Client ||
              new F3ResourceClient({
                baseUrl: options?.f3BaseUrl,
                deviceToken: f3Token,
                deviceId: context?.deviceId,
                timeoutMs: Math.min(F3_DECISION_TIMEOUT_MS, llmBudgetMs),
              });

            const rawTokens = estimateTokenCount(rawPrompt);
            const approxInputTokens = rawTokens + contextTokenEstimate + 150;

            const f3Request: F3ResourceRequest = {
              requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              callKind: 'pe_composer',
              approxInputTokens,
              typicalOutputTokens: Math.max(300, Math.min(1000, approxInputTokens)),
              maxOutputTokens: 2000,
              // The real time the rewrite may take, so F3 can judge whether a local machine
              // can finish within it.
              timeoutMs: options?.localExecutionOptions?.timeoutMs
                ? Math.min(options.localExecutionOptions.timeoutMs, llmBudgetMs)
                : llmBudgetMs,
              needsJson: false,
              language: 'en',
              background: false,
              localAllowed: options?.localAllowed !== false,
            };

            const decision = await untilAborted(f3Client.getResourceDecision(f3Request, f3Token, llmController.signal), llmController.signal);
            if (llmController.signal.aborted) throw new Error('LLM budget spent before the rewrite started');

            const chatMessages = formatEnhancementChatMessages(rawPrompt, routingResult.sections);
            // The budget signal alone ends the calls at the deadline. The clients keep their
            // own configured timeouts: a client timer set to the same instant could fire first
            // and be taken for an ordinary local timeout, starting a cloud fallback.
            const execOptions = {
              ...options?.localExecutionOptions,
              deviceToken: context?.deviceToken || options?.localExecutionOptions?.deviceToken,
              deviceId: context?.deviceId || options?.localExecutionOptions?.deviceId,
              cloudProUrl: options?.cloudProUrl,
              signal: llmController.signal,
            };

            if (decision.target === 'local' && decision.lanDevice) {
              const localRes = await untilAborted(
                executeLocalOrProCompletion(decision.lanDevice, { messages: chatMessages }, execOptions),
                llmController.signal
              );
              const cancelled = llmController.signal.aborted;
              if (!cancelled && localRes.content && localRes.content.trim().length > 0) {
                finalEnhancedPrompt = localRes.content.trim();
              }

              // Asynchronously report result to F3 in background (fire-and-forget, zero critical path latency)
              try {
                f3Client.reportResult(
                  {
                    decisionId: decision.decisionId,
                    ranOn: localRes.ranOn,
                    ok: !cancelled && !localRes.fellBackToPro,
                    latencyMs: localRes.latencyMs,
                    failType: cancelled ? 'cancelled' : mapToF3FailType(localRes.failType),
                    fellBackToPro: localRes.fellBackToPro,
                  },
                  f3Token
                );
              } catch {
                // Ignore telemetry errors
              }
            } else {
              const tPro0 = performance.now();
              const proContent = await untilAborted(
                executeCloudProFallback({ messages: chatMessages }, execOptions),
                llmController.signal
              );
              const proLatency = Math.round(performance.now() - tPro0);
              const cancelled = llmController.signal.aborted;
              const ok = !cancelled && Boolean(proContent && proContent.trim().length > 0);

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
                    failType: ok ? null : cancelled ? 'cancelled' : 'PRO_ERROR',
                    fellBackToPro: false,
                  },
                  f3Token
                );
              } catch {
                // Ignore telemetry errors
              }
            }
          } catch {
            // Fail-open guarantee: silently preserve routingResult.enhancedPrompt
          } finally {
            clearTimeout(budgetTimer);
            unlinkCaller();
          }
        }

        // A caller cancel during the LLM step returns the original prompt, not the enhanced one.
        if (signal.aborted) {
          throw new Error('Enhancement aborted by signal');
        }

        // Enforce Clean Prompt Text Guarantee (no synthetic @ tags)
        finalEnhancedPrompt = cleanPromptText(finalEnhancedPrompt);
        const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));

        // A run that overshot the deadline must not record facts as delivered.
        assertWithinDeadline(startTime, timeoutMs);

        // 13. Record delivered item to SQLite (enforces FIFO cap)
        if (options?.recordDelivery !== false) try {
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
          // Measured after the delivered-item write (which saves the whole DB file),
          // so the caller sees the real total, not the time before the save.
          processingTimeMs: Math.max(processingTimeMs, Math.round(performance.now() - startTime)),
          sections: routingResult.sections,
          facts: selectedFacts(budgetResult.allocatedLines, routingResult.sections),
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

/** The selected memory facts with the section each was routed to (workspace lines excluded). */
function selectedFacts(allocated: ScoredFact[], sections: PromptSection[]): Feature1SelectedFact[] {
  const out: Feature1SelectedFact[] = [];
  for (const item of allocated) {
    const section = sections.find((s) => s.lines.includes(item.formattedLine));
    if (!section) continue;
    out.push({
      id: item.fact.id,
      kind: item.fact.kind,
      locked: item.fact.locked === 1,
      content: item.fact.content,
      sectionId: section.id,
    });
  }
  return out;
}
