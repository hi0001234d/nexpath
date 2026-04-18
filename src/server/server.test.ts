import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TOOLS } from './tools.js';
import { handleCapturePrompt, FIRST_RUN_BANNER } from './handlers.js';
import { openStore, setConfig, type Store } from '../store/index.js';

// ── MCP tool definitions ──────────────────────────────────────────────────────

describe('MCP tool definitions', () => {
  it('exports exactly one tool', () => {
    expect(TOOLS).toHaveLength(1);
  });

  describe('capture_prompt', () => {
    const tool = TOOLS[0];

    it('has correct name', () => {
      expect(tool.name).toBe('capture_prompt');
    });

    it('has a non-empty description', () => {
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it('inputSchema type is object', () => {
      expect(tool.inputSchema.type).toBe('object');
    });

    it('prompt is the only required field', () => {
      expect(tool.inputSchema.required).toEqual(['prompt']);
    });

    it('prompt property is a string', () => {
      expect(tool.inputSchema.properties.prompt.type).toBe('string');
    });

    it('project_id property is a string', () => {
      expect(tool.inputSchema.properties.project_id.type).toBe('string');
    });

    it('agent property is a string', () => {
      expect(tool.inputSchema.properties.agent.type).toBe('string');
    });

    it('project_id and agent are optional (not in required)', () => {
      expect(tool.inputSchema.required).not.toContain('project_id');
      expect(tool.inputSchema.required).not.toContain('agent');
    });
  });
});

// ── handleCapturePrompt — enabled ─────────────────────────────────────────────

describe('handleCapturePrompt (capture enabled)', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    setConfig(store, 'prompt_capture_enabled', 'true');
  });
  afterEach(() => { store.db.close(); });

  it('returns status captured', () => {
    const result = handleCapturePrompt(store, { prompt: 'hello world', project_id: '/proj/a', agent: 'claude-code' });
    expect(result.status).toBe('captured');
  });

  it('inserts the prompt text into the store', () => {
    handleCapturePrompt(store, { prompt: 'hello world', project_id: '/proj/a', agent: 'claude-code' });
    const res = store.db.exec('SELECT prompt_text FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe('hello world');
  });

  it('stores project_id as project_root', () => {
    handleCapturePrompt(store, { prompt: 'test', project_id: '/my/project' });
    const res = store.db.exec('SELECT project_root FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe('/my/project');
  });

  it('falls back to "unknown" project_root when project_id is omitted', () => {
    handleCapturePrompt(store, { prompt: 'test' });
    const res = store.db.exec('SELECT project_root FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe('unknown');
  });

  it('stores the agent field when provided', () => {
    handleCapturePrompt(store, { prompt: 'test', project_id: '/p', agent: 'cursor' });
    const res = store.db.exec('SELECT agent FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe('cursor');
  });

  it('stores null for agent when not provided', () => {
    handleCapturePrompt(store, { prompt: 'test', project_id: '/p' });
    const res = store.db.exec('SELECT agent FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBeNull();
  });

  it('applies secret redaction before storing', () => {
    handleCapturePrompt(store, { prompt: 'key=sk-abc123def456ghi789jkl012mno', project_id: '/p' });
    const res = store.db.exec('SELECT prompt_text FROM prompts');
    const stored = res[0]?.values[0]?.[0] as string;
    expect(stored).toContain('sk-[REDACTED]');
    expect(stored).not.toContain('sk-abc123');
  });

  it('each call inserts a new row (multiple prompts accumulate)', () => {
    handleCapturePrompt(store, { prompt: 'first', project_id: '/p' });
    handleCapturePrompt(store, { prompt: 'second', project_id: '/p' });
    handleCapturePrompt(store, { prompt: 'third', project_id: '/p' });
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(3);
  });
});

// ── handleCapturePrompt — disabled ────────────────────────────────────────────

describe('handleCapturePrompt (capture disabled)', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    setConfig(store, 'prompt_capture_enabled', 'false');
  });
  afterEach(() => { store.db.close(); });

  it('returns status disabled', () => {
    const result = handleCapturePrompt(store, { prompt: 'test' });
    expect(result.status).toBe('disabled');
  });

  it('does not insert any row when disabled', () => {
    handleCapturePrompt(store, { prompt: 'test' });
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(0);
  });

  it('multiple calls while disabled all return disabled', () => {
    const r1 = handleCapturePrompt(store, { prompt: 'a' });
    const r2 = handleCapturePrompt(store, { prompt: 'b' });
    const r3 = handleCapturePrompt(store, { prompt: 'c' });
    expect(r1.status).toBe('disabled');
    expect(r2.status).toBe('disabled');
    expect(r3.status).toBe('disabled');
  });

  it('accumulates zero rows across multiple disabled calls', () => {
    handleCapturePrompt(store, { prompt: 'a' });
    handleCapturePrompt(store, { prompt: 'b' });
    handleCapturePrompt(store, { prompt: 'c' });
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(0);
  });
});

// ── handleCapturePrompt — first run ───────────────────────────────────────────

describe('handleCapturePrompt (first run — flag never set)', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    // intentionally NOT setting prompt_capture_enabled
  });
  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('returns status first_run_enabled', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = handleCapturePrompt(store, { prompt: 'first ever' });
    expect(result.status).toBe('first_run_enabled');
  });

  it('captures the prompt on first run', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'first ever', project_id: '/p' });
    const res = store.db.exec('SELECT COUNT(*) FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe(1);
  });

  it('persists prompt_capture_enabled = true after first run', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'first ever' });
    const res = store.db.exec("SELECT value FROM config WHERE key = 'prompt_capture_enabled'");
    expect(res[0]?.values[0]?.[0]).toBe('true');
  });

  it('writes the disclosure banner to stderr on first run', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'first ever' });
    const written = stderrSpy.mock.calls.map((c) => c[0] as string).join('');
    expect(written).toContain(FIRST_RUN_BANNER);
  });

  it('subsequent call after first run is treated as enabled (no banner)', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'first' });
    vi.restoreAllMocks();

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = handleCapturePrompt(store, { prompt: 'second' });
    expect(result.status).toBe('captured');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('stores the correct prompt text on first run', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'my first prompt', project_id: '/p' });
    const res = store.db.exec('SELECT prompt_text FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe('my first prompt');
  });

  it('stores project_id on first run', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'x', project_id: '/my/project' });
    const res = store.db.exec('SELECT project_root FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe('/my/project');
  });

  it('stores agent on first run', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'x', project_id: '/p', agent: 'windsurf' });
    const res = store.db.exec('SELECT agent FROM prompts');
    expect(res[0]?.values[0]?.[0]).toBe('windsurf');
  });

  it('applies secret redaction on first run', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'token=ghp_abcdefghijklmnopqrstuvwxyz123456789012', project_id: '/p' });
    const res = store.db.exec('SELECT prompt_text FROM prompts');
    const stored = res[0]?.values[0]?.[0] as string;
    expect(stored).toContain('ghp_[REDACTED]');
    expect(stored).not.toContain('ghp_abcdefghij');
  });

  it('calling disable after first run makes the next call return disabled', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'first' }); // first run → flag = true
    setConfig(store, 'prompt_capture_enabled', 'false'); // user disables
    const result = handleCapturePrompt(store, { prompt: 'second' });
    expect(result.status).toBe('disabled');
  });

  it('banner contains disclosure about data staying on the machine', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'first ever' });
    const written = stderrSpy.mock.calls.map((c) => c[0] as string).join('');
    expect(written).toContain('nothing is sent externally');
  });

  it('banner contains the disable instruction', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'first ever' });
    const written = stderrSpy.mock.calls.map((c) => c[0] as string).join('');
    expect(written).toContain('nexpath store disable');
  });

  it('banner contains the delete instruction', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    handleCapturePrompt(store, { prompt: 'first ever' });
    const written = stderrSpy.mock.calls.map((c) => c[0] as string).join('');
    expect(written).toContain('nexpath store delete');
  });
});
