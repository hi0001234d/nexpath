/**
 * MCP tool definitions for nexpath-prompt-store.
 * capture_prompt removed — prompt capture is now wired directly in runAuto() via the hook.
 */

export const TOOLS: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];
