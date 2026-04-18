#!/usr/bin/env node
/**
 * nexpath-serve — MCP stdio server
 *
 * Spawned as a child process by AI coding agents (Claude Code, Cursor, Windsurf, etc.).
 * The agent owns the lifecycle: it spawns this process on startup and kills it on exit.
 *
 * Shutdown signals (per MCP spec 2025-03-26):
 *   1. Agent closes stdin pipe → EOF on process.stdin
 *   2. Agent sends SIGTERM if process hasn't exited
 *   3. Agent sends SIGKILL if still running
 *
 * stderr is available for logging — agents ignore it.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.js';

// ── Shutdown handlers ─────────────────────────────────────────────────────────
// db.close() will be called here once the store module is implemented (item 2)

process.stdin.on('end', () => {
  process.stderr.write('[nexpath-serve] stdin closed — shutting down\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stderr.write('[nexpath-serve] SIGTERM received — shutting down\n');
  process.exit(0);
});

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'nexpath-prompt-store', version: '0.1.1' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'capture_prompt') {
    // Store module not yet implemented (item 2) — stub response
    process.stderr.write(
      `[nexpath-serve] capture_prompt called — store not yet implemented\n`
    );
    return {
      content: [{ type: 'text', text: 'captured' }],
    };
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
    isError: true,
  };
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('[nexpath-serve] ready\n');
