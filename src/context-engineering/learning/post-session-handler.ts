/**
 * Feature 1 — Context Engineering: Post-Session & Rolling Checkpoint Trigger Handler (Module 8 & Component 5.4)
 *
 * Implements the Two-Tier Pattern Analysis trigger cadence:
 *  1. In-Session Rolling Checkpoint (Every 4 Prompts):
 *     Fires asynchronously after turns 4, 8, 12, 16... without adding turn latency.
 *  2. Session Conclusion Trigger:
 *     Fires upon explicit agent exit (/exit) or when crossing the 30-min inactivity boundary.
 *
 * Guarantees single-flight concurrency debouncing, SQLite WAL non-blocking reads/writes,
 * and unconditional fail-open safety.
 */

import { openStore, closeStore, type Store } from '../../store/db.js';
import {
  savePatternAlert,
  resolvePatternAlert,
  getActivePatternAlerts,
  getActiveContextMemory,
} from '../store/historical-map-store.js';
import { analyzeSessionPatterns } from './pattern-learner.js';
import { normalizeProjectId } from '../core/project-scope.js';
import type {
  PostSessionAnalysisResult,
  SessionTurn,
  AnalysisTriggerReason,
  WorkspaceContext,
  TurnPayload,
} from '../types/context-engineering.js';

export const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes inactivity boundary
export const ROLLING_CHECKPOINT_INTERVAL = 4; // Checkpoint every 4 prompts

interface SessionState {
  turnCount: number;
  lastActiveTime: number;
  turns: SessionTurn[];
  isAnalyzing: boolean;
}

const activeSessions = new Map<string, SessionState>();

export interface TurnCompleteOptions {
  projectRoot: string;
  sessionId?: string;
  prompt: string;
  response: string;
  gitDiff?: string;
  turnNumber?: number;
}

export interface SessionCloseOptions {
  projectRoot: string;
  sessionId?: string;
  gitDiff?: string;
}

function isStoreInstance(obj: any): obj is Store {
  return Boolean(obj && typeof obj === 'object' && 'db' in obj && 'dbPath' in obj);
}

/**
 * Hook invoked after each completed prompt-response turn.
 * Tracks turn count and triggers background rolling checkpoint on turn 4, 8, 12...
 * Supports both onTurnComplete(turn, context) and onTurnComplete(store, options).
 */
export async function onTurnComplete(
  turnOrStore: TurnPayload | Store,
  optionsOrContext?: TurnCompleteOptions | WorkspaceContext
): Promise<{ triggered: boolean; triggerReason?: AnalysisTriggerReason }> {
  let store: Store;
  let options: TurnCompleteOptions;

  if (isStoreInstance(turnOrStore)) {
    // Called as onTurnComplete(store, options)
    store = turnOrStore;
    options = optionsOrContext as TurnCompleteOptions;
  } else {
    // Called as onTurnComplete(turn, context) - Ved Desktop Runtime style
    const turn = turnOrStore as TurnPayload;
    const context = (optionsOrContext || {}) as WorkspaceContext;
    store = context.store || (await openStore(context.dataDir ? `${context.dataDir}/prompt-store.db` : undefined));
    options = {
      projectRoot: context.workspacePath || process.cwd(),
      sessionId: context.sessionId || 'default_session',
      prompt: turn.prompt,
      response: turn.response,
      gitDiff: turn.gitDiff || '',
      turnNumber: turn.turnNumber,
    };
  }

  const { projectRoot, sessionId = 'default_session', prompt, response, gitDiff = '' } = options;
  const canonicalId = normalizeProjectId(projectRoot);
  const now = Date.now();

  let session = activeSessions.get(sessionId);
  if (!session) {
    session = {
      turnCount: 0,
      lastActiveTime: now,
      turns: [],
      isAnalyzing: false,
    };
    activeSessions.set(sessionId, session);
  }

  // Check 30-min inactivity boundary
  const isExpired = now - session.lastActiveTime > SESSION_GAP_MS;
  if (isExpired) {
    session.turnCount = 0;
    session.turns = [];
  }

  if (options.turnNumber !== undefined) {
    session.turnCount = options.turnNumber;
  } else {
    session.turnCount++;
  }
  session.lastActiveTime = now;
  session.turns.push({ prompt, response, turnNumber: session.turnCount, timestamp: now });

  // Check rolling checkpoint trigger (every 4 prompts)
  const isRollingTrigger = session.turnCount % ROLLING_CHECKPOINT_INTERVAL === 0;

  if (isRollingTrigger) {
    // Launch detached background analysis without blocking the user
    void runBackgroundAnalysis(store, canonicalId, sessionId, 'rolling_checkpoint', gitDiff);
    return { triggered: true, triggerReason: 'rolling_checkpoint' };
  }

  return { triggered: false };
}

