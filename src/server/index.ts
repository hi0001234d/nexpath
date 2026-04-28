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
import { openStore, closeStore } from '../store/index.js';
import { TOOLS } from './tools.js';

// ── Open prompt store ─────────────────────────────────────────────────────────

const store = await openStore();
process.stderr.write(`[nexpath-serve] store opened\n`);

// ── Shutdown handlers ─────────────────────────────────────────────────────────

process.stdin.on('end', () => {
  process.stderr.write('[nexpath-serve] stdin closed — shutting down\n');
  closeStore(store);
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stderr.write('[nexpath-serve] SIGTERM received — shutting down\n');
  closeStore(store);
  process.exit(0);
});

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'nexpath-prompt-store', version: '0.1.1' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return {
    content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
    isError: true,
  };
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('[nexpath-serve] ready\n');
