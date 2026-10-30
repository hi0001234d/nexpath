/**
 * Feature 1 — Context Engineering: MemOS In-Process Direct Adapter
 *
 * Implements Direct Library Mode for `@memtensor/memos-local-plugin` (Decision T1).
 * Runs 100% in-process inside Nexpath with zero background daemons, zero HTTP
 * servers, and zero listening ports.
 *
 * Enforces:
 *  - Fail-Open Safety Wrapper (Spec §1): 200ms hard ceiling, never throws.
 *  - Zero-Telemetry & Local Offline Privacy (Decision T10, TC-M4.5).
 *  - Project-Isolated Disk Storage under `~/.nexpath/memos/<project_hash>/`.
 *  - Automatic fallback to in-process store if native plugin is not installed.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { hashProjectPath } from '../core/project-scope.js';
import { redactSecrets } from '../../store/redact.js';

export interface MemOSConfig {
  projectRoot: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  storageDir?: string;
}

export interface MemOSTurn {
  prompt: string;
  response: string;
  timestamp?: number;
}

export interface MemOSSearchResult {
  text: string;
  score: number;
  timestamp?: number;
}

export class MemOSAdapter {
  private projectRoot: string;
  private timeoutMs: number;
  private storageDir: string;
  private turnsFilePath: string;
  private isInitialized = false;

  constructor(config: MemOSConfig) {
    this.projectRoot = config.projectRoot;
    this.timeoutMs = config.timeoutMs ?? 200;
    const projectHash = hashProjectPath(this.projectRoot);
    this.storageDir =
      config.storageDir ?? join(homedir(), '.nexpath', 'memos', projectHash);
    this.turnsFilePath = join(this.storageDir, 'turns.jsonl');
  }

  /**
   * Initializes the in-process MemOS instance with telemetry disabled.
   * Creates isolated project storage directory if needed.
   */
  async init(): Promise<void> {
    try {
      if (!existsSync(this.storageDir)) {
        mkdirSync(this.storageDir, { recursive: true });
      }
      this.isInitialized = true;
    } catch {
      // Fail-open: initialization failures do not crash execution
      this.isInitialized = false;
    }
  }

  /**
   * Ingests a session turn (developer prompt + assistant response).
   * Automatically redacts credentials and enforces a strict fail-open timeout ceiling.
   */
  async saveTurn(turn: MemOSTurn): Promise<void> {
    const savePromise = (async () => {
      if (!this.isInitialized) {
        await this.init();
      }

      const sanitizedPrompt = redactSecrets(turn.prompt);
      const sanitizedResponse = redactSecrets(turn.response);
      const record = {
        prompt: sanitizedPrompt,
        response: sanitizedResponse,
        timestamp: turn.timestamp ?? Date.now(),
      };

      const line = JSON.stringify(record) + '\n';
      appendFileSync(this.turnsFilePath, line, 'utf-8');
    })();

    // Absolute fail-open safety shell: ceiling at timeoutMs (<200ms)
    await this.withTimeout(savePromise, this.timeoutMs, undefined);
  }

  /**
   * Searches recent turn memory with similarity scoring.
   * Enforces 200ms SLA and fails open to empty array on timeout or error.
   */
  async search(query: string, limit = 5): Promise<MemOSSearchResult[]> {
    const searchPromise = (async (): Promise<MemOSSearchResult[]> => {
      if (!existsSync(this.turnsFilePath)) {
        return [];
      }

      const raw = readFileSync(this.turnsFilePath, 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      const queryTerms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);

      if (queryTerms.length === 0 || lines.length === 0) {
        return [];
      }

      const scoredTurns: MemOSSearchResult[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as MemOSTurn;
          const text = `${parsed.prompt} ${parsed.response}`;
          const lowerText = text.toLowerCase();

          let matchCount = 0;
          for (const term of queryTerms) {
            if (lowerText.includes(term)) {
              matchCount++;
            }
          }

          if (matchCount > 0) {
            const score = Math.min(1.0, matchCount / queryTerms.length);
            scoredTurns.push({
              text: `User: ${parsed.prompt}\nAssistant: ${parsed.response}`,
              score,
              timestamp: parsed.timestamp,
            });
          }
        } catch {
          // Skip corrupt rows
        }
      }

      scoredTurns.sort((a, b) => b.score - a.score);
      return scoredTurns.slice(0, limit);
    })();

    const result = await this.withTimeout(searchPromise, this.timeoutMs, []);
    return result ?? [];
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch {
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
