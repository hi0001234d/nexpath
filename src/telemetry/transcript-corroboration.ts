/**
 * Transcript-corroboration reader.
 *
 * Parses a coding-agent session transcript (the append-only `.jsonl` file the
 * agent writes per session) and extracts behaviour-verified practice evidence
 * from the AGENT-side entries — a test file actually written, the test suite
 * actually run, a security scanner actually invoked, a CI workflow actually
 * edited — as opposed to a practice merely being mentioned in prompt text.
 *
 * The evidence is converted into `channel: 'transcript'` param-events so the
 * longitudinal aggregation can weight verified behaviour above keyword claims.
 * Events carry signal-presence only — **no transcript or prompt text is ever
 * copied into an event** (PII-safe by construction), and every event is
 * stamped with the owning `projectRoot` so evidence never bleeds across
 * projects.
 *
 * Reading is defensive and fail-open: malformed JSONL lines are skipped, a
 * missing/unreadable file yields an empty result, and nothing here performs
 * any LLM or network call — the reader is pure local file parsing. Scans are
 * resumable: callers pass the previous scan's `linesScanned` back as
 * `fromLine` so already-seen transcript lines are never re-emitted.
 */

import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { appendParamEvents, type ParamEventInput } from './param-events.js';
import { getConfig, setConfig } from '../store/config.js';
import type { Store } from '../store/db.js';
import type { Stage } from '../classifier/types.js';

/** One behaviour-verified observation extracted from a transcript entry. */
export interface TranscriptEvidence {
  /** The workflow-discipline signal this behaviour corroborates. */
  signalKey: string;
  /** 0-based line within the scanned text the evidence came from. */
  line: number;
  /** Entry timestamp (ms epoch) when parseable; else null. */
  ts: number | null;
}

export interface TranscriptScanResult {
  evidence: TranscriptEvidence[];
  /**
   * Total transcript lines seen by this scan (including skipped ones). Pass
   * back as `fromLine` on the next scan to read incrementally.
   */
  linesScanned: number;
}

/** Attribution supplied by the caller — which prompt the evidence belongs to. */
export interface EvidenceAttribution {
  projectRoot: string;
  sessionId: string;
  promptIndex: number;
  stage: Stage | null;
  stageConfidence: number | null;
}

/** Tools whose invocation writes file content (a Read is not evidence of creation). */
const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/** Test-file naming conventions across common ecosystems. */
const TEST_FILE_RE =
  /(\.test\.[cm]?[jt]sx?$)|(\.spec\.[cm]?[jt]sx?$)|((^|[\\/])__tests__[\\/])|(_test\.(go|py|rb|ex|exs)$)|((^|[\\/])test_[^\\/]+\.py$)/i;

/**
 * Test-runner invocations (the suite actually ran). Anchored to the start of a
 * shell segment: a command that merely MENTIONS a runner (a grep, an echo, a
 * commit message) is not evidence that tests ran.
 */
const TEST_RUN_RE =
  /^((npx|bunx)\s+)?(vitest|jest|mocha|pytest)\b|^(go|cargo)\s+test\b|^(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/i;

/** Security-scanner invocations — anchored like TEST_RUN_RE. */
const SECURITY_SCAN_RE =
  /^(npm|pnpm|yarn)\s+audit\b|^((npx|bunx)\s+)?(snyk|semgrep|trivy|bandit|osv-scanner|gitleaks|trufflehog)\b/i;

/**
 * Split a shell command into executable segments (`&&`, `||`, `;`, `|`,
 * newlines) and strip leading env-var assignments, so invocation regexes can
 * anchor on the executable itself.
 */
function commandSegments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim().replace(/^(\w+=\S*\s+)+/, ''))
    .filter((s) => s.length > 0);
}

function invokes(command: string, re: RegExp): boolean {
  return commandSegments(command).some((seg) => re.test(seg));
}

/** CI-pipeline configuration files. */
const CI_CONFIG_RE =
  /((^|[\\/])\.github[\\/]workflows[\\/])|((^|[\\/])\.gitlab-ci\.ya?ml$)|((^|[\\/])Jenkinsfile$)|((^|[\\/])\.circleci[\\/])/i;

interface ToolUseBlock {
  name: string;
  filePath: string | null;
  command: string | null;
}

/**
 * Declarative evidence rules: which tool behaviour corroborates which signal.
 * Additions extend this array — detection logic stays single-dispatch.
 */
