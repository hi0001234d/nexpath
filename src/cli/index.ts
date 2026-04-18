#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('nexpath')
    .description('Behaviour guidance system for vibe coders using AI coding agents')
    .version('0.1.1');

  // ── Lifecycle commands ────────────────────────────────────────────────────────

  program
    .command('install')
    .description('Register nexpath-serve MCP server with all detected AI coding agents')
    .action(() => {
      console.log('[nexpath install] — not yet implemented');
    });

  program
    .command('uninstall')
    .description('Remove nexpath-serve MCP registration from all agents')
    .action(() => {
      console.log('[nexpath uninstall] — not yet implemented');
    });

  program
    .command('init')
    .description('Set up nexpath for the current project (onboarding questionnaire)')
    .action(() => {
      console.log('[nexpath init] — not yet implemented');
    });

  // ── Guidance commands ─────────────────────────────────────────────────────────

  program
    .command('auto')
    .description('Run the behaviour guidance system — fires the decision session at the right moments')
    .action(() => {
      console.log('[nexpath auto] — not yet implemented');
    });

  program
    .command('optimize')
    .description('Work through previously skipped decision session suggestions')
    .action(() => {
      console.log('[nexpath optimize] — not yet implemented');
    });

  // ── Status command ────────────────────────────────────────────────────────────

  program
    .command('status')
    .description('Show MCP connection status, prompt store stats, and config summary')
    .action(() => {
      console.log('[nexpath status] — not yet implemented');
    });

  // ── Config command ────────────────────────────────────────────────────────────

  const configCmd = program
    .command('config')
    .description('Manage nexpath configuration');

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (e.g. language_override en)')
    .action((key: string, value: string) => {
      console.log(`[nexpath config set ${key} ${value}] — not yet implemented`);
    });

  configCmd
    .command('get <key>')
    .description('Get a config value')
    .action((key: string) => {
      console.log(`[nexpath config get ${key}] — not yet implemented`);
    });

  // ── Store command ─────────────────────────────────────────────────────────────

  const storeCmd = program
    .command('store')
    .description('Manage the local prompt store');

  storeCmd
    .command('delete')
    .description('Delete all stored prompts')
    .action(() => {
      console.log('[nexpath store delete] — not yet implemented');
    });

  storeCmd
    .command('disable')
    .description('Disable prompt capture (sets prompt_capture_enabled = false)')
    .action(() => {
      console.log('[nexpath store disable] — not yet implemented');
    });

  storeCmd
    .command('prune')
    .option('--older-than <period>', 'Remove prompts older than this period (e.g. 30d, 6m)')
    .description('Remove prompts older than the specified period')
    .action((opts: { olderThan?: string }) => {
      console.log(`[nexpath store prune --older-than ${opts.olderThan ?? '?'}] — not yet implemented`);
    });

  return program;
}

// Module-level singleton used when running as a binary
export const program = createProgram();

// Only parse argv when run directly (not when imported by tests)
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  program.parse();
}
