/**
 * The submit-decision record (hook milestone H3) — the one contract shared by the
 * two processes that cannot call each other.
 *
 * The Windsurf hook is a CLI subprocess: it blocks the prompt (`exit 2`) and must
 * hand its decision to the extension host, which is the only side that can inject
 * (verified: `injectViaCascadeAction` needs a real `vscode.commands.executeCommand`,
 * and `windsurf-hook.ts` imports no `vscode`). This module defines what crosses
 * that boundary, and nothing else — deliberately kept free of any `vscode` import
 * so BOTH sides can consume it.
 *
 * WHY A VALIDATOR RATHER THAN A BARE TYPE. The record is written by one process
 * and read by another, so at read time it is untrusted input: a partially-written
 * file, a record from an older nexpath, or a corrupted row must never crash the
 * poller or — far worse — inject the wrong text into a user's chat. Every failure
 * resolves to `null`, which the poller treats as "nothing pending" (fail-open,
 * `A3`). This mirrors `pe-payload.ts`'s `parsePromptEnhancementExtensionPayloadV1`,
 * which takes the same defensive stance on the same kind of boundary.
 *
 * PRIVACY. `replacementText` is the only free text here and it is the text the
 * user themselves chose to send. The original prompt is deliberately NOT carried:
 * nothing downstream needs it, and keeping it would put a second copy of the
 * user's prompt on disk for no benefit — exactly the raw-prompt-on-disk leak
 * class a tracked bug was raised for. `decisionId` is an opaque correlator and
 * must never be rendered.
 */

/** Wire version. Bumped only on a breaking shape change; readers reject anything else. */
export const SUBMIT_DECISION_SCHEMA_V1 = 1 as const;

export interface SubmitDecisionRecordV1 {
  schemaVersion: typeof SUBMIT_DECISION_SCHEMA_V1;
  /** Opaque correlator for timing records. Never rendered to the user. */
  decisionId: string;
  /** The text that replaces the blocked prompt. */
  replacementText: string;
  /** Epoch ms when the hook persisted this. Drives the poller's stale-turn guard. */
  createdAt: number;
  /** When the hook decided to block (stage 1 of the mandated five). */
  blockIssuedAt: number;
  /** PID of the hook that issued the block; used to defer until it has exited. */
  hookPid: number;
  /**
   * RC30 (Windows/Devin tester, 2026-08-21): PID of the SHELL that spawned the
   * hook, written **on win32 only**.
   *
   * On Windows Cascade executes the `powershell` field, so the tree is
   * `powershell.exe → node.exe` and `hookPid` is the NODE process. Cascade acts
   * on the WRAPPER's exit, which is strictly later — so waiting only on
   * `hookPid` clears too early (measured: the extension injected 58 ms after the
   * decision was persisted) and the replacement lands while the original prompt
   * is still live, queueing behind it. That is the reported "injected but stuck
   * in the queue until the old prompt was cancelled".
   *
   * OMITTED on POSIX, where the `command` field runs with no such wrapper —
   * so the record, and every decision made from it, is byte-identical to
   * pre-RC30 on Linux/macOS. Optional so older records stay valid.
   */
  hookShellPid?: number;
  /** Which host produced it — so a Cursor record can never be delivered to Windsurf. */
  host: 'windsurf' | 'cursor';
  /**
   * RC22: the project the hook was running in. Present only to let the
   * cwd-independent USER-LEVEL mirror be matched to the right editor window;
   * the project-local file does not need it. Optional so older records (and
   * the hermetic fixtures) stay valid — its absence only costs the mirror its
   * strictest match, never the primary path.
   */
  projectRoot?: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Parse an untrusted record. Returns `null` on ANY problem — never throws, never
 * partially accepts. A rejected record means "nothing pending", which leaves the
 * user's original prompt exactly as the hook left it.
 */
export function parseSubmitDecisionRecordV1(raw: unknown): SubmitDecisionRecordV1 | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  if (r.schemaVersion !== SUBMIT_DECISION_SCHEMA_V1) return null;
  if (!isNonEmptyString(r.decisionId)) return null;
  // An empty replacement is rejected on purpose: injecting "" would clear the
  // composer and silently lose the turn, which is worse than doing nothing.
  if (!isNonEmptyString(r.replacementText)) return null;
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) return null;
  if (typeof r.blockIssuedAt !== 'number' || !Number.isFinite(r.blockIssuedAt)) return null;
  if (typeof r.hookPid !== 'number' || !Number.isInteger(r.hookPid) || r.hookPid <= 0) return null;
  if (r.host !== 'windsurf' && r.host !== 'cursor') return null;

  return {
    schemaVersion: SUBMIT_DECISION_SCHEMA_V1,
    decisionId: r.decisionId,
    replacementText: r.replacementText,
    createdAt: r.createdAt,
    blockIssuedAt: r.blockIssuedAt,
    hookPid: r.hookPid,
    host: r.host,
    ...(typeof r.hookShellPid === 'number' && Number.isInteger(r.hookShellPid) && r.hookShellPid > 0
      ? { hookShellPid: r.hookShellPid }
      : {}),
    ...(isNonEmptyString(r.projectRoot) ? { projectRoot: r.projectRoot } : {}),
  };
}

/** Parse from JSON text (what the hook actually writes). Malformed JSON ⇒ `null`. */
export function parseSubmitDecisionJsonV1(text: string): SubmitDecisionRecordV1 | null {
  try {
    return parseSubmitDecisionRecordV1(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Build a record on the hook side. Kept here so both sides share one shape. */
export function buildSubmitDecisionRecordV1(input: {
  decisionId: string;
  replacementText: string;
  createdAt: number;
  host: 'windsurf' | 'cursor';
  blockIssuedAt: number;
  hookPid: number;
}): SubmitDecisionRecordV1 {
  return { schemaVersion: SUBMIT_DECISION_SCHEMA_V1, ...input };
}

/**
 * Redacted description for logs. **Never** includes `replacementText` — that is
 * the user's prompt content and must not reach a log, diagnostic, or telemetry
 * sink (the raw-prompt-log leak class). Length only, so a delivery can still be correlated.
 */
export function describeSubmitDecisionSafely(r: SubmitDecisionRecordV1): {
  decisionId: string; host: string; createdAt: number; replacementLength: number;
} {
  return {
    decisionId: r.decisionId,
    host: r.host,
    createdAt: r.createdAt,
    replacementLength: r.replacementText.length,
  };
}
