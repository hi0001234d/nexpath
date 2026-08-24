import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scanTranscriptEvidence,
  readTranscriptEvidence,
  evidenceToParamEvents,
  recordTranscriptCorroboration,
  type EvidenceAttribution,
} from './transcript-corroboration.js';
import { readParamEvents } from './param-events.js';
import { getConfig, setConfig } from '../store/config.js';
import { openStore, closeStore, type Store } from '../store/db.js';

// ── fixture builders (mirror the real agent-transcript entry shapes) ─────────

function assistantToolUse(
  tools: Array<{ name: string; input: Record<string, unknown> }>,
  timestamp = '2026-07-11T10:00:00.000Z',
): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp,
    sessionId: 'cc-session-1',
    message: {
      role: 'assistant',
      content: tools.map((t) => ({ type: 'tool_use', id: 'tu_1', name: t.name, input: t.input })),
    },
  });
}

function assistantText(text: string): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-07-11T10:00:00.000Z',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });
}

function userPrompt(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}

function toolResult(text: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', content: text }] },
  });
}

const ATTRIBUTION: EvidenceAttribution = {
  projectRoot: '/home/u/proj',
  sessionId: 'nexpath-session-9',
  promptIndex: 4,
  stage: 'implementation',
  stageConfidence: 0.8,
};

// ── evidence extraction ───────────────────────────────────────────────────────

