/**
 * MCP tool definitions for nexpath-prompt-store.
 * Extracted so tests can import the schema without starting the server transport.
 */

export const TOOLS = [
  {
    name: 'capture_prompt',
    description:
      'Capture a user prompt for behaviour analysis. Called automatically by the agent hook on every user message.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'The user prompt text to capture',
        },
        project_id: {
          type: 'string',
          description: 'Identifier for the current project (e.g. workspace folder name or path hash)',
        },
        agent: {
          type: 'string',
          description: 'The AI coding agent that fired this capture (e.g. claude-code, cursor, windsurf)',
        },
      },
      required: ['prompt'] as string[],
    },
  },
];
