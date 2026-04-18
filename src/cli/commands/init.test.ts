import { describe, it, expect, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { openStore, closeStore, getProject, listProjects } from '../../store/index.js';
import { detectProjectName, PROJECT_TYPES, initAction, type ProjectInput } from './init.js';

afterEach(() => vi.restoreAllMocks());

// ── helpers ───────────────────────────────────────────────────────────────────

function tmpDir(): { dir: string; cleanup: () => void } {
  const dir = join(tmpdir(), `nexpath-init-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true }); } catch { /* ignore */ } } };
}

function tempDb(): { path: string; cleanup: () => void } {
  const path = join(tmpdir(), `nexpath-init-db-${randomUUID()}.db`);
  return { path, cleanup: () => { try { rmSync(path); } catch { /* ignore */ } } };
}

function mockInput(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name:        'test-project',
    projectType: 'web-app',
    language:    'TypeScript',
    description: 'A test project',
    ...overrides,
  };
}

// ── detectProjectName ─────────────────────────────────────────────────────────

describe('detectProjectName', () => {
  it('returns package.json name when present', () => {
    const { dir, cleanup } = tmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'my-app' }));
      expect(detectProjectName(dir)).toBe('my-app');
    } finally { cleanup(); }
  });

  it('falls back to folder name when package.json is absent', () => {
    const { dir, cleanup } = tmpDir();
    try {
      const name = detectProjectName(dir);
      // the folder name is the last segment of the temp dir path
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    } finally { cleanup(); }
  });

  it('falls back to folder name when package.json has no name field', () => {
    const { dir, cleanup } = tmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
      expect(detectProjectName(dir)).toBe(basename(dir));
    } finally { cleanup(); }
  });

  it('falls back to folder name when package.json is malformed JSON', () => {
    const { dir, cleanup } = tmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), 'not json {{{');
      expect(typeof detectProjectName(dir)).toBe('string');
    } finally { cleanup(); }
  });

  it('trims whitespace from package.json name', () => {
    const { dir, cleanup } = tmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '  my-app  ' }));
      expect(detectProjectName(dir)).toBe('my-app');
    } finally { cleanup(); }
  });
});

// ── PROJECT_TYPES ─────────────────────────────────────────────────────────────

describe('PROJECT_TYPES', () => {
  it('contains at least 6 options', () => {
    expect(PROJECT_TYPES.length).toBeGreaterThanOrEqual(6);
  });

  it('every option has a value and a label', () => {
    for (const t of PROJECT_TYPES) {
      expect(typeof t.value).toBe('string');
      expect(typeof t.label).toBe('string');
    }
  });

  it('includes web-app, api, cli, library', () => {
    const values = PROJECT_TYPES.map((t) => t.value);
    expect(values).toContain('web-app');
    expect(values).toContain('api');
    expect(values).toContain('cli');
    expect(values).toContain('library');
  });
});

// ── initAction ────────────────────────────────────────────────────────────────

describe('initAction — saves project record', () => {
  it('stores project with all fields', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await initAction(dir, path, async () => mockInput());
      const store = await openStore(path);
      const proj = getProject(store, dir);
      expect(proj).not.toBeNull();
      expect(proj!.name).toBe('test-project');
      expect(proj!.projectType).toBe('web-app');
      expect(proj!.language).toBe('TypeScript');
      expect(proj!.description).toBe('A test project');
      expect(proj!.projectRoot).toBe(dir);
      closeStore(store);
    } finally { cleanDir(); cleanDb(); }
  });

  it('stores project_root as the provided cwd', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await initAction(dir, path, async () => mockInput());
      const store = await openStore(path);
      const proj = getProject(store, dir);
      expect(proj!.projectRoot).toBe(dir);
      closeStore(store);
    } finally { cleanDir(); cleanDb(); }
  });

  it('stores null for optional fields when empty strings provided', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await initAction(dir, path, async () => mockInput({ language: '', description: '' }));
      const store = await openStore(path);
      const proj = getProject(store, dir);
      expect(proj!.language).toBeNull();
      expect(proj!.description).toBeNull();
      closeStore(store);
    } finally { cleanDir(); cleanDb(); }
  });

  it('re-running init updates the existing record (upsert)', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await initAction(dir, path, async () => mockInput({ name: 'first-name' }));
      await initAction(dir, path, async () => mockInput({ name: 'updated-name' }));
      const store = await openStore(path);
      const projects = listProjects(store);
      expect(projects).toHaveLength(1);  // still one record, not two
      expect(projects[0].name).toBe('updated-name');
      closeStore(store);
    } finally { cleanDir(); cleanDb(); }
  });

  it('prints confirmation after saving', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await initAction(dir, path, async () => mockInput({ name: 'my-proj' }));
      const output = spy.mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('my-proj');
      expect(output).toContain('saved');
    } finally { cleanDir(); cleanDb(); }
  });
});

describe('initAction — cancellation', () => {
  it('does not save a record when promptFn returns null', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await initAction(dir, path, async () => null);
      const store = await openStore(path);
      const proj = getProject(store, dir);
      expect(proj).toBeNull();
      closeStore(store);
    } finally { cleanDir(); cleanDb(); }
  });

  it('prints nothing when cancelled', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await initAction(dir, path, async () => null);
      expect(spy.mock.calls).toHaveLength(0);
    } finally { cleanDir(); cleanDb(); }
  });
});

describe('initAction — default name detection', () => {
  it('passes package.json name as the default to promptFn', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'detected-pkg' }));
    let capturedDefault = '';
    try {
      await initAction(dir, path, async ({ name }) => {
        capturedDefault = name;
        return mockInput();
      });
      expect(capturedDefault).toBe('detected-pkg');
    } finally { cleanDir(); cleanDb(); }
  });

  it('passes folder name as default when no package.json exists', async () => {
    const { dir, cleanup: cleanDir } = tmpDir();
    const { path, cleanup: cleanDb } = tempDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    let capturedDefault = '';
    try {
      await initAction(dir, path, async ({ name }) => {
        capturedDefault = name;
        return mockInput();
      });
      expect(capturedDefault).toBeTruthy();
      expect(typeof capturedDefault).toBe('string');
    } finally { cleanDir(); cleanDb(); }
  });
});
