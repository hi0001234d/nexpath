/**
 * Feature 1 — v1(a) tools inside the desktop app (Phase 7).
 *
 * The app stays running, so it holds the three drivers itself (no worker): MemOS as a library,
 * codebase-memory-mcp and OpenClaw as programs it starts. Create one instance when the app
 * starts, pass it to `prepareNexpathWriterEnhancement` (`options.tools`), call `capture` after
 * the agent replies (with the app's store), and `close` on quit. When a session ends (30 minutes
 * without a turn, a new session in the project, or `close`), its decisions from our map go to
 * OpenClaw.
 *
 * The npd_ token never leaves this object: MemOS only gets the bridge function (Ved,
 * 2026-11-02), OpenClaw only gets `openclawEnv` (its local embedding endpoint).
 */

import { join } from 'node:path';
import type OpenAI from 'openai';
import { createDesktopNexpathLlmClient } from '../../config/llm-client-scope.js';
import type { Store } from '../../store/db.js';
import { upsertContextMemory } from '../store/historical-map-store.js';
import { CodebaseMemoryDriver, createStdioCodebaseClient, resolveCodebaseMemoryBin } from '../sources/codebase-memory-driver.js';
import { createHostLlmBridge, type HostLlmBridge } from '../sources/host-llm-bridge.js';
import { MemosDriver } from '../sources/memos-driver.js';
import { OpenClawDriver } from '../sources/openclaw-driver.js';
import { MeaningDriver, isMeaningModelInstalled } from '../sources/meaning-driver.js';
import { SessionEndTracker, sessionDecisionsFromMap } from '../sources/session-end.js';
import { saveTurnSummary, TURN_SUMMARY_DELAY_MS } from '../sources/memos-summary.js';
import type { SourceDriver } from '../sources/source-driver.js';

export interface DesktopFeature1ToolsOptions {
  /** The app's Nexpath data folder; tool data lives under <dataDir>/{memos,openclaw,codebase-memory}. */
  dataDir: string;
  /** A Node that meets the installed OpenClaw's requirement (desktop install step); without it OpenClaw is unavailable. */
  openclawNodePath?: string;
  /** OpenClaw-only environment, e.g. its embedding endpoint (the app's local model). Never a token. */
  openclawEnv?: Record<string, string>;
  /** Session gap (default 30 minutes). Injected in tests. */
  sessionGapMs?: number;
  /** When to read MemOS's turn summary (default 20 s). Injected in tests. */
  summaryDelayMs?: number;
  /** Injected in tests. */
  drivers?: { memos?: MemosDriver; openclaw?: OpenClawDriver; codebase?: SourceDriver & { close?: () => Promise<void> }; meaning?: SourceDriver };
}

export interface DesktopCredentials {
  deviceToken: string;
  deviceId: string;
  apiBaseUrl?: string;
}

export interface DesktopTurn {
  projectRoot: string;
  sessionId: string;
  prompt: string;
  response: string;
  ts?: number;
}

const DEFAULT_API_BASE_URL = 'https://parseos.tech';

export class DesktopFeature1Tools {
  readonly drivers: readonly SourceDriver[];
  /** What MemOS gets: a completion function. It holds a client, never the token as a string. */
  readonly bridge: HostLlmBridge;
  private client: OpenAI | undefined;
  private readonly memos: MemosDriver | undefined;
  private readonly openclaw: OpenClawDriver | undefined;
  private readonly codebase: (SourceDriver & { close?: () => Promise<void> }) | undefined;
  private readonly sessions: SessionEndTracker;
  private store: Store | undefined;
  private readonly summaryDelayMs: number;

  constructor(options: DesktopFeature1ToolsOptions) {
    this.summaryDelayMs = options.summaryDelayMs ?? TURN_SUMMARY_DELAY_MS;
    this.sessions = new SessionEndTracker({
      gapMs: options.sessionGapMs,
      onEnd: async (session) => {
        if (!this.store || !this.openclaw) return;
        await this.openclaw.saveSessionDecisions(sessionDecisionsFromMap(this.store, session));
      },
    });
    // MemOS writes in the user's own language, never translated (multilingual #7).
    this.bridge = createHostLlmBridge({ getClient: () => this.client, language: 'match' });
    this.memos = options.drivers?.memos ?? new MemosDriver({ home: join(options.dataDir, 'memos'), bridge: this.bridge });
    this.openclaw =
      options.drivers?.openclaw ??
      new OpenClawDriver({ home: join(options.dataDir, 'openclaw'), nodePath: options.openclawNodePath, extraEnv: options.openclawEnv });
    this.codebase =
      options.drivers?.codebase ??
      (resolveCodebaseMemoryBin()
        ? new CodebaseMemoryDriver({ connect: () => createStdioCodebaseClient({ cacheDir: join(options.dataDir, 'codebase-memory') }) })
        : undefined);
    const meaning = options.drivers ? options.drivers.meaning : isMeaningModelInstalled() ? new MeaningDriver() : undefined;
    this.drivers = [this.memos, this.openclaw, this.codebase, meaning].filter((d): d is NonNullable<typeof d> => Boolean(d));
  }

  /** The device credentials for MemOS's background AI calls; the app calls this with every prompt. */
  setCredentials(credentials: DesktopCredentials | undefined): void {
    this.client = credentials
      ? createDesktopNexpathLlmClient({
          deviceToken: credentials.deviceToken,
          deviceId: credentials.deviceId,
          apiBaseUrl: credentials.apiBaseUrl || DEFAULT_API_BASE_URL,
        })
      : undefined;
  }

  /** Start the slow tools (MemOS model, MCP connect) now rather than on the first prompt. */
  warmUp(): void {
    for (const driver of this.drivers) void driver.available();
  }

  /**
   * After the agent replied: MemOS saves the turn; MemOS's learned rules go into our map (D12);
   * the session is kept open for OpenClaw's session-end save. Pass the app's store. Never throws.
   */
  async capture(turn: DesktopTurn, store?: Store): Promise<void> {
    const full = { ...turn, ts: turn.ts ?? Date.now() };
    if (store) this.store = store;
    this.sessions.noteTurn(full);
    const captured = await this.memos?.capture(full).catch(() => undefined);
    if (captured && this.memos) {
      const memos = this.memos;
      // MemOS writes the turn summary in the background: read it a little later into our map.
      setTimeout(() => {
        void memos.turnSummary(captured).then((summary) => {
          if (summary && this.store) saveTurnSummary(this.store, captured, summary);
        }).catch(() => {});
      }, this.summaryDelayMs).unref?.();
    }
    if (store && this.memos) {
      try {
        for (const row of await this.memos.learnedRules(turn.projectRoot)) upsertContextMemory(store, row);
      } catch {
        /* write-back is best effort */
      }
    }
  }

  async close(): Promise<void> {
    await this.sessions.endAll();
    this.client = undefined;
    await Promise.all([this.memos?.close(), this.codebase?.close?.()].map((p) => p?.catch(() => {})));
  }
}

export function createDesktopFeature1Tools(options: DesktopFeature1ToolsOptions): DesktopFeature1Tools {
  return new DesktopFeature1Tools(options);
}
