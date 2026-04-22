import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from './db.js';
import type { Store } from './db.js';
import { getRecentPrompts, insertPrompt } from './prompts.js';
import { upsertProject, getProject } from './projects.js';
import { importHistoricalPrompts } from './historical-import.js';
import { SessionStateManager } from '../classifier/SessionStateManager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ROOT = '/test/hist-project';

function makeUserLine(content: string): string {
  return JSON.stringify({ type: 'user', message: { content } });
}

function makeAssistantLine(content: string): string {
  return JSON.stringify({ type: 'assistant', message: { content } });
}

function writeJsonl(dir: string, filename: string, lines: string[]): void {
  writeFileSync(join(dir, filename), lines.join('\n') + '\n', 'utf8');
}

function setupProjDir(claudeDir: string): string {
  const safeName = PROJECT_ROOT.replace(/[^a-zA-Z0-9]/g, '-');
  const projDir  = join(claudeDir, 'projects', safeName);
  mkdirSync(projDir, { recursive: true });
  return projDir;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('importHistoricalPrompts', () => {
  let store: Store;
  let tmpDir: string;
  let origEnv: string | undefined;

  beforeEach(async () => {
    store  = await openStore(':memory:');
    tmpDir = mkdtempSync(join(tmpdir(), 'nexpath-hist-'));
    origEnv = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir;
    upsertProject(store, { projectRoot: PROJECT_ROOT, name: 'hist-project' });
  });

  afterEach(() => {
    store.db.close();
    rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv === undefined) {
      delete process.env['CLAUDE_CONFIG_DIR'];
    } else {
      process.env['CLAUDE_CONFIG_DIR'] = origEnv;
    }
  });

  // 1. Guard — skips when prompts already exist
  it('skips when prompts already exist for the project', async () => {
    insertPrompt(store, { projectRoot: PROJECT_ROOT, promptText: 'existing prompt', agent: 'claude-code' });
    const projDir = setupProjDir(tmpDir);
    writeJsonl(projDir, 'session.jsonl', [makeUserLine('new prompt')]);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('existing prompt');
  });

  // 2. Guard — skips when projDir does not exist
  it('skips silently when project directory does not exist in Claude config', async () => {
    await importHistoricalPrompts(store, PROJECT_ROOT);
    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows).toHaveLength(0);
  });

  // 3. File discovery — only .jsonl files are read
  it('reads only .jsonl files (ignores .txt and other extensions)', async () => {
    const projDir = setupProjDir(tmpDir);
    writeJsonl(projDir, 'session.jsonl', [makeUserLine('jsonl prompt')]);
    writeFileSync(join(projDir, 'notes.txt'), makeUserLine('txt prompt') + '\n', 'utf8');

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('jsonl prompt');
  });

  // 4. Parsing — accepts type=user string content; rejects assistant messages
  it('imports user messages and rejects assistant messages', async () => {
    const projDir = setupProjDir(tmpDir);
    writeJsonl(projDir, 'session.jsonl', [
      makeUserLine('user prompt'),
      makeAssistantLine('assistant reply'),
    ]);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('user prompt');
  });

  // 5. Parsing — rejects list-type content (array message.content)
  it('rejects messages where content is an array', async () => {
    const projDir = setupProjDir(tmpDir);
    const arrayContent = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'text', text: 'tool result' }] },
    });
    writeJsonl(projDir, 'session.jsonl', [arrayContent]);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows).toHaveLength(0);
  });

  // 6. Parsing — skips empty/whitespace content
  it('skips messages with empty or whitespace-only content', async () => {
    const projDir = setupProjDir(tmpDir);
    const emptyContent = JSON.stringify({ type: 'user', message: { content: '   ' } });
    writeJsonl(projDir, 'session.jsonl', [emptyContent, makeUserLine('valid prompt')]);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('valid prompt');
  });

  // 7. Parsing — skips invalid JSON lines
  it('skips invalid JSON lines and imports valid ones', async () => {
    const projDir = setupProjDir(tmpDir);
    writeJsonl(projDir, 'session.jsonl', [
      'not valid json{{{',
      makeUserLine('valid prompt'),
      '{"incomplete":',
    ]);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('valid prompt');
  });

  // 8. Cap — stops at 500 prompts across files
  it('caps import at 500 prompts even when more are available', async () => {
    const projDir = setupProjDir(tmpDir);
    const lines300 = Array.from({ length: 300 }, (_, i) => makeUserLine(`prompt ${i}`));
    writeJsonl(projDir, 'session-a.jsonl', lines300);
    // Give session-b a later mtime so it sorts first (newest-first) — but cap hits in session-a
    writeJsonl(projDir, 'session-b.jsonl', lines300);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 600);
    expect(rows).toHaveLength(500);
  });

  // 9. Import — prompts appear in getRecentPrompts after import
  it('imported prompts are retrievable via getRecentPrompts', async () => {
    const projDir = setupProjDir(tmpDir);
    writeJsonl(projDir, 'session.jsonl', [
      makeUserLine('first'),
      makeUserLine('second'),
    ]);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows.length).toBeGreaterThan(0);
  });

  // 10. Bootstrap — detected_language is written to projects table
  it('writes detected_language to projects table when enough non-English prompts are present', async () => {
    const projDir = setupProjDir(tmpDir);
    // 20 identical French sentences — well above LANG_WINDOW=20, no ENG_KEYWORDS to inflate score
    const frenchPrompts = Array.from({ length: 20 }, () =>
      makeUserLine('je veux ajouter une nouvelle page à mon application'),
    );
    writeJsonl(projDir, 'session.jsonl', frenchPrompts);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const project = getProject(store, PROJECT_ROOT);
    expect(project).not.toBeNull();
    // tinyld should detect French from 20 identical French sentences with high confidence
    expect(project?.detectedLanguage).not.toBeNull();
  });

  // 11. Bootstrap — session state is pre-seeded (profile and mood non-null)
  it('pre-seeds session state — profile and mood are non-null after import', async () => {
    const projDir = setupProjDir(tmpDir);
    const lines = Array.from({ length: 10 }, (_, i) =>
      makeUserLine(`implement the feature module number ${i} with proper tests`),
    );
    writeJsonl(projDir, 'session.jsonl', lines);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const mgr = SessionStateManager.load(store, PROJECT_ROOT);
    expect(mgr.current.profile).not.toBeNull();
    expect(mgr.current.mood).not.toBeUndefined();
  });

  // 12. Bootstrap — promptCount reflects total imported
  it('bootstrapped promptCount matches the number of imported prompts', async () => {
    const projDir = setupProjDir(tmpDir);
    const lines = Array.from({ length: 8 }, (_, i) => makeUserLine(`prompt ${i}`));
    writeJsonl(projDir, 'session.jsonl', lines);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const mgr = SessionStateManager.load(store, PROJECT_ROOT);
    expect(mgr.current.promptCount).toBe(8);
  });

  // 13. Bootstrap — no-op when zero prompts collected (empty .jsonl file)
  it('does not create session state when all lines are rejected (empty file)', async () => {
    const projDir = setupProjDir(tmpDir);
    writeJsonl(projDir, 'session.jsonl', ['', '  ', 'bad json{{']);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const mgr = SessionStateManager.load(store, PROJECT_ROOT);
    // No bootstrap happened — fresh session with promptCount = 0
    expect(mgr.current.promptCount).toBe(0);
  });

  // 14. File discovery — projDir exists but has no .jsonl files
  it('returns silently when projDir exists but contains no .jsonl files', async () => {
    const projDir = setupProjDir(tmpDir);
    // Write a non-.jsonl file only — should be ignored
    writeFileSync(join(projDir, 'notes.txt'), makeUserLine('ignored') + '\n', 'utf8');

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const rows = getRecentPrompts(store, PROJECT_ROOT, 10);
    expect(rows).toHaveLength(0);
    const mgr = SessionStateManager.load(store, PROJECT_ROOT);
    expect(mgr.current.promptCount).toBe(0);
  });

  // 15. Bootstrap no-op — bootstrapFromHistory does not overwrite existing session state
  it('bootstrapFromHistory is a no-op when session state already exists', async () => {
    const projDir = setupProjDir(tmpDir);
    const lines = Array.from({ length: 5 }, (_, i) => makeUserLine(`prompt ${i}`));
    writeJsonl(projDir, 'session.jsonl', lines);

    // First import: creates session state with promptCount = 5
    await importHistoricalPrompts(store, PROJECT_ROOT);
    const mgr1 = SessionStateManager.load(store, PROJECT_ROOT);
    expect(mgr1.current.promptCount).toBe(5);

    // Manually call bootstrapFromHistory again — session state now exists, so it is a no-op
    const { SessionStateManager: SSM } = await import('../classifier/SessionStateManager.js');
    SSM.bootstrapFromHistory(store, PROJECT_ROOT, [], 999);

    const mgr2 = SessionStateManager.load(store, PROJECT_ROOT);
    // promptCount must still be 5, not 999
    expect(mgr2.current.promptCount).toBe(5);
  });

  // 16. Bootstrap — detectedLanguage in session state reads from projects table
  it('bootstrapped session state has detectedLanguage from projects table', async () => {
    const { setDetectedLanguage } = await import('./projects.js');
    const projDir = setupProjDir(tmpDir);
    const lines = Array.from({ length: 5 }, (_, i) => makeUserLine(`prompt ${i}`));
    writeJsonl(projDir, 'session.jsonl', lines);

    // Pre-set detected_language on the project row before import
    setDetectedLanguage(store, PROJECT_ROOT, 'de');
    await importHistoricalPrompts(store, PROJECT_ROOT);

    const mgr = SessionStateManager.load(store, PROJECT_ROOT);
    // bootstrapFromHistory reads from projects table — should have 'de'
    // (import's own detectLanguage may overwrite, but 5 English prompts won't trigger detection)
    expect(mgr.current.detectedLanguage).toBe('de');
  });

  // 17. File ordering — newest-file prompts precede older-file prompts in collected array
  it('newest file prompts come first in collected order (most recent session is slice(0,...))', async () => {
    const projDir = setupProjDir(tmpDir);

    // Write old file first, give it an explicit old mtime (1 hour ago)
    writeJsonl(projDir, 'old-session.jsonl', [makeUserLine('old prompt a'), makeUserLine('old prompt b')]);
    const oneHourAgo = (Date.now() - 3_600_000) / 1000;
    utimesSync(join(projDir, 'old-session.jsonl'), oneHourAgo, oneHourAgo);

    // Write new file — default mtime is now (newer than old)
    writeJsonl(projDir, 'new-session.jsonl', [makeUserLine('new prompt a'), makeUserLine('new prompt b')]);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const mgr = SessionStateManager.load(store, PROJECT_ROOT);
    // promptHistory is built from collected.slice(0, MAX_HISTORY)
    // collected[0] = new prompt a (from newest file), collected[2] = old prompt a
    expect(mgr.current.promptHistory[0].text).toBe('new prompt a');
    expect(mgr.current.promptHistory[1].text).toBe('new prompt b');
    expect(mgr.current.promptHistory[2].text).toBe('old prompt a');
    expect(mgr.current.promptHistory[3].text).toBe('old prompt b');
  });
});