describe('scanTranscriptEvidence — behaviour evidence extraction', () => {
  it('detects a test file written via the Write tool', () => {
    const raw = assistantToolUse([{ name: 'Write', input: { file_path: '/p/src/util.test.ts', content: 'x' } }]) + '\n';
    const res = scanTranscriptEvidence(raw);
    expect(res.evidence.map((e) => e.signalKey)).toEqual(['test_creation']);
    expect(res.evidence[0]?.ts).toBe(Date.parse('2026-07-11T10:00:00.000Z'));
  });

  it('detects a spec file edited via the Edit tool', () => {
    const raw = assistantToolUse([{ name: 'Edit', input: { file_path: 'src/api.spec.js', old_string: 'a', new_string: 'b' } }]) + '\n';
    expect(scanTranscriptEvidence(raw).evidence.map((e) => e.signalKey)).toEqual(['test_creation']);
  });

  it('detects __tests__/ and python test-file conventions', () => {
    const raw = [
      assistantToolUse([{ name: 'Write', input: { file_path: 'pkg/__tests__/thing.js' } }]),
      assistantToolUse([{ name: 'Write', input: { file_path: 'app/test_models.py' } }]),
    ].join('\n') + '\n';
    expect(scanTranscriptEvidence(raw).evidence.map((e) => e.signalKey)).toEqual([
      'test_creation',
      'test_creation',
    ]);
  });

  it('detects the test suite actually being run', () => {
    const raw = [
      assistantToolUse([{ name: 'Bash', input: { command: 'npm run test', description: 'run tests' } }]),
      assistantToolUse([{ name: 'Bash', input: { command: 'npx vitest run src/x.test.ts' } }]),
    ].join('\n') + '\n';
    expect(scanTranscriptEvidence(raw).evidence.map((e) => e.signalKey)).toEqual([
      'regression_check',
      'regression_check',
    ]);
  });

  it('detects a security scanner invocation', () => {
    const raw = assistantToolUse([{ name: 'Bash', input: { command: 'npm audit --production' } }]) + '\n';
    expect(scanTranscriptEvidence(raw).evidence.map((e) => e.signalKey)).toEqual(['security_check']);
  });

  it('detects a CI workflow file being written', () => {
    const raw = assistantToolUse([{ name: 'Write', input: { file_path: '.github/workflows/ci.yml' } }]) + '\n';
    expect(scanTranscriptEvidence(raw).evidence.map((e) => e.signalKey)).toEqual(['ci_pipeline']);
  });

  it('a Read of a test file is NOT creation evidence', () => {
    const raw = assistantToolUse([{ name: 'Read', input: { file_path: '/p/src/util.test.ts' } }]) + '\n';
    expect(scanTranscriptEvidence(raw).evidence).toEqual([]);
  });

  it('a non-test file write yields no evidence', () => {
    const raw = assistantToolUse([{ name: 'Write', input: { file_path: 'src/index.ts' } }]) + '\n';
    expect(scanTranscriptEvidence(raw).evidence).toEqual([]);
  });

  it('a command that only MENTIONS a runner is not run evidence', () => {
    const raw = [
      assistantToolUse([{ name: 'Bash', input: { command: 'git commit -m "fix: npm test now passes"' } }]),
      assistantToolUse([{ name: 'Bash', input: { command: 'grep -rn "vitest" src/' } }]),
      assistantToolUse([{ name: 'Bash', input: { command: 'echo "run snyk later"' } }]),
      assistantToolUse([{ name: 'Bash', input: { command: 'cat docs/npm-audit-notes.md' } }]),
    ].join('\n') + '\n';
    expect(scanTranscriptEvidence(raw).evidence).toEqual([]);
  });

  it('anchored invocation still matches through chains, pipes and env prefixes', () => {
    const raw = [
      assistantToolUse([{ name: 'Bash', input: { command: 'cd pkg && npm test' } }]),
      assistantToolUse([{ name: 'Bash', input: { command: 'npx vitest run | tee out.log' } }]),
      assistantToolUse([{ name: 'Bash', input: { command: 'NODE_ENV=test CI=1 pytest -q' } }]),
      assistantToolUse([{ name: 'Bash', input: { command: 'npm audit; npm test' } }]),
    ].join('\n') + '\n';
    // The last command matches two rules; evidence follows rule-declaration order.
    expect(scanTranscriptEvidence(raw).evidence.map((e) => e.signalKey)).toEqual([
      'regression_check',
      'regression_check',
      'regression_check',
      'regression_check',
      'security_check',
    ]);
  });

  it('mentioning tests in agent text or user prompts is not evidence (claims are not behaviour)', () => {
    const raw = [
      userPrompt('please write tests for everything'),
      assistantText('I will write tests and run npm audit'),
      toolResult('npm test output: 5 passed'),
    ].join('\n') + '\n';
    expect(scanTranscriptEvidence(raw).evidence).toEqual([]);
  });

  it('skips malformed lines defensively and keeps scanning', () => {
    const raw = [
      '{not valid json',
      assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]),
      '"just a string"',
      'null',
      assistantToolUse([{ name: 'Bash', input: { command: 'pytest -q' } }]),
    ].join('\n') + '\n';
    const res = scanTranscriptEvidence(raw);
    expect(res.evidence.map((e) => e.signalKey)).toEqual(['test_creation', 'regression_check']);
    expect(res.linesScanned).toBe(5);
  });

  it('resumes incrementally: lines before fromLine are never re-emitted', () => {
    const first = assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]);
    const res1 = scanTranscriptEvidence(first + '\n');
    expect(res1.evidence).toHaveLength(1);
    expect(res1.linesScanned).toBe(1);

    const appended = first + '\n' + assistantToolUse([{ name: 'Bash', input: { command: 'npm audit' } }]) + '\n';
    const res2 = scanTranscriptEvidence(appended, res1.linesScanned);
    expect(res2.evidence.map((e) => e.signalKey)).toEqual(['security_check']);
    expect(res2.linesScanned).toBe(2);
  });
});

// ── file-backed reading ───────────────────────────────────────────────────────

