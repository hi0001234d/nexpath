/**
 * Storage for dev-environment probe facts (Channel Y, B1) with consent gating.
 *
 * Project-scoped facts live on the `projects` row (`env_facts` JSON +
 * `env_facts_detected_at`); machine-scoped facts live in the `config` table
 * under one JSON key. Everything is local-only in B1 — nothing is ever synced.
 *
 * Consent (`env_probe_enabled`, default ON):
 *  - READ gate: while disabled, every getter returns null so NO consumer can see
 *    stored facts (S6) — even if rows still exist on disk for a moment.
 *  - Auto-purge: turning consent off purges the stored facts (`purgeAllEnvFacts`,
 *    wired into the config setter) and `nexpath env --clear` purges on demand.
 */

import type { Database } from 'sql.js';
import { saveStore, type Store } from './db.js';
import { getConfig, deleteConfig } from './config.js';
import type { FactMap } from '../env/types.js';

export const ENV_PROBE_ENABLED_KEY = 'env_probe_enabled';
/** Config key holding the machine-scoped facts JSON (machine, not per-project). */
export const MACHINE_FACTS_KEY = 'env_machine_facts';

/** Stored facts plus when they were detected. */
export interface StoredFacts {
  facts: FactMap;
  detectedAt: number;
}

/** True unless consent has been explicitly turned off (default ON). */
export function isEnvProbeEnabled(db: Database): boolean {
  return getConfig(db, ENV_PROBE_ENABLED_KEY) !== 'false';
}

function parseFactMap(json: string | null | undefined): FactMap | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as FactMap;
  } catch {
    return null;
  }
}

// ── Project-scoped facts ─────────────────────────────────────────────────────

/** Store project facts on the projects row. No-op if the project is not registered. */
export function setProjectEnvFacts(
  store: Store,
  projectRoot: string,
  facts: FactMap,
  detectedAt: number,
): void {
  store.db.run(
    'UPDATE projects SET env_facts = ?, env_facts_detected_at = ? WHERE project_root = ?',
    [JSON.stringify(facts), detectedAt, projectRoot],
  );
  saveStore(store);
}

/** Read project facts, or null when absent OR while consent is disabled (S6 gate). */
export function getProjectEnvFacts(store: Store, projectRoot: string): StoredFacts | null {
  if (!isEnvProbeEnabled(store.db)) return null;
  const res = store.db.exec(
    'SELECT env_facts, env_facts_detected_at FROM projects WHERE project_root = ?',
    [projectRoot],
  );
  const row = res[0]?.values[0];
  if (!row) return null;
  const facts = parseFactMap(row[0] as string | null);
  if (!facts) return null;
  return { facts, detectedAt: (row[1] as number | null) ?? 0 };
}

// ── Machine-scoped facts ─────────────────────────────────────────────────────

/** Store machine facts in the config table (one JSON blob). */
export function setMachineFacts(store: Store, facts: FactMap, detectedAt: number): void {
  store.db.run(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [MACHINE_FACTS_KEY, JSON.stringify({ facts, detectedAt } satisfies StoredFacts)],
  );
  saveStore(store);
}

/** Read machine facts, or null when absent OR while consent is disabled (S6 gate). */
export function getMachineFacts(store: Store): StoredFacts | null {
  if (!isEnvProbeEnabled(store.db)) return null;
  const raw = getConfig(store.db, MACHINE_FACTS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredFacts;
    if (!parsed || typeof parsed !== 'object' || !parsed.facts) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Purge (S6 auto-purge + `nexpath env --clear`) ────────────────────────────

/** Clear stored facts for one project, or all projects when no root is given. */
export function clearProjectEnvFacts(store: Store, projectRoot?: string): void {
  if (projectRoot) {
    store.db.run(
      'UPDATE projects SET env_facts = NULL, env_facts_detected_at = NULL WHERE project_root = ?',
      [projectRoot],
    );
  } else {
    store.db.run('UPDATE projects SET env_facts = NULL, env_facts_detected_at = NULL');
  }
  saveStore(store);
}

/** Purge ALL stored facts (project rows + machine blob). Used on consent-off. */
export function purgeAllEnvFacts(store: Store): void {
  store.db.run('UPDATE projects SET env_facts = NULL, env_facts_detected_at = NULL');
  deleteConfig(store, MACHINE_FACTS_KEY);
  saveStore(store);
}
