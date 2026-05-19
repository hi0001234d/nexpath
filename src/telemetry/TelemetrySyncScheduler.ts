import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TELEMETRY_SYNC_STATE_PATH } from './paths.js';
import { getConfig } from '../store/config.js';
import type { Store } from '../store/db.js';
import type { SyncState } from './types.js';

const DEFAULT_MIN_MINUTES = 10;
const DEFAULT_MAX_MINUTES = 30;
const MS_PER_MINUTE = 60 * 1000;

const EMPTY_STATE: SyncState = {
  next_sync_at:         null,
  last_attempt_at:      null,
  last_success_at:      null,
  last_error:           null,
  consecutive_failures: 0,
};

export function loadSyncState(statePath: string = TELEMETRY_SYNC_STATE_PATH): SyncState | null {
  try {
    if (!existsSync(statePath)) return null;
    const raw    = readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return {
      next_sync_at:         typeof parsed.next_sync_at         === 'string' ? parsed.next_sync_at         : null,
      last_attempt_at:      typeof parsed.last_attempt_at      === 'string' ? parsed.last_attempt_at      : null,
      last_success_at:      typeof parsed.last_success_at      === 'string' ? parsed.last_success_at      : null,
      last_error:           typeof parsed.last_error           === 'string' ? parsed.last_error           : null,
      consecutive_failures: typeof parsed.consecutive_failures === 'number' ? parsed.consecutive_failures : 0,
    };
  } catch {
    return null;
  }
}

export function saveSyncState(state: SyncState, statePath: string = TELEMETRY_SYNC_STATE_PATH): void {
  try {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Never throw — sync must not crash the host process.
  }
}

export interface SchedulerOptions {
  onSync?:      () => Promise<void>;
  isEnabled?:   () => boolean;
  now?:         () => Date;
  random?:      () => number;
  statePath?:   string;
  minMinutes?:  number;
  maxMinutes?:  number;
}

export class TelemetrySyncScheduler {
  private readonly onSync:     () => Promise<void>;
  private readonly isEnabled:  () => boolean;
  private readonly now:        () => Date;
  private readonly random:     () => number;
  private readonly statePath:  string;
  private readonly minMs:      number;
  private readonly maxMs:      number;

  private state:      SyncState;
  private isRunning   = false;
  private stopped     = true;
  private timer:      ReturnType<typeof setTimeout> | null = null;

  constructor(opts: SchedulerOptions = {}) {
    this.onSync     = opts.onSync     ?? (async () => {});
    this.isEnabled  = opts.isEnabled  ?? (() => true);
    this.now        = opts.now        ?? (() => new Date());
    this.random     = opts.random     ?? Math.random;
    this.statePath  = opts.statePath  ?? TELEMETRY_SYNC_STATE_PATH;
    this.minMs      = (opts.minMinutes ?? DEFAULT_MIN_MINUTES) * MS_PER_MINUTE;
    this.maxMs      = (opts.maxMinutes ?? DEFAULT_MAX_MINUTES) * MS_PER_MINUTE;

    const loaded = loadSyncState(this.statePath);
    this.state   = loaded ?? { ...EMPTY_STATE };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;

    const nowMs = this.now().getTime();
    let nextMs: number;

    if (this.state.next_sync_at) {
      nextMs = new Date(this.state.next_sync_at).getTime();
    } else {
      nextMs = nowMs + this.randomDelayMs();
      this.state.next_sync_at = new Date(nextMs).toISOString();
      saveSyncState(this.state, this.statePath);
    }

    const delayMs = Math.max(0, nextMs - nowMs);
    this.timer = setTimeout(() => { void this.tick(); }, delayMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async syncNow(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.isRunning) return;

    this.isRunning             = true;
    this.state.last_attempt_at = this.now().toISOString();

    try {
      await this.onSync();
      this.state.last_success_at      = this.now().toISOString();
      this.state.last_error           = null;
      this.state.consecutive_failures = 0;
    } catch (err) {
      this.state.last_error           = err instanceof Error ? err.message : String(err);
      this.state.consecutive_failures = this.state.consecutive_failures + 1;
    } finally {
      this.isRunning = false;
      saveSyncState(this.state, this.statePath);
    }
  }

  getState(): SyncState {
    return { ...this.state };
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    await this.syncNow();
    if (this.stopped) return;

    const delayMs           = this.randomDelayMs();
    const nextMs            = this.now().getTime() + delayMs;
    this.state.next_sync_at = new Date(nextMs).toISOString();
    saveSyncState(this.state, this.statePath);

    this.timer = setTimeout(() => { void this.tick(); }, delayMs);
  }

  private randomDelayMs(): number {
    const span = this.maxMs - this.minMs;
    return this.minMs + this.random() * span;
  }
}

export function createDefaultScheduler(store: Store, onSync?: () => Promise<void>): TelemetrySyncScheduler {
  return new TelemetrySyncScheduler({
    onSync,
    isEnabled: () => {
      try {
        return getConfig(store.db, 'telemetry_sync_enabled') === 'true';
      } catch {
        return false;
      }
    },
  });
}