const EVIDENCE_RULES: ReadonlyArray<{
  signalKey: string;
  matches: (tool: ToolUseBlock) => boolean;
}> = [
  {
    signalKey: 'test_creation',
    matches: (t) => FILE_WRITE_TOOLS.has(t.name) && t.filePath !== null && TEST_FILE_RE.test(t.filePath),
  },
  {
    signalKey: 'regression_check',
    matches: (t) => t.name === 'Bash' && t.command !== null && invokes(t.command, TEST_RUN_RE),
  },
  {
    signalKey: 'security_check',
    matches: (t) => t.name === 'Bash' && t.command !== null && invokes(t.command, SECURITY_SCAN_RE),
  },
  {
    signalKey: 'ci_pipeline',
    matches: (t) => FILE_WRITE_TOOLS.has(t.name) && t.filePath !== null && CI_CONFIG_RE.test(t.filePath),
  },
];

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Extract the tool_use blocks from one agent-side transcript entry, or []. */
function toolUsesOf(entry: unknown): ToolUseBlock[] {
  if (typeof entry !== 'object' || entry === null) return [];
  const e = entry as { type?: unknown; message?: { content?: unknown } };
  if (e.type !== 'assistant') return [];
  const content = e.message?.content;
  if (!Array.isArray(content)) return [];
  const out: ToolUseBlock[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as { type?: unknown; name?: unknown; input?: unknown };
    if (b.type !== 'tool_use' || typeof b.name !== 'string') continue;
    const input = (typeof b.input === 'object' && b.input !== null ? b.input : {}) as Record<string, unknown>;
    out.push({
      name: b.name,
      filePath: asString(input['file_path']),
      command: asString(input['command']),
    });
  }
  return out;
}

function timestampOf(entry: unknown): number | null {
  const raw = (entry as { timestamp?: unknown } | null)?.timestamp;
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Scan raw transcript text for behaviour evidence. Pure — no I/O. Lines before
 * `fromLine` are counted but not parsed (incremental resume); malformed lines
 * are skipped defensively and never abort the scan.
 */
export function scanTranscriptEvidence(raw: string, fromLine = 0): TranscriptScanResult {
  const lines = raw.split('\n');
  // A trailing newline yields one empty final element — not a transcript line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const evidence: TranscriptEvidence[] = [];
  for (let i = fromLine; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue; // malformed line → skip, keep scanning
    }
    const tools = toolUsesOf(entry);
    if (tools.length === 0) continue;
    const ts = timestampOf(entry);
    for (const tool of tools) {
      for (const rule of EVIDENCE_RULES) {
        if (rule.matches(tool)) {
          evidence.push({ signalKey: rule.signalKey, line: i, ts });
        }
      }
    }
  }
  return { evidence, linesScanned: lines.length };
}

export interface TranscriptReadResult {
  evidence: TranscriptEvidence[];
  /** Byte offset just past the last COMPLETE line read — pass back as `fromOffset` next time. */
  nextOffset: number;
}

/**
 * Read the transcript bytes appended since `fromOffset` and scan them for
 * behaviour evidence. The transcript is append-only, so reading from a byte
 * offset keeps the per-hook cost proportional to what was APPENDED, never to
 * the file's total size (a long session's transcript grows to many MB — a
 * full re-read on every prompt would sit on the prompt-submit critical path).
 *
 * Only complete lines are consumed: a partially-appended trailing line stays
 * before `nextOffset` and is re-read once its newline arrives (a newline byte
 * never occurs inside a multi-byte UTF-8 character, so the boundary is safe).
 * Fail-open: a missing/unreadable file yields an empty result; a file that
 * SHRANK at the same path (replaced) yields no evidence and resets the offset
 * to the new end — unattributable content is never credited.
 */
export function readTranscriptEvidence(path: string, fromOffset = 0): TranscriptReadResult {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    if (size < fromOffset) return { evidence: [], nextOffset: size };
    if (size === fromOffset) return { evidence: [], nextOffset: fromOffset };
    const buf = Buffer.alloc(size - fromOffset);
    const read = readSync(fd, buf, 0, buf.length, fromOffset);
    const lastNewline = buf.subarray(0, read).lastIndexOf(0x0a);
    if (lastNewline === -1) return { evidence: [], nextOffset: fromOffset };
    const chunk = buf.subarray(0, lastNewline + 1).toString('utf8');
    return { evidence: scanTranscriptEvidence(chunk).evidence, nextOffset: fromOffset + lastNewline + 1 };
  } catch {
    return { evidence: [], nextOffset: fromOffset };
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
  }
}

