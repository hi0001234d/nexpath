/**
 * Feature 1 — Context Engineering: Historical Map & Context Memory Store
 *
 * Implements CRUD, decision chaining (`superseded_by`), secret redaction,
 * active filtering, and FIFO retention for Feature 1's dedicated SQLite tables
 * (`context_memory` and `delivered_items`) inside `~/.nexpath/prompt-store.db`.
 */

import { saveStore, type Store } from '../../store/db.js';
import { redactSecrets } from '../../store/redact.js';
import type {
  ContextMemoryKind,
  ContextMemoryRow,
  InsertContextMemoryInput,
  DeliveredItemRow,
  InsertDeliveredItemInput,
  ContextIdentity,
  PatternAlert,
} from '../types/context-engineering.js';

export const DEFAULT_MAX_DELIVERED_ITEMS_PER_PROJECT = 1000;

// ============================================================================
// 1. Context Memory (Historical Map) Operations
// ============================================================================

/**
 * Inserts or updates a context memory item.
 * Secrets in `content` are automatically redacted before writing to disk.
 * Returns the row ID of the inserted/updated record.
 */
export function upsertContextMemory(
  store: Store,
  input: InsertContextMemoryInput
): number {
  const {
    projectRoot,
    kind,
    key,
    content,
    verbatim,
    identities,
    locked,
    confidence,
    evidence,
  } = input;

  const sanitizedContent = redactSecrets(content);
  const now = Date.now();
  const isLocked = locked ? 1 : 0;
  const conf = confidence !== undefined ? confidence : (isLocked ? 0.95 : 0.50);
  const identitiesJson = identities ? JSON.stringify(identities) : null;

  store.db.run(
    `INSERT INTO context_memory (
       project_root, kind, key, content, verbatim, identities_json,
       locked, confidence, staleness, superseded_by, active, evidence,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?, ?)
     ON CONFLICT(project_root, kind, key) DO UPDATE SET
       content         = excluded.content,
       verbatim        = excluded.verbatim,
       identities_json = excluded.identities_json,
       locked          = excluded.locked,
       confidence      = excluded.confidence,
       active          = 1,
       superseded_by   = NULL,
       evidence        = excluded.evidence,
       updated_at      = excluded.updated_at`,
    [
      projectRoot,
      kind,
      key,
      sanitizedContent,
      verbatim ?? null,
      identitiesJson,
      isLocked,
      conf,
      evidence ?? null,
      now,
      now,
    ]
  );

  const idRes = store.db.exec(
    'SELECT id FROM context_memory WHERE project_root = ? AND kind = ? AND key = ?',
    [projectRoot, kind, key]
  );
  const rowId = (idRes[0]?.values[0]?.[0] as number) ?? 0;

  saveStore(store);
  return rowId;
}

/**
 * Retrieves all active, non-superseded memory rows for a project.
 * Ordered by locked status DESC, confidence DESC, and recency DESC.
 */
export function getActiveContextMemory(
  store: Store,
  projectRoot: string,
  options?: { kind?: ContextMemoryKind; limit?: number }
): ContextMemoryRow[] {
  let query = `
    SELECT id, project_root, kind, key, content, verbatim, identities_json,
           locked, confidence, staleness, superseded_by, active, evidence,
           created_at, updated_at
    FROM context_memory
    WHERE project_root = ? AND active = 1 AND superseded_by IS NULL
  `;
  const params: (string | number)[] = [projectRoot];

  if (options?.kind) {
    query += ' AND kind = ?';
    params.push(options.kind);
  }

  query += ' ORDER BY locked DESC, confidence DESC, updated_at DESC';

  if (options?.limit && options.limit > 0) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const res = store.db.exec(query, params);
  return mapMemoryRows(res[0]?.values ?? []);
}

/**
 * Chains an older decision to a newer one, marking the older decision superseded and inactive.
 * Older decisions are never deleted from disk (retaining complete audit history for R3 learning).
 */
export function supersedeDecision(
  store: Store,
  projectRoot: string,
  oldId: number,
  newId: number
): void {
  const now = Date.now();
  store.db.run(
    `UPDATE context_memory
     SET superseded_by = ?, active = 0, updated_at = ?
     WHERE id = ? AND project_root = ?`,
    [newId, now, oldId, projectRoot]
  );
  saveStore(store);
}

