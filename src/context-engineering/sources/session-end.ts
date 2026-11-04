/**
 * Feature 1 — v1(a) session end for OpenClaw (architecture.md Path A: "session ends → OpenClaw:
 * save the session's decisions").
 *
 * Hooks are short-lived, so the long-running side (the CLI worker, or the desktop app) notices
 * the end: the same 30-minute gap Nexpath's learner uses (SESSION_GAP_MS), a new session in the
 * same project, or the worker / app shutting down.
 */

import type { Store } from '../../store/db.js';
import { getActiveContextMemory } from '../store/historical-map-store.js';
import { normalizeProjectId } from '../core/project-scope.js';
import { SESSION_GAP_MS } from '../learning/post-session-handler.js';
import { isToolCandidateKind } from './candidate-filter.js';
import type { OpenClawSessionDecisions } from './openclaw-driver.js';

export interface EndedSession {
  projectRoot: string;
  sessionId: string;
  /** When the session's first turn finished. */
  startedAt: number;
}

interface OpenSession extends EndedSession {
  timer: ReturnType<typeof setTimeout>;
}

export interface SessionEndTrackerOptions {
  onEnd: (session: EndedSession) => Promise<void> | void;
  gapMs?: number;
}

export class SessionEndTracker {
  private readonly open = new Map<string, OpenSession>();

  constructor(private readonly options: SessionEndTrackerOptions) {}

  /** A turn finished. A different session in the same project ends the earlier one now. */
  noteTurn(turn: { projectRoot: string; sessionId: string; ts: number }): void {
    const projectRoot = normalizeProjectId(turn.projectRoot);
    const current = this.open.get(projectRoot);
    if (current && current.sessionId !== turn.sessionId) this.end(projectRoot);
    const session = this.open.get(projectRoot);
    if (session) clearTimeout(session.timer);
    const timer = setTimeout(() => this.end(projectRoot), this.options.gapMs ?? SESSION_GAP_MS);
    timer.unref?.();
    this.open.set(projectRoot, {
      projectRoot,
      sessionId: turn.sessionId,
      startedAt: session?.startedAt ?? turn.ts,
      timer,
    });
  }

  /** Shutdown: end every open session and wait for them. */
  async endAll(): Promise<void> {
    await Promise.all([...this.open.keys()].map((projectRoot) => this.end(projectRoot)));
  }

  openSessions(): number {
    return this.open.size;
  }

  private async end(projectRoot: string): Promise<void> {
    const session = this.open.get(projectRoot);
    if (!session) return;
    clearTimeout(session.timer);
    this.open.delete(projectRoot);
    try {
      await this.options.onEnd({ projectRoot, sessionId: session.sessionId, startedAt: session.startedAt });
    } catch {
      /* fail open: OpenClaw misses this session, nothing else changes */
    }
  }
}

/** Facts recorded in the same hook run as the turn come just before it: allow a little slack. */
const SESSION_START_SLACK_MS = 60_000;
const MAX_SESSION_DECISIONS = 50;

/**
 * The decisions our map recorded (or updated) during the session: current ones only (replaced
 * decisions are left out), no per-prompt tool rows and no open-item alerts.
 */
export function sessionDecisionsFromMap(store: Store, session: EndedSession): OpenClawSessionDecisions {
  const since = session.startedAt - SESSION_START_SLACK_MS;
  const decisions = getActiveContextMemory(store, session.projectRoot)
    .filter((row) => Math.max(row.created_at, row.updated_at) >= since)
    .filter((row) => row.kind !== 'pattern_alert' && !isToolCandidateKind(row.kind))
    .sort((a, b) => a.created_at - b.created_at)
    .slice(0, MAX_SESSION_DECISIONS)
    .map((row) => ({ kind: row.kind, content: row.content, locked: row.locked === 1 }));
  return { ...session, decisions };
}
