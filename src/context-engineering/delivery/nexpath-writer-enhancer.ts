/**
 * Feature 1 — desktop "writer" version (Ved, option b; design agreed 2026-10-31).
 *
 * Runs Nexpath's own prompt-enhancement pipeline (the same one the CLI hook runs)
 * in-process, with Feature 1's memory handed to Nexpath's writer AI, and returns
 * the final prompt in the 7-field contract:
 *  - isEnhanced is true only when Nexpath has something to add (it would show its
 *    popup); enhancedPrompt is then the writer's text.
 *  - Every LLM call uses ONE client built from the desktop's npd_ token,
 *    <base>/v1 and X-Device-Id, scoped to this call. process.env is never read
 *    or changed for the credential, so a user's own key is never used.
 *  - 402 (no credit), 429 (rate limit), time-out and cancel fail open: original
 *    prompt, isEnhanced false. Time-out and cancel also abort the in-flight calls.
 *  - timeoutMs is a parameter (default 15s, the writer version's budget).
 */

import { openStore, closeStore, type Store } from '../../store/db.js';
import { createDesktopNexpathLlmClient, runWithNexpathLlmClient } from '../../config/llm-client-scope.js';
import type { PromptEnhancementPrepareResultV1 } from '../../prompt-enhancement/contracts.js';
import { normalizeProjectId } from '../core/project-scope.js';
import { withFailOpen, buildFallbackResult } from './fail-open.js';
import { estimateTokenCount } from './tag-generator.js';
import type {
  EnhancementOptions,
  EnhancementResult,
  EnhancementResultWithSections,
  WorkspaceContext,
} from '../types/context-engineering.js';

/** The writer version's default time budget ("Enhancing your prompt…" for up to 15s). */
export const NEXPATH_WRITER_DEFAULT_TIMEOUT_MS = 15_000;

const DEFAULT_API_BASE_URL = 'https://parseos.tech';

export interface NexpathWriterOptions extends Pick<EnhancementOptions, 'timeoutMs' | 'signal'> {
  /** The app's server; LLM calls go to <apiBaseUrl>/v1/chat/completions. Default https://parseos.tech. */
  apiBaseUrl?: string;
}

/**
 * The desktop's call: Nexpath's enhanced prompt with Feature 1's memory written in.
 * Needs `context.deviceToken` (npd_), `context.deviceId` and `context.workspacePath`;
 * without them it returns the original prompt.
 */
export async function prepareNexpathWriterEnhancement(
  rawPrompt: string,
  context: WorkspaceContext,
  options?: NexpathWriterOptions
): Promise<EnhancementResult> {
  const timeoutMs = options?.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : NEXPATH_WRITER_DEFAULT_TIMEOUT_MS;
  const startTime = performance.now();

  if (!rawPrompt || !rawPrompt.trim() || !context?.deviceToken || !context.deviceId || !context.workspacePath) {
    return buildFallbackResult(rawPrompt ?? '', startTime);
  }

  return withFailOpen(
    rawPrompt,
    async (signal) => {
      const client = createDesktopNexpathLlmClient({
        deviceToken: context.deviceToken!,
        deviceId: context.deviceId!,
        apiBaseUrl: options?.apiBaseUrl || DEFAULT_API_BASE_URL,
        signal,
      });

      let store: Store;
      let ownsStore = false;
      if (context.store) {
        store = context.store as Store;
      } else {
        store = await openStore(context.dataDir ? `${context.dataDir}/prompt-store.db` : undefined);
        ownsStore = true;
      }

      let shown: PromptEnhancementPrepareResultV1 | undefined;
      let memory: EnhancementResultWithSections | undefined;
      try {
        // Loaded on first use so the 0.1.0 path (preparePromptEnhancement) stays light.
        const { runAuto } = await import('../../cli/commands/auto.js');
        await runWithNexpathLlmClient(client, () =>
          runAuto(
            { promptText: rawPrompt, projectRoot: normalizeProjectId(context.workspacePath) },
            store,
            client,
            undefined,
            {
              host: {
                onShownPromptEnhancement: (result) => { shown = result; },
                onFeature1Memory: (result) => { memory = result; },
                feature1SessionId: context.sessionId,
                feature1Context: {
                  activeFilePath: context.activeFilePath,
                  gitBranch: context.gitBranch,
                  gitStatus: context.gitStatus,
                  recentModifiedFiles: context.recentModifiedFiles,
                },
              },
            },
          ),
        );
      } finally {
        if (ownsStore) {
          try { closeStore(store); } catch { /* ignore */ }
        }
      }

      if (signal.aborted) throw new Error('Nexpath writer enhancement aborted');

      const body = shown?.currentBody.text?.trim();
      if (!shown || !body) return buildFallbackResult(rawPrompt, startTime);

      return {
        isEnhanced: true,
        enhancedPrompt: body,
        stage: memory?.stage ?? 'implementation',
        stageConfidence: memory?.stageConfidence ?? 0,
        injectedContextTags: memory?.injectedContextTags ?? [],
        contextTokenEstimate: estimateTokenCount(body),
        processingTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    },
    { timeoutMs, signal: options?.signal }
  );
}