describe('readTranscriptEvidence — incremental, fail-open file reading', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'transcript-corr-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads a transcript file end-to-end and reports the consumed offset', () => {
    const p = join(dir, 't.jsonl');
    const content = assistantToolUse([{ name: 'Write', input: { file_path: 'x.spec.ts' } }]) + '\n';
    writeFileSync(p, content, 'utf8');
    const res = readTranscriptEvidence(p);
    expect(res.evidence.map((e) => e.signalKey)).toEqual(['test_creation']);
    expect(res.nextOffset).toBe(Buffer.byteLength(content));
  });

  it('reads only the bytes appended after fromOffset', () => {
    const p = join(dir, 't.jsonl');
    const first = assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]) + '\n';
    writeFileSync(p, first, 'utf8');
    const r1 = readTranscriptEvidence(p);
    appendFileSync(p, assistantToolUse([{ name: 'Bash', input: { command: 'npm audit' } }]) + '\n');
    const r2 = readTranscriptEvidence(p, r1.nextOffset);
    expect(r2.evidence.map((e) => e.signalKey)).toEqual(['security_check']);
  });

  it('a partially-appended trailing line is not consumed until its newline arrives', () => {
    const p = join(dir, 't.jsonl');
    const complete = assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]) + '\n';
    const partial = assistantToolUse([{ name: 'Bash', input: { command: 'npm test' } }]);
    writeFileSync(p, complete + partial, 'utf8'); // no trailing newline on the second entry
    const r1 = readTranscriptEvidence(p);
    expect(r1.evidence.map((e) => e.signalKey)).toEqual(['test_creation']);
    expect(r1.nextOffset).toBe(Buffer.byteLength(complete));
    appendFileSync(p, '\n'); // the newline lands
    const r2 = readTranscriptEvidence(p, r1.nextOffset);
    expect(r2.evidence.map((e) => e.signalKey)).toEqual(['regression_check']);
  });

  it('a file that shrank at the same path yields no evidence and resets to the new end', () => {
    const p = join(dir, 't.jsonl');
    writeFileSync(p, 'short\n', 'utf8');
    const res = readTranscriptEvidence(p, 9999);
    expect(res.evidence).toEqual([]);
    expect(res.nextOffset).toBe(6);
  });

  it('a missing file yields an empty result and never throws', () => {
    const res = readTranscriptEvidence(join(dir, 'not-here.jsonl'), 7);
    expect(res.evidence).toEqual([]);
    expect(res.nextOffset).toBe(7);
  });
});

// ── event conversion ──────────────────────────────────────────────────────────

describe('evidenceToParamEvents — signal-presence events under one attribution', () => {
  it('emits transcript-channel events stamped with the attribution and the behaviour time', () => {
    const raw = assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]) + '\n';
    const events = evidenceToParamEvents(scanTranscriptEvidence(raw).evidence, ATTRIBUTION);
    expect(events).toEqual([
      {
        projectRoot: '/home/u/proj',
        sessionId: 'nexpath-session-9',
        promptIndex: 4,
        signalKey: 'test_creation',
        channel: 'transcript',
        stage: 'implementation',
        stageConfidence: 0.8,
        source: 'live',
        ts: Date.parse('2026-07-11T10:00:00.000Z'),
      },
    ]);
  });

  it('omits ts when the transcript entry carried no parseable timestamp (writer stamps then)', () => {
    const raw = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'a.test.ts' } }] },
    }) + '\n';
    const events = evidenceToParamEvents(scanTranscriptEvidence(raw).evidence, ATTRIBUTION);
    expect(events).toHaveLength(1);
    expect('ts' in (events[0] ?? {})).toBe(false);
  });

  it('counts each signal once per attributed prompt (repeated behaviour does not inflate)', () => {
    const raw = [
      assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]),
      assistantToolUse([{ name: 'Edit', input: { file_path: 'a.test.ts', old_string: 'x', new_string: 'y' } }]),
      assistantToolUse([{ name: 'Bash', input: { command: 'npm test' } }]),
    ].join('\n') + '\n';
    const events = evidenceToParamEvents(scanTranscriptEvidence(raw).evidence, ATTRIBUTION);
    expect(events.map((e) => e.signalKey).sort()).toEqual(['regression_check', 'test_creation']);
  });

  it('never copies transcript text into an event', () => {
    const raw = assistantToolUse([
      { name: 'Bash', input: { command: 'npm test -- --secret sk-abc123' } },
    ]) + '\n';
    const events = evidenceToParamEvents(scanTranscriptEvidence(raw).evidence, ATTRIBUTION);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('sk-abc123');
    expect(serialized).not.toContain('npm test');
    expect(Object.keys(events[0] ?? {}).sort()).toEqual([
      'channel', 'projectRoot', 'promptIndex', 'sessionId', 'signalKey', 'source', 'stage', 'stageConfidence', 'ts',
    ]);
  });
});

// ── hook-side orchestration ───────────────────────────────────────────────────

