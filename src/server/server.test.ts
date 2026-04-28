import { describe, it, expect } from 'vitest';
import { TOOLS } from './tools.js';

describe('MCP tool definitions', () => {
  it('exports an empty tools array', () => {
    expect(TOOLS).toHaveLength(0);
  });
});
