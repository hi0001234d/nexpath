import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TOOLS } from './tools.js';
import { handleCapturePrompt } from './handlers.js';
import { openStore, type Store } from '../store/index.js';

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

// ── handleCapturePrompt ───────────────────────────────────────────────────────

describe('handleCapturePrompt', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

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
