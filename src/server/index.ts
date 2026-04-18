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
import { handleCapturePrompt, type CapturePromptParams } from './handlers.js';

// ── Open prompt store ─────────────────────────────────────────────────────────
// Opened once on startup; stays open for the full agent session.
// Crash safety: insertPrompt serializes to disk on every call — at most one
// in-flight prompt is lost on an unclean exit.

const store = await openStore();
process.stderr.write(`[nexpath-serve] store opened\n`);

// ── Shutdown handlers ─────────────────────────────────────────────────────────
// Close the SQLite connection cleanly so the last write is flushed.

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

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'capture_prompt') {
    const args = request.params.arguments as CapturePromptParams | undefined;

    if (!args?.prompt) {
      return {
        content: [{ type: 'text', text: 'Error: prompt argument is required' }],
        isError: true,
      };
    }

    try {
      const result = handleCapturePrompt(store, args);
      const text = result.status === 'disabled' ? 'capture disabled' : 'captured';
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      process.stderr.write(`[nexpath-serve] capture_prompt error: ${err}\n`);
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
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
