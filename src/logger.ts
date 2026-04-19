/**
 * Structured file-based logger for nexpath.
 *
 * Writes to ~/.nexpath/nexpath.log (append, 5 MB rotation).
 * Never throws — log failures must not crash the advisory hook.
 *
 * Level controlled by:
 *   1. initLogger(command, level) call — highest priority
 *   2. NEXPATH_LOG_LEVEL environment variable
 *   3. Default: 'info'
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn:  1,
  info:  2,
  debug: 3,
};

export const LOG_PATH = join(homedir(), '.nexpath', 'nexpath.log');
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB rotation threshold

let _level: LogLevel   = 'info';
let _command: string   = 'nexpath';
let _initialized       = false;

export function initLogger(command: string, level?: LogLevel): void {
  _command     = command;
  _level       = level ?? resolveLevel();
  _initialized = true;
}

function resolveLevel(): LogLevel {
  const env = process.env.NEXPATH_LOG_LEVEL?.toLowerCase();
  if (env && env in LEVEL_RANK) return env as LogLevel;
  return 'info';
}

function ensureInit(): void {
  if (!_initialized) {
    _level       = resolveLevel();
    _initialized = true;
  }
}

function rotate(): void {
  try {
    if (!existsSync(LOG_PATH)) {
      mkdirSync(dirname(LOG_PATH), { recursive: true });
      return;
    }
    if (statSync(LOG_PATH).size > MAX_BYTES) {
      renameSync(LOG_PATH, `${LOG_PATH}.1`);
    }
  } catch {
    // ignore — rotation failure is non-fatal
  }
}

export function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  ensureInit();
  if (LEVEL_RANK[level] > LEVEL_RANK[_level]) return;

  const ts      = new Date().toISOString();
  const dataStr = data ? ' ' + JSON.stringify(data) : '';
  const line    = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${_command}] ${event}${dataStr}\n`;

  try {
    rotate();
    appendFileSync(LOG_PATH, line, 'utf8');
  } catch {
    // Log write failure must never crash the hook
  }
}

export const logger = {
  error: (event: string, data?: Record<string, unknown>) => log('error', event, data),
  warn:  (event: string, data?: Record<string, unknown>) => log('warn',  event, data),
  info:  (event: string, data?: Record<string, unknown>) => log('info',  event, data),
  debug: (event: string, data?: Record<string, unknown>) => log('debug', event, data),
};