/**
 * Annotates a memory row with staleness (e.g. "code_changed_since") when git diff indicates drift.
 */
export function markMemoryStale(
  store: Store,
  projectRoot: string,
  id: number,
  staleness = 'code_changed_since'
): void {
  const now = Date.now();
  store.db.run(
    `UPDATE context_memory
     SET staleness = ?, updated_at = ?
     WHERE id = ? AND project_root = ?`,
    [staleness, now, id, projectRoot]
  );
  saveStore(store);
}

/**
 * Returns full historical audit memory for a project, including inactive and superseded records.
 */
export function getContextMemoryHistory(
  store: Store,
  projectRoot: string,
  options?: { kind?: ContextMemoryKind }
): ContextMemoryRow[] {
  let query = `
    SELECT id, project_root, kind, key, content, verbatim, identities_json,
           locked, confidence, staleness, superseded_by, active, evidence,
           created_at, updated_at
    FROM context_memory
    WHERE project_root = ?
  `;
  const params: (string | number)[] = [projectRoot];

  if (options?.kind) {
    query += ' AND kind = ?';
    params.push(options.kind);
  }

  query += ' ORDER BY id ASC';

  const res = store.db.exec(query, params);
  return mapMemoryRows(res[0]?.values ?? []);
}

/**
 * Persists a detected pattern alert in context_memory as kind = 'pattern_alert'.
 * Deduplicates by project_root, kind, and key.
 */
export function savePatternAlert(
  store: Store,
  projectRoot: string,
  alert: PatternAlert
): number {
  const filePart = alert.targetFile ? alert.targetFile.replace(/[\/\\]/g, '_') : 'global';
  const alertKey = alert.key || `alert:${alert.category}:${filePart}:${Math.abs(hashString(alert.text)).toString(36)}`;
  return upsertContextMemory(store, {
    projectRoot,
    kind: 'pattern_alert',
    key: alertKey,
    content: alert.text,
    evidence: alert.evidence,
    confidence: alert.confidence,
    locked: false,
    identities: alert.targetFile ? [{ file: alert.targetFile }] : undefined,
  });
}

/**
 * Marks an active pattern alert as resolved once code changes fix the issue.
 */
export function resolvePatternAlert(
  store: Store,
  projectRoot: string,
  alertId: number
): void {
  const now = Date.now();
  store.db.run(
    `UPDATE context_memory
     SET active = 0, staleness = 'resolved', updated_at = ?
     WHERE id = ? AND project_root = ?`,
    [now, alertId, projectRoot]
  );
  saveStore(store);
}

/**
 * Fetches all active pattern alerts for a project.
 */
export function getActivePatternAlerts(
  store: Store,
  projectRoot: string
): ContextMemoryRow[] {
  return getActiveContextMemory(store, projectRoot, { kind: 'pattern_alert' });
}

// ============================================================================
// 2. Delivered Items Operations
// ============================================================================

/**
 * Records a delivered prompt enhancement payload.
 * Secrets in `rawPrompt` and `enhancedPrompt` are sanitized via `redactSecrets`.
 * Automatically enforces a FIFO per-project cap (1,000 items) to maintain 100 MB DB ceiling.
 */
