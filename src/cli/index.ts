#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { configGetAction, configSetAction } from './commands/config.js';
import { storeDeleteAction, storeEnableAction, storeDisableAction, storePruneAction } from './commands/store.js';
import { installAction, uninstallAction } from './commands/install.js';
import { initAction } from './commands/init.js';
import { registerAutoCommand } from './commands/auto.js';
import { registerOptimizeCommand } from './commands/optimize.js';
import { registerStatusCommand } from './commands/status.js';

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
    .option('--project <path>', 'Project root directory (defaults to cwd)')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { project?: string; db?: string }) => {
      await initAction(opts.project, opts.db);
    });

  // ── Guidance commands ─────────────────────────────────────────────────────────

  registerAutoCommand(program);

  registerOptimizeCommand(program);

  // ── Status command ────────────────────────────────────────────────────────────

  registerStatusCommand(program);

  // ── Config command ────────────────────────────────────────────────────────────

  const configCmd = program
    .command('config')
    .description('Manage nexpath configuration');

  configCmd
    .command('set <key> [value]')
    .description('Set a config value (e.g. prompt_capture_enabled false); omit value to clear')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (key: string, value: string = '', opts: { db?: string }) => {
      await configSetAction(key, value, opts.db);
    });

  configCmd
    .command('get <key>')
    .description('Get a config value')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (key: string, opts: { db?: string }) => {
      await configGetAction(key, opts.db);
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
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { project?: string; yes?: boolean; db?: string }) => {
      await storeDeleteAction(opts, opts.db);
    });

  storeCmd
    .command('enable')
    .description('Enable prompt capture (sets prompt_capture_enabled = true)')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { db?: string }) => {
      await storeEnableAction(opts.db);
    });

  storeCmd
    .command('disable')
    .description('Disable prompt capture (sets prompt_capture_enabled = false, keeps existing data)')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { db?: string }) => {
      await storeDisableAction(opts.db);
    });

  storeCmd
    .command('prune')
    .description('Remove prompts older than the specified period')
    .option('--older-than <period>', 'Period threshold (e.g. 30d, 6m, 1y)')
    .option('--project <path>', 'Prune only this project')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { olderThan?: string; project?: string; db?: string }) => {
      await storePruneAction(opts, opts.db);
    });

  return program;
}

// Module-level singleton used when running as a binary
export const program = createProgram();

// Only parse argv when run directly (not when imported by tests).
// realpathSync resolves the npm-link symlink so the comparison holds on Windows.
const thisFile = fileURLToPath(import.meta.url);
const mainFile = process.argv[1] ? (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })() : '';
if (thisFile === mainFile) {
  await program.parseAsync();
}