describe('recordTranscriptCorroboration — cursor + previous-prompt crediting', () => {
  let dir: string;
  let store: Store;
  let transcript: string;
  const ROOT = '/home/u/proj';

  const promptAt = (index: number) => ({
    sessionId: 'sess-1',
    promptIndex: index,
    stage: 'implementation' as const,
    stageConfidence: 0.8,
  });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'transcript-hook-'));
    store = await openStore(join(dir, 'prompt-store.db'));
    transcript = join(dir, 'session-a.jsonl');
  });

  afterEach(() => {
    closeStore(store);
    rmSync(dir, { recursive: true, force: true });
  });

  it('first observation initialises the cursor without crediting old history', () => {
    writeFileSync(transcript, assistantToolUse([{ name: 'Write', input: { file_path: 'old.test.ts' } }]) + '\n', 'utf8');
    recordTranscriptCorroboration(store, ROOT, transcript, promptAt(0));
    expect(readParamEvents(store, ROOT)).toEqual([]);
    expect(getConfig(store.db, `transcript_cursor:${ROOT}`)).toBeTruthy();
  });

  it('credits behaviour appended after the previous hook to the PREVIOUS prompt', () => {
    writeFileSync(transcript, userPrompt('add tests please') + '\n', 'utf8');
    recordTranscriptCorroboration(store, ROOT, transcript, promptAt(0)); // hook for prompt 0

    // The agent responds to prompt 0: writes a test file and runs the suite.
    appendFileSync(transcript, assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]) + '\n');
    appendFileSync(transcript, assistantToolUse([{ name: 'Bash', input: { command: 'npm test' } }]) + '\n');
    appendFileSync(transcript, userPrompt('now the docs') + '\n');
    recordTranscriptCorroboration(store, ROOT, transcript, promptAt(1)); // hook for prompt 1

    const events = readParamEvents(store, ROOT);
    expect(events.map((e) => ({ key: e.signalKey, idx: e.promptIndex, ch: e.channel }))).toEqual([
      { key: 'test_creation', idx: 0, ch: 'transcript' },
      { key: 'regression_check', idx: 0, ch: 'transcript' },
    ]);
    expect(events.every((e) => e.projectRoot === ROOT && e.source === 'live')).toBe(true);
  });

  it('never re-credits already-seen transcript lines', () => {
    writeFileSync(transcript, userPrompt('p0') + '\n', 'utf8');
    recordTranscriptCorroboration(store, ROOT, transcript, promptAt(0));
    appendFileSync(transcript, assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]) + '\n');
    recordTranscriptCorroboration(store, ROOT, transcript, promptAt(1));
    recordTranscriptCorroboration(store, ROOT, transcript, promptAt(2)); // nothing new appended
    expect(readParamEvents(store, ROOT)).toHaveLength(1);
  });

  it('drains the old file and reads the new one when the transcript path changes', () => {
    writeFileSync(transcript, userPrompt('p0') + '\n', 'utf8');
    recordTranscriptCorroboration(store, ROOT, transcript, promptAt(0));
    // Tail of the old session file: the agent ran the suite.
    appendFileSync(transcript, assistantToolUse([{ name: 'Bash', input: { command: 'npx vitest run' } }]) + '\n');
    // The agent starts a new session file containing more behaviour.
    const transcriptB = join(dir, 'session-b.jsonl');
    writeFileSync(transcriptB, assistantToolUse([{ name: 'Write', input: { file_path: 'b.spec.ts' } }]) + '\n', 'utf8');

    recordTranscriptCorroboration(store, ROOT, transcriptB, promptAt(1));
    const keys = readParamEvents(store, ROOT).map((e) => `${e.signalKey}@${e.promptIndex}`);
    expect(keys.sort()).toEqual(['regression_check@0', 'test_creation@0']);
  });

  it('a missing transcript file never throws and preserves forward progress', () => {
    expect(() =>
      recordTranscriptCorroboration(store, ROOT, join(dir, 'gone.jsonl'), promptAt(0)),
    ).not.toThrow();
    expect(readParamEvents(store, ROOT)).toEqual([]);
  });

  it('a corrupt cursor value is treated as a fresh initialisation', () => {
    writeFileSync(transcript, assistantToolUse([{ name: 'Write', input: { file_path: 'a.test.ts' } }]) + '\n', 'utf8');
    setConfig(store, `transcript_cursor:${ROOT}`, '{broken json');
    recordTranscriptCorroboration(store, ROOT, transcript, promptAt(3));
    expect(readParamEvents(store, ROOT)).toEqual([]); // init pass — no crediting
    const cursor = JSON.parse(getConfig(store.db, `transcript_cursor:${ROOT}`) ?? '{}') as { offset?: number };
    expect(cursor.offset).toBeGreaterThan(0);
  });
});