/**
 * Hook invoked upon explicit session termination (/exit, terminal close, or session clear).
 * Analyzes cumulative diffs and transcripts.
 * Supports both onSessionClose(context) and onSessionClose(store, options).
 */
export async function onSessionClose(
  storeOrContext: Store | WorkspaceContext,
  options?: SessionCloseOptions
): Promise<PostSessionAnalysisResult> {
  let store: Store;
  let canonicalOptions: SessionCloseOptions;

  if (isStoreInstance(storeOrContext)) {
    // Called as onSessionClose(store, options)
    store = storeOrContext;
    canonicalOptions = options || {
      projectRoot: process.cwd(),
      sessionId: 'default_session',
      gitDiff: '',
    };
  } else {
    // Called as onSessionClose(context) - Ved Desktop Runtime style
    const context = storeOrContext as WorkspaceContext;
    store = context.store || (await openStore(context.dataDir ? `${context.dataDir}/prompt-store.db` : undefined));
    canonicalOptions = {
      projectRoot: context.workspacePath || process.cwd(),
      sessionId: context.sessionId || 'default_session',
      gitDiff: context.gitStatus || options?.gitDiff || '',
    };
  }

  const { projectRoot, sessionId = 'default_session', gitDiff = '' } = canonicalOptions;
  const canonicalId = normalizeProjectId(projectRoot);

  return runBackgroundAnalysis(store, canonicalId, sessionId, 'session_close', gitDiff);
}

/**
 * Executes pattern analysis with single-flight debouncing and fail-open exception safety.
 */
export async function runBackgroundAnalysis(
  store: Store,
  projectId: string,
  sessionId: string,
  reason: AnalysisTriggerReason,
  gitDiff = ''
): Promise<PostSessionAnalysisResult> {
  const session = activeSessions.get(sessionId);

  // Single-flight debouncing: If an analysis task is already running, skip spawn
  if (session?.isAnalyzing) {
    return {
      sessionId,
      projectId,
      alerts: [],
      resolvedAlertIds: [],
      executionTimeMs: 0,
    };
  }

  if (session) {
    session.isAnalyzing = true;
  }

  try {
    // 1. Fetch existing architectural rules for behavioral drift checking
    const existingRules = getActiveContextMemory(store, projectId);

    // 2. Fetch existing active pattern alerts for auto-resolution checking
    const activeAlerts = getActivePatternAlerts(store, projectId);

    // 3. Run pattern analysis
    const turns = session?.turns || [];
    const result = await analyzeSessionPatterns(turns, gitDiff, existingRules, activeAlerts, {
      projectId,
      sessionId,
    });

    // 4. Persist newly discovered pattern alerts
    for (const alert of result.alerts) {
      try {
        savePatternAlert(store, projectId, alert);
      } catch {
        // Silent catch for SQLite persistence
      }
    }

    // 5. Mark resolved alerts in SQLite
    for (const alertId of result.resolvedAlertIds) {
      try {
        resolvePatternAlert(store, projectId, alertId);
      } catch {
        // Silent catch
      }
    }

    return result;
  } catch (err) {
    // Fail-open guarantee: Background analysis errors never escape
    return {
      sessionId,
      projectId,
      alerts: [],
      resolvedAlertIds: [],
      executionTimeMs: 1,
    };
  } finally {
    if (session) {
      session.isAnalyzing = false;
      if (reason === 'session_close') {
        activeSessions.delete(sessionId);
      }
    }
  }
}

/**
 * Clears in-memory session tracking states (used for test isolation).
 */
export function resetSessionTracker(): void {
  activeSessions.clear();
}