export function insertDeliveredItem(
  store: Store,
  input: InsertDeliveredItemInput,
  maxRetention = DEFAULT_MAX_DELIVERED_ITEMS_PER_PROJECT
): number {
  const {
    projectRoot,
    sessionId,
    rawPrompt,
    enhancedPrompt,
    isEnhanced,
    stage,
    stageConfidence,
    injectedContextTags,
    contextTokenEstimate,
    processingTimeMs,
  } = input;

  const sanitizedRaw = redactSecrets(rawPrompt);
  const sanitizedEnhanced = redactSecrets(enhancedPrompt);
  const tagsJson = JSON.stringify(injectedContextTags || []);
  const now = Date.now();

  store.db.run(
    `INSERT INTO delivered_items (
       project_root, session_id, raw_prompt, enhanced_prompt, is_enhanced,
       stage, stage_confidence, injected_context_tags, context_token_estimate,
       processing_time_ms, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectRoot,
      sessionId ?? null,
      sanitizedRaw,
      sanitizedEnhanced,
      isEnhanced ? 1 : 0,
      stage,
      stageConfidence,
      tagsJson,
      contextTokenEstimate,
      processingTimeMs,
      now,
    ]
  );

  const idRes = store.db.exec('SELECT last_insert_rowid()');
  const deliveredId = (idRes[0]?.values[0]?.[0] as number) ?? 0;

  // Enforce FIFO retention to avoid unbounded growth
  if (maxRetention > 0) {
    store.db.run(
      `DELETE FROM delivered_items
       WHERE project_root = ?
         AND id NOT IN (
           SELECT id FROM delivered_items
           WHERE project_root = ?
           ORDER BY id DESC
           LIMIT ?
         )`,
      [projectRoot, projectRoot, maxRetention]
    );
  }

  saveStore(store);
  return deliveredId;
}

/**
 * Returns recent delivered enhancement rows for a project, newest first.
 * Used by Desktop diff drawer and to prevent nagging within the same session.
 */
export function getRecentDeliveredItems(
  store: Store,
  projectRoot: string,
  limit = 10
): DeliveredItemRow[] {
  const res = store.db.exec(
    `SELECT id, project_root, session_id, raw_prompt, enhanced_prompt, is_enhanced,
            stage, stage_confidence, injected_context_tags, context_token_estimate,
            processing_time_ms, created_at
     FROM delivered_items
     WHERE project_root = ?
     ORDER BY id DESC
     LIMIT ?`,
    [projectRoot, limit]
  );

  return (res[0]?.values ?? []).map((row) => ({
    id: row[0] as number,
    project_root: row[1] as string,
    session_id: row[2] as string | null,
    raw_prompt: row[3] as string,
    enhanced_prompt: row[4] as string,
    is_enhanced: row[5] as number,
    stage: row[6] as string,
    stage_confidence: row[7] as number,
    injected_context_tags: parseJsonSafe<string[]>(row[8] as string, []),
    context_token_estimate: row[9] as number,
    processing_time_ms: row[10] as number,
    created_at: row[11] as number,
  }));
}

/**
 * Retrieves all injected context tags delivered in the specified session (or across recent items).
 * Used for session deduplication (Piece 7) to prevent injecting the same context twice in a session.
 */
export function getDeliveredTags(
  store: Store,
  projectRoot: string,
  sessionId?: string
): Set<string> {
  let query = `
    SELECT injected_context_tags
    FROM delivered_items
    WHERE project_root = ?
  `;
  const params: (string | number)[] = [projectRoot];

  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }

  query += ' ORDER BY id DESC LIMIT 100';

  const res = store.db.exec(query, params);
  const tagSet = new Set<string>();

  for (const row of res[0]?.values ?? []) {
    const rawTags = row[0] as string | null;
    const tags = parseJsonSafe<string[]>(rawTags, []);
    for (const tag of tags) {
      if (tag) tagSet.add(tag);
    }
  }

  return tagSet;
}

/**
 * Deletes all Feature 1 context data for a project (for project reset / clearing).
 */
export function deleteProjectContextData(store: Store, projectRoot: string): void {
  store.db.run('DELETE FROM context_memory WHERE project_root = ?', [projectRoot]);
  store.db.run('DELETE FROM delivered_items WHERE project_root = ?', [projectRoot]);
  saveStore(store);
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapMemoryRows(values: any[][]): ContextMemoryRow[] {
  return values.map((row) => ({
    id: row[0] as number,
    project_root: row[1] as string,
    kind: row[2] as ContextMemoryKind,
    key: row[3] as string,
    content: row[4] as string,
    verbatim: row[5] as string | null,
    identities: parseJsonSafe<ContextIdentity[] | null>(row[6] as string | null, null),
    locked: row[7] as number,
    confidence: row[8] as number,
    staleness: row[9] as string | null,
    superseded_by: row[10] as number | null,
    active: row[11] as number,
    evidence: row[12] as string | null,
    created_at: row[13] as number,
    updated_at: row[14] as number,
  }));
}

function parseJsonSafe<T>(jsonStr: string | null, fallback: T): T {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
