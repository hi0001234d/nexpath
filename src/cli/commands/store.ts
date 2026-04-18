import { confirm, isCancel } from '@clack/prompts';
import {
  openStore,
  closeStore,
  DEFAULT_DB_PATH,
  deleteProjectPrompts,
  deleteAllPrompts,
  pruneOlderThan,
  setConfig,
} from '../../store/index.js';

// ── Period parser ─────────────────────────────────────────────────────────────
// Supports: 24h, 30d, 6m (≈30d), 1y (≈365d)

export function parsePeriod(period: string): number {
  const match = /^(\d+)([hdmy])$/.exec(period.trim().toLowerCase());
  if (!match) {
    throw new Error(`Invalid period "${period}" — use a number followed by h, d, m, or y (e.g. 30d, 6m, 1y)`);
  }
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
    case 'm': return n * 30 * 24 * 60 * 60 * 1000;   // approximate month
    case 'y': return n * 365 * 24 * 60 * 60 * 1000;  // approximate year
    default:  throw new Error(`Unknown unit "${match[2]}"`);
  }
}

// ── store delete ──────────────────────────────────────────────────────────────

export type DeleteOpts = { project?: string; yes?: boolean };
export type ConfirmFn = () => Promise<boolean>;

const defaultConfirm: ConfirmFn = async () => {
  const answer = await confirm({ message: 'Delete ALL stored prompts? This cannot be undone.' });
  return !isCancel(answer) && answer === true;
};

export async function storeDeleteAction(
  opts: DeleteOpts,
  dbPath = DEFAULT_DB_PATH,
  confirmFn: ConfirmFn = defaultConfirm
): Promise<void> {
  // --project variant: scoped, no confirmation needed
  if (opts.project) {
    const store = await openStore(dbPath);
    deleteProjectPrompts(store, opts.project);
    closeStore(store);
    console.log(`Deleted all prompts for project: ${opts.project}`);
    return;
  }

  // Full delete: confirmation required unless --yes passed
  if (!opts.yes) {
    const confirmed = await confirmFn();
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
  }

  const store = await openStore(dbPath);
  deleteAllPrompts(store);
  closeStore(store);
  console.log('All stored prompts deleted.');
}

// ── store enable ──────────────────────────────────────────────────────────────

export async function storeEnableAction(dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  setConfig(store, 'prompt_capture_enabled', 'true');
  closeStore(store);
  console.log('Prompt capture enabled.');
  console.log('Stored: prompt text, timestamp, agent name, project path');
  console.log('Location: ~/.nexpath/prompt-store.db — nothing is sent externally');
  console.log('Disable anytime: nexpath store disable');
}

// ── store disable ─────────────────────────────────────────────────────────────

export async function storeDisableAction(dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  setConfig(store, 'prompt_capture_enabled', 'false');
  closeStore(store);
  console.log('Prompt capture disabled. Existing data retained.');
  console.log('Run "nexpath store delete" to remove stored prompts.');
}

// ── store prune ───────────────────────────────────────────────────────────────

export type PruneOpts = { olderThan?: string; project?: string };

export async function storePruneAction(opts: PruneOpts, dbPath = DEFAULT_DB_PATH): Promise<void> {
  if (!opts.olderThan) {
    console.error('Error: --older-than <period> is required (e.g. 30d, 6m, 1y)');
    process.exitCode = 1;
    return;
  }

  let ms: number;
  try {
    ms = parsePeriod(opts.olderThan);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const store = await openStore(dbPath);
  const deleted = pruneOlderThan(store, ms, opts.project);
  closeStore(store);

  const scope = opts.project ? `project: ${opts.project}` : 'all projects';
  console.log(`Pruned ${deleted} prompt(s) older than ${opts.olderThan} from ${scope}.`);
}
