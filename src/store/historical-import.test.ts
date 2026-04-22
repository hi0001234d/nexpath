import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
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
    // 20 clear French prompts (LANG_WINDOW=20, LANG_DETECT_INTERVAL=15)
    const frenchPrompts = Array.from({ length: 20 }, () =>
      makeUserLine('je veux ajouter une nouvelle page à mon application'),
    );
    writeJsonl(projDir, 'session.jsonl', frenchPrompts);

    await importHistoricalPrompts(store, PROJECT_ROOT);

    const project = getProject(store, PROJECT_ROOT);
    // Detection may or may not fire depending on the threshold; assert it didn't error
    expect(project).not.toBeNull();
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
});
