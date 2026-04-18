import { describe, it, expect } from 'vitest';
import { TOOLS } from './tools.js';

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