/**
 * Convert scanned evidence into param-event inputs under one attribution.
 * Each distinct signal key yields exactly ONE event per attributed prompt
 * (count-once — repeated evidence for the same practice within the scan
 * window must not inflate the aggregate). Events carry signal-presence only;
 * when the transcript entry had a timestamp, the event keeps the behaviour's
 * own time (latest occurrence) rather than the write time.
 */
export function evidenceToParamEvents(
  evidence: readonly TranscriptEvidence[],
  attribution: EvidenceAttribution,
): ParamEventInput[] {
  const latestTs = new Map<string, number | null>();
  for (const ev of evidence) {
    const prev = latestTs.get(ev.signalKey);
    if (prev === undefined) {
      latestTs.set(ev.signalKey, ev.ts);
    } else if (ev.ts !== null && (prev === null || ev.ts > prev)) {
      latestTs.set(ev.signalKey, ev.ts);
    }
  }
  return [...latestTs.entries()].map(([signalKey, ts]) => ({
    projectRoot:     attribution.projectRoot,
    sessionId:       attribution.sessionId,
    promptIndex:     attribution.promptIndex,
    signalKey,
    channel:         'transcript' as const,
    stage:           attribution.stage,
    stageConfidence: attribution.stageConfidence,
    source:          'live' as const,
    ...(ts !== null ? { ts } : {}),
  }));
}

// ── Store-backed orchestration (called from the prompt-capture hook) ──────────

/**
 * Persisted resume state: which transcript file the last scan read, where it
 * stopped, and which prompt the NEXT batch of evidence belongs to. The agent
 * responds to a prompt AFTER the hook for that prompt has run, so behaviour
 * appended since the previous hook is credited to the PREVIOUS prompt — the
 * attribution saved on the cursor — never to the prompt being submitted now.
 */
interface TranscriptCursor {
  path: string;
  offset: number;
  attribution: EvidenceAttribution;
}

const cursorKey = (projectRoot: string): string => `transcript_cursor:${projectRoot}`;

function loadCursor(store: Store, projectRoot: string): TranscriptCursor | null {
  const raw = getConfig(store.db, cursorKey(projectRoot));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TranscriptCursor;
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof parsed.path !== 'string' ||
      typeof parsed.offset !== 'number' ||
      typeof parsed.attribution !== 'object' || parsed.attribution === null
    ) return null;
    return parsed;
  } catch {
    return null; // corrupt cursor → start fresh
  }
}

/**
 * Read the transcript entries appended since the last hook, credit their
 * behaviour evidence to the previously-submitted prompt, and advance the
 * cursor to the current prompt. The FIRST observation for a project only
 * initialises the cursor — pre-existing transcript history is never credited
 * to any prompt. Fail-open: a missing/unreadable transcript or a corrupt
 * cursor never throws; the caller wraps this best-effort.
 */
export function recordTranscriptCorroboration(
  store: Store,
  projectRoot: string,
  transcriptPath: string,
  current: { sessionId: string; promptIndex: number; stage: Stage | null; stageConfidence: number | null },
): void {
  const cursor = loadCursor(store, projectRoot);
  let offset: number;

  if (cursor === null) {
    // Initialisation — record the file's current end so the next hook reads
    // only appended bytes. No content is read or credited.
    try {
      offset = statSync(transcriptPath).size;
    } catch {
      offset = 0;
    }
  } else if (cursor.path !== transcriptPath) {
    // The agent started a new transcript file: drain the old file's tail, then
    // read the new file from the top — all of it is behaviour that happened
    // after the previously-attributed prompt.
    const drained = readTranscriptEvidence(cursor.path, cursor.offset).evidence;
    const fresh = readTranscriptEvidence(transcriptPath);
    appendParamEvents(store, evidenceToParamEvents([...drained, ...fresh.evidence], cursor.attribution));
    offset = fresh.nextOffset;
  } else {
    const res = readTranscriptEvidence(transcriptPath, cursor.offset);
    appendParamEvents(store, evidenceToParamEvents(res.evidence, cursor.attribution));
    offset = res.nextOffset;
  }

  const next: TranscriptCursor = {
    path: transcriptPath,
    offset,
    attribution: {
      projectRoot,
      sessionId:       current.sessionId,
      promptIndex:     current.promptIndex,
      stage:           current.stage,
      stageConfidence: current.stageConfidence,
    },
  };
  setConfig(store, cursorKey(projectRoot), JSON.stringify(next));
}
