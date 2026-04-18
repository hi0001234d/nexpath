#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { configGetAction, configSetAction } from './commands/config.js';
import { storeDeleteAction, storeEnableAction, storeDisableAction, storePruneAction } from './commands/store.js';
import { installAction, uninstallAction } from './commands/install.js';
import { initAction } from './commands/init.js';

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
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (opts: { yes?: boolean }) => {
      await installAction(opts);
    });

  program
    .command('uninstall')
    .description('Remove nexpath-serve MCP registration from all agents')
    .action(async () => {
      await uninstallAction();
    });

  program
    .command('init')
    .description('Set up nexpath for the current project (onboarding questionnaire)')
    .action(async () => {
      await initAction();
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
    .description('Set a config value (e.g. prompt_capture_enabled false)')
    .action(async (key: string, value: string) => {
      await configSetAction(key, value);
    });

  configCmd
    .command('get <key>')
    .description('Get a config value')
    .action(async (key: string) => {
      await configGetAction(key);
    });

  // ── Store command ─────────────────────────────────────────────────────────────

  const storeCmd = program
    .command('store')
    .description('Manage the local prompt store');

  storeCmd
    .command('delete')
    .description('Delete all stored prompts (or a single project with --project)')
    .option('--project <path>', 'Delete prompts for this project only')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (opts: { project?: string; yes?: boolean }) => {
      await storeDeleteAction(opts);
    });

  storeCmd
    .command('enable')
    .description('Enable prompt capture (sets prompt_capture_enabled = true)')
    .action(async () => {
      await storeEnableAction();
    });

  storeCmd
    .command('disable')
    .description('Disable prompt capture (sets prompt_capture_enabled = false, keeps existing data)')
    .action(async () => {
      await storeDisableAction();
    });

  storeCmd
    .command('prune')
    .description('Remove prompts older than the specified period')
    .option('--older-than <period>', 'Period threshold (e.g. 30d, 6m, 1y)')
    .option('--project <path>', 'Prune only this project')
    .action(async (opts: { olderThan?: string; project?: string }) => {
      await storePruneAction(opts);
    });

  return program;
}

// Module-level singleton used when running as a binary
export const program = createProgram();

// Only parse argv when run directly (not when imported by tests)
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await program.parseAsync();
}
