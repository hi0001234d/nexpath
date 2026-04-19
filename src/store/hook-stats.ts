/**
 * Lightweight JSON file tracking per-project advisory hook activity.
 *
 * Written on every hook invocation so `nexpath status` can show
 * liveness information without opening the main SQLite store.
 *
 * File: ~/.nexpath/hook-stats.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const HOOK_STATS_PATH = join(homedir(), '.nexpath', 'hook-stats.json');

export interface ProjectHookStats {
  projectRoot:     string;
  lastRunAt:       string;   // ISO 8601 timestamp
  invocationCount: number;
  lastOutcome:     string;   // 'no_action' | 'selected' | 'skipped'
}

export type HookStatsMap = Record<string, ProjectHookStats>;

export function readHookStats(): HookStatsMap {
  try {
    if (!existsSync(HOOK_STATS_PATH)) return {};
    return JSON.parse(readFileSync(HOOK_STATS_PATH, 'utf8')) as HookStatsMap;
  } catch {
    return {};
  }
}

export function writeHookStats(projectRoot: string, outcome: string): void {
  try {
    mkdirSync(dirname(HOOK_STATS_PATH), { recursive: true });
    const stats    = readHookStats();
    const existing = stats[projectRoot];
    stats[projectRoot] = {
      projectRoot,
      lastRunAt:       new Date().toISOString(),
      invocationCount: (existing?.invocationCount ?? 0) + 1,
      lastOutcome:     outcome,
    };
    writeFileSync(HOOK_STATS_PATH, JSON.stringify(stats, null, 2), 'utf8');
  } catch {
    // Never crash the hook on stats write failure
  }
}
