/**
 * Feature 1 — Context Engineering: Work-Pattern Learner R3 (Module 8, Piece 5)
 *
 * Inspects developer session transcripts and git diffs asynchronously for:
 *  1. under_implemented: Newly introduced TODO/FIXME comments or dummy stub functions.
 *  2. behavioral_drift: Code modifications deviating from locked architectural rules.
 *  3. operational_risk: Fragile patterns (multi-step mutations without rollbacks, unhandled async API calls).
 *
 * Automatically detects when existing pattern alerts have been resolved by subsequent edits.
 */

import type {
  PatternAlert,
  PatternAlertCategory,
  PostSessionAnalysisResult,
  ContextMemoryRow,
  SessionTurn,
} from '../types/context-engineering.js';

// ============================================================================
// Detection Patterns
// ============================================================================

// TODO/FIXME comments added in git diff (+ lines)
const TODO_COMMENT_REGEX =
  /^\+\s*(?:\/\/|\/\*|#|<!--|--)\s*(TODO|FIXME|HACK|XXX)\s*:?\s*(.+)$/im;

// Stub functions (returning null/empty or throwing not implemented)
const STUB_BODY_REGEX =
  /^\+\s*(?:throw\s+new\s+Error\s*\(\s*['"`](?:not\s+implemented|todo|stub)['"`]\s*\)|return\s+(?:null|undefined|\{\}|\[\])\s*;\s*(?:\/\/|\/\*)\s*(?:stub|todo|temporary))/i;

// Unhandled async network calls (fetch / axios / http without catch/error boundary)
const UNHANDLED_NETWORK_REGEX =
  /^\+\s*(?:await\s+)?(?:fetch\(|axios\.(?:get|post|put|delete)\(|https?\.(?:request|get)\()/i;

// Multi-step database mutations without transaction/rollback
const MULTI_STEP_DB_MUTATION_REGEX =
  /^\+\s*(?:await\s+)?(?:db\.(?:insert|update|delete|query|raw)|pool\.query|prisma\.\w+\.(?:create|update|delete)|client\.query)\(/i;

const TRANSACTION_KEYWORDS_REGEX =
  /\b(transaction|startTransaction|beginTransaction|\$transaction|rollback|commit|BEGIN|COMMIT|ROLLBACK)\b/i;

const ERROR_HANDLING_REGEX =
  /\b(try\s*\{|\.catch\s*\(|catch\s*\(|onError|errorBoundary)\b/i;

// File diff header in git diff: diff --git a/path/to/file.ts b/path/to/file.ts
const DIFF_FILE_HEADER_REGEX = /^diff\s+--git\s+a\/(\S+)\s+b\/(\S+)/;
const DIFF_FILE_PATH_REGEX = /^\+\+\+\s+b\/(\S+)/;

// ============================================================================
// Core Analysis Engine
// ============================================================================

/**
 * Analyzes session turns, git diffs, and existing architectural rules to detect
 * under-implemented requirements, behavioral drift, and operational risks.
 * Satisfies Module 8 & Spec R3.
 */
export async function analyzeSessionPatterns(
  sessionTurns: Array<{ prompt: string; response: string }> = [],
  gitDiff = '',
  existingRules: ContextMemoryRow[] = [],
  activeAlerts: ContextMemoryRow[] = [],
  meta?: { projectId?: string; sessionId?: string }
): Promise<PostSessionAnalysisResult> {
  const startTime = performance.now();
  const projectId = meta?.projectId || 'current_project';
  const sessionId = meta?.sessionId;

  const alerts: PatternAlert[] = [];
  const resolvedAlertIds: number[] = [];

  // Parse git diff into per-file chunks
  const fileDiffs = parseGitDiffByFile(gitDiff);

  // --------------------------------------------------------------------------
  // 1. Under-Implemented Requirements (TODO / Stubs)
  // --------------------------------------------------------------------------
  for (const { file, addedLines, rawChunk } of fileDiffs) {
    for (const line of addedLines) {
      // Check for TODO/FIXME
      const todoMatch = line.match(TODO_COMMENT_REGEX);
      if (todoMatch) {
        const tag = todoMatch[1].toUpperCase();
        const detail = todoMatch[2].trim();
        alerts.push({
          kind: 'pattern_alert',
          category: 'under_implemented',
          text: `Pending ${tag}: ${detail} in ${file}`,
          targetFile: file,
          evidence: line.trim(),
          confidence: 0.85,
          key: `alert:under_implemented:${file}:${slugify(detail)}`,
        });
      }

      // Check for Stub function
      if (STUB_BODY_REGEX.test(line)) {
        alerts.push({
          kind: 'pattern_alert',
          category: 'under_implemented',
          text: `Stub or un-implemented function in ${file}`,
          targetFile: file,
          evidence: line.trim(),
          confidence: 0.80,
          key: `alert:under_implemented:${file}:stub_function`,
        });
      }
    }
  }

  // Also check assistant responses for explicit TODO or stub warnings
  for (const turn of sessionTurns) {
    const resp = turn.response || '';
    if (resp.includes('// TODO:') || resp.includes('/* TODO:')) {
      const match = resp.match(/\/\/\s*TODO:\s*([^\n\r]+)/i);
      if (match) {
        const detail = match[1].trim();
        alerts.push({
          kind: 'pattern_alert',
          category: 'under_implemented',
          text: `Unresolved TODO mentioned in turn: ${detail}`,
          evidence: match[0],
          confidence: 0.70,
          key: `alert:under_implemented:session:${slugify(detail)}`,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. Operational Risks (Multi-step DB without rollback, unhandled async calls)
  // --------------------------------------------------------------------------
  for (const { file, addedLines, rawChunk } of fileDiffs) {
    const hasDbMutations = addedLines.some((l) => MULTI_STEP_DB_MUTATION_REGEX.test(l));
    const hasTransactions = TRANSACTION_KEYWORDS_REGEX.test(rawChunk);

    if (hasDbMutations && !hasTransactions) {
      alerts.push({
        kind: 'pattern_alert',
        category: 'operational_risk',
        text: `Database mutation in ${file} executed without an explicit transaction rollback`,
        targetFile: file,
        evidence: addedLines.find((l) => MULTI_STEP_DB_MUTATION_REGEX.test(l))?.trim() || file,
        confidence: 0.85,
        key: `alert:operational_risk:${file}:missing_transaction_rollback`,
      });
    }

    const hasUnhandledNetwork = addedLines.some((l) => UNHANDLED_NETWORK_REGEX.test(l));
    const hasErrorHandling = ERROR_HANDLING_REGEX.test(rawChunk);

    if (hasUnhandledNetwork && !hasErrorHandling) {
      alerts.push({
        kind: 'pattern_alert',
        category: 'operational_risk',
        text: `Unhandled asynchronous network request in ${file} without error boundary or catch block`,
        targetFile: file,
        evidence: addedLines.find((l) => UNHANDLED_NETWORK_REGEX.test(l))?.trim() || file,
        confidence: 0.80,
        key: `alert:operational_risk:${file}:unhandled_network_error`,
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3. Behavioral Drift (Contradicting locked architectural rules)
  // --------------------------------------------------------------------------
  const activeRules = existingRules.filter((r) => r.active === 1 && r.superseded_by === null);

  for (const rule of activeRules) {
    const ruleContentLower = rule.content.toLowerCase();

    for (const { file, addedLines, rawChunk } of fileDiffs) {
      // Rule 1: Retry policy deviation
      const isRetryRule = /\b(retry|retries|backoff)\b/i.test(ruleContentLower);
      if (isRetryRule) {
        for (const line of addedLines) {
          const lineLower = line.toLowerCase();
          const mentionsRetry = /\b(retry|retries|backoff|attempt|attempts|maxattempts)\b/i.test(lineLower);
          if (mentionsRetry) {
            // Check if hardcoded retry count differs from rule
            const numMatch = line.match(/\b([4-9]|[1-9]\d+)\b/);
            if (numMatch && (ruleContentLower.includes('3') || ruleContentLower.includes('three'))) {
              alerts.push({
                kind: 'pattern_alert',
                category: 'behavioral_drift',
                text: `Retry logic in ${file} introduces ${numMatch[0]} attempts, deviating from locked rule: "${rule.content}"`,
                targetFile: file,
                evidence: line.trim(),
                confidence: 0.85,
                key: `alert:behavioral_drift:${file}:retry_limit_deviation`,
              });
            }
          }
        }
      }

      // Rule 2: Central repository / architecture bypass (direct DB access in routes/controllers)
      if (
        (ruleContentLower.includes('repository') || ruleContentLower.includes('only entry point') || ruleContentLower.includes('layer')) &&
        (file.includes('route') || file.includes('controller') || file.includes('handler') || file.includes('api'))
      ) {
        for (const line of addedLines) {
          if (MULTI_STEP_DB_MUTATION_REGEX.test(line) || line.includes('db.query') || line.includes('pool.query')) {
            alerts.push({
              kind: 'pattern_alert',
              category: 'behavioral_drift',
              text: `Direct database access in ${file} bypasses central repository layer locked in rule: "${rule.content}"`,
              targetFile: file,
              evidence: line.trim(),
              confidence: 0.90,
              key: `alert:behavioral_drift:${file}:bypasses_repository_layer`,
            });
          }
        }
      }

      // Rule 3: Auth middleware bypass
      if (ruleContentLower.includes('auth') || ruleContentLower.includes('session') || ruleContentLower.includes('verifysession')) {
        if (file.includes('route') || file.includes('api') || file.includes('endpoint')) {
          for (const line of addedLines) {
            if (line.includes('app.get(') || line.includes('app.post(') || line.includes('router.')) {
              if (!line.includes('auth') && !line.includes('verifySession') && !rawChunk.includes('verifySession')) {
                alerts.push({
                  kind: 'pattern_alert',
                  category: 'behavioral_drift',
                  text: `New route in ${file} lacks required authentication middleware specified in rule: "${rule.content}"`,
                  targetFile: file,
                  evidence: line.trim(),
                  confidence: 0.85,
                  key: `alert:behavioral_drift:${file}:missing_auth_middleware`,
                });
              }
            }
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. Auto-Resolution of Previous Pattern Alerts (TC-R3-6, TC-E2E-14)
  // --------------------------------------------------------------------------
  for (const activeAlert of activeAlerts) {
    const alertIdentities = activeAlert.identities || [];
    const targetFile = alertIdentities[0]?.file;
    const content = activeAlert.content || '';
    const key = activeAlert.key || '';

    if (!targetFile) continue;

    const matchingFileDiff = fileDiffs.find((f) => f.file === targetFile);
    if (!matchingFileDiff) continue;

    const { removedLines, addedLines, rawChunk } = matchingFileDiff;

    // Check resolution of TODO / under_implemented: TODO was removed
    if (activeAlert.content.includes('TODO') || key.includes('under_implemented')) {
      const todoRemoved = removedLines.some((l) => /-\s*(?:\/\/|\/\*|#|<!--|--)?\s*(TODO|FIXME)/i.test(l) || l.includes('TODO') || l.includes('FIXME'));
      const noNewTodo = !addedLines.some((l) => /(?:\/\/|\/\*|#|<!--|--)?\s*(TODO|FIXME)/i.test(l));
      if (todoRemoved && noNewTodo) {
        resolvedAlertIds.push(activeAlert.id);
        continue;
      }
    }

    // Check resolution of operational_risk: Transaction rollback or catch block was added
    if (activeAlert.content.includes('transaction rollback') || key.includes('missing_transaction_rollback')) {
      if (TRANSACTION_KEYWORDS_REGEX.test(rawChunk)) {
        resolvedAlertIds.push(activeAlert.id);
        continue;
      }
    }

    if (activeAlert.content.includes('error boundary') || key.includes('unhandled_network_error')) {
      if (ERROR_HANDLING_REGEX.test(rawChunk)) {
        resolvedAlertIds.push(activeAlert.id);
        continue;
      }
    }

    // Check resolution of behavioral drift: Code fixed
    if (key.includes('behavioral_drift') && activeAlert.content.includes('repository')) {
      if (!MULTI_STEP_DB_MUTATION_REGEX.test(rawChunk) && !rawChunk.includes('db.query')) {
        resolvedAlertIds.push(activeAlert.id);
        continue;
      }
    }
  }

  // Deduplicate alerts by key
  const uniqueAlertsMap = new Map<string, PatternAlert>();
  for (const a of alerts) {
    const alertKey = a.key || `${a.category}:${a.targetFile || 'global'}:${a.text}`;
    if (!uniqueAlertsMap.has(alertKey)) {
      uniqueAlertsMap.set(alertKey, a);
    }
  }

  const executionTimeMs = Number((performance.now() - startTime).toFixed(3));

  return {
    sessionId,
    projectId,
    alerts: Array.from(uniqueAlertsMap.values()),
    resolvedAlertIds,
    executionTimeMs,
  };
}

// ============================================================================
// Git Diff Parser Helper
// ============================================================================

interface ParsedFileDiff {
  file: string;
  addedLines: string[];
  removedLines: string[];
  rawChunk: string;
}

function parseGitDiffByFile(gitDiff: string): ParsedFileDiff[] {
  if (!gitDiff || typeof gitDiff !== 'string') return [];

  const results: ParsedFileDiff[] = [];
  const lines = gitDiff.split(/\r?\n/);

  let currentFile: string | null = null;
  let currentAdded: string[] = [];
  let currentRemoved: string[] = [];
  let currentRawChunk: string[] = [];

  function flush() {
    if (currentFile) {
      results.push({
        file: currentFile,
        addedLines: currentAdded,
        removedLines: currentRemoved,
        rawChunk: currentRawChunk.join('\n'),
      });
    }
    currentFile = null;
    currentAdded = [];
    currentRemoved = [];
    currentRawChunk = [];
  }

  for (const line of lines) {
    const diffHeaderMatch = line.match(DIFF_FILE_HEADER_REGEX);
    if (diffHeaderMatch) {
      flush();
      currentFile = diffHeaderMatch[2];
      currentRawChunk.push(line);
      continue;
    }

    const pathHeaderMatch = line.match(DIFF_FILE_PATH_REGEX);
    if (pathHeaderMatch) {
      if (!currentFile) currentFile = pathHeaderMatch[1];
      currentRawChunk.push(line);
      continue;
    }

    if (currentFile) {
      currentRawChunk.push(line);
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentAdded.push(line);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentRemoved.push(line);
      }
    }
  }

  flush();
  return results;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 32);
}
