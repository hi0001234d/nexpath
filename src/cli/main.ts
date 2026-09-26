import { Command } from 'commander';
import { createRequire } from 'node:module';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../store/db.js';
import {
  configGetAction,
  configSetAction,
  configUnsetAction,
  configSetApiKeyAction,
  configRotateApiKeyAction,
  configShowKeySourceAction,
  configRemoveApiKeyAction,
} from './commands/config.js';
import {
  configSetTokenAction,
  configRotateTokenAction,
  configRemoveTokenAction,
} from './commands/token.js';
import { runMigrations } from '../store/schema.js';
import { logAction } from './commands/log.js';
import { storeDeleteAction, storeEnableAction, storeDisableAction, storePruneAction } from './commands/store.js';
import { installAction, uninstallAction, NonInteractiveTerminalError } from './commands/install.js';
import {
  DEFAULT_PLATFORM,
  PLATFORM_VALUES,
  validatePlatform,
  type SupportedPlatform,
} from './commands/supported-agents-by-platform.js';
import { initAction } from './commands/init.js';
import { envAction } from './commands/env.js';
import { registerAutoCommand } from './commands/auto.js';
import { registerStopCommand } from './commands/stop.js';
import { registerRecordSignalCommand } from './commands/record-signal.js';
import { registerSubmitExpiryConsumeCommand } from './commands/submit-expiry-consumer.js';
import { registerSubmitPopupSuperviseCommand } from './commands/submit-popup-supervisor.js';
import { registerCredentialStatusCommand } from './commands/credential-status.js';
import { registerWindsurfHookCommand } from './commands/windsurf-hook.js';
import { registerCursorHookCommand } from './commands/cursor-hook.js';
import { registerOptimizeCommand } from './commands/optimize.js';
import { registerStatusCommand } from './commands/status.js';
import { registerFeedbackTestCommand } from './commands/feedback-test.js';
import { registerPromptEnhancementPopupHostCommand } from './commands/prompt-enhancement-popup-host.js';
import {
  telemetrySyncStatusAction,
  telemetrySyncEnableAction,
  telemetrySyncDisableAction,
  telemetrySyncResetCursorAction,
  telemetrySyncRunAction,
  telemetrySyncPingAction,
} from './commands/telemetry-sync.js';
import { contentTemplateCreateAction, contentTemplateValidateAction } from './commands/content-template.js';

/**
 * Print a missing-terminal failure as the instruction it is, instead of the raw `uv_tty_init` stack.
 *
 * The `install` action has done this inline since 2026-09-04. The credential-writing commands under
 * `config` prompt through the same library and did NOT, so `nexpath config set-api-key < /dev/null`
 * printed a stack — and, worse, still exited 0, so a script could read it as success.
 *
 * ⚠️ Only `NonInteractiveTerminalError` is caught. Everything else propagates untouched, so this
 * never converts a real fault into a friendly message about terminals.
 */
async function runInteractiveCommand(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (err instanceof NonInteractiveTerminalError) {
      process.stderr.write(`
${err.message}
`);
      process.exit(1);
    }
    throw err;
  }
}

/**
 * `nexpath --version`, read from package.json rather than typed out here.
 *
 * ⚠️ WHY (2026-09-21). This line used to carry its own literal, and a release
 * bumped package.json to 0.1.56 without it — so `nexpath-cli@0.1.56` shipped a
 * CLI that reported 0.1.55, and nothing caught it: the test pinned the same
 * literal, so the two wrong numbers agreed with each other. One source of truth
 * makes that drift impossible.
 *
 * The relative path resolves in BOTH layouts, because `files: ["dist"]` ships
 * package.json at the tarball root: src/cli/main.ts → repo root, and
 * dist/cli/main.js → package root (the staged CLI inside the .vsix included).
 */
const { version: NEXPATH_VERSION } = createRequire(import.meta.url)('../../package.json') as { version: string };

export function createProgram(): Command {
  const program = new Command();

  program
    .name('nexpath')
    .description('Behaviour guidance system for vibe coders using AI coding agents')
    .version(NEXPATH_VERSION);

  // ── Lifecycle commands ────────────────────────────────────────────────────────

  program
    .command('install')
    .description('Interactive setup: credential (OpenAI API key or Nexpath token) → agent registration')
    .option('-y, --yes', 'Non-interactive mode: skip the credential prompt and auto-confirm agent registration')
    .option('--db <path>', 'Path to the SQLite database file')
    .option(
      '--for <platform>',
      `Which install surface to target: ${PLATFORM_VALUES.join(' | ')}.`,
      DEFAULT_PLATFORM,
    )
    .action(async (opts: { yes?: boolean; db?: string; for?: string }) => {
      let platform: SupportedPlatform;
      try {
        platform = validatePlatform(opts.for);
      } catch (err) {
        process.stderr.write(`\n${(err as Error).message}\n\n`);
        process.stderr.write('Run `nexpath install --help` for usage details.\n');
        process.exit(1);
      }
      try {
        await installAction(
          { yes: opts.yes, platform },
          { dbPath: opts.db ?? DEFAULT_DB_PATH },
        );
      } catch (err) {
        // The one failure that is a usage problem rather than a fault: the
        // prompts had no terminal to attach to. Printed as the instruction it
        // is, instead of the raw `uv_tty_init` stack the user got before.
        // Everything else still propagates untouched.
        if (err instanceof NonInteractiveTerminalError) {
          process.stderr.write(`\n${err.message}\n`);
          process.exit(1);
        }
        throw err;
      }
    });

  program
    .command('uninstall')
    .description('Remove nexpath-serve MCP registration from all agents (and the stored credential)')
    .option('-y, --yes', 'Skip confirmation prompt for credential removal (assumes yes)')
    .action(async (opts: { yes?: boolean }) => {
      const uninstallOpts: { yes?: boolean } = {};
      if (opts.yes) uninstallOpts.yes = true;
      await uninstallAction(uninstallOpts);
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
  registerStopCommand(program);
  registerRecordSignalCommand(program);
  registerSubmitExpiryConsumeCommand(program);
  registerSubmitPopupSuperviseCommand(program);
  registerCredentialStatusCommand(program);
  registerWindsurfHookCommand(program);
  registerCursorHookCommand(program);

  registerOptimizeCommand(program);

  // ── Status command ────────────────────────────────────────────────────────────

  registerStatusCommand(program);

  // ── Dev command (hidden) ──────────────────────────────────────────────────────

  registerFeedbackTestCommand(program);
  registerPromptEnhancementPopupHostCommand(program);

  // ── Env command (dev-environment probe transparency) ────────────────────────────

  program
    .command('env')
    .description('Show locally-probed dev-environment facts (or --clear to purge them)')
    .option('--clear', 'Purge stored dev-env facts instead of probing')
    .option('--project <path>', 'Target project root (defaults to cwd)')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { clear?: boolean; project?: string; db?: string }) => {
      await envAction(opts);
    });

  // ── Log command ───────────────────────────────────────────────────────────────

  program
    .command('log')
    .description('Show recent nexpath activity log')
    .option('--tail <n>', 'Number of lines to show (default: 50)')
    .option('--level <level>', 'Filter by log level: error | warn | info | debug')
    .action((opts: { tail?: string; level?: string }) => {
      logAction({ tail: opts.tail ? parseInt(opts.tail, 10) : undefined, level: opts.level });
    });

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

  configCmd
    .command('unset <key>')
    .description('Remove a config value (reverts to built-in default if one exists)')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (key: string, opts: { db?: string }) => {
      await configUnsetAction(key, opts.db);
    });

  configCmd
    .command('set-api-key')
    .description('Prompt for an OpenAI API key and store it securely (keychain → fallback file)')
    .action(async () => {
      await runInteractiveCommand(() => configSetApiKeyAction());
    });

  configCmd
    .command('rotate-api-key')
    .description('Replace the stored OpenAI API key (errors if no key is currently stored)')
    .action(async () => {
      await runInteractiveCommand(() => configRotateApiKeyAction());
    });

  configCmd
    .command('show-key-source')
    .description('Print which credential is in effect (env / dotenv / keychain / file / nexpath_token / none)')
    .action(async () => {
      await configShowKeySourceAction();
    });

  configCmd
    .command('remove-api-key')
    .description('Remove the stored OpenAI API key from both the keychain and the fallback file')
    .action(async () => {
      await configRemoveApiKeyAction();
    });

  configCmd
    .command('set-token')
    .description('Prompt for a Nexpath token and store it securely (keychain → fallback file)')
    .action(async () => {
      await runInteractiveCommand(() => configSetTokenAction());
    });

  configCmd
    .command('rotate-token')
    .description('Replace the stored Nexpath token (errors if no token is currently stored)')
    .action(async () => {
      await runInteractiveCommand(() => configRotateTokenAction());
    });

  configCmd
    .command('remove-token')
    .description('Remove the stored Nexpath token from both the keychain and the fallback file')
    .action(async () => {
      await configRemoveTokenAction();
    });

  // ── Content-template authoring command ─────────────────────────────────────────

  const contentTemplateCmd = program
    .command('content-template')
    .description('Author and validate shipped-preset content-template records');

  contentTemplateCmd
    .command('create <signalType>')
    .description('Scaffold a content-template record skeleton')
    .option('--shape', 'Scaffold the full 5-column maturity ladder (default: level-1 floor only)')
    .action((signalType: string, opts: { shape?: boolean }) => {
      contentTemplateCreateAction(signalType, opts);
    });

  contentTemplateCmd
    .command('validate <file>')
    .description('Schema-validate a record file and run the review gates')
    .option('--keyword <keyword>', 'Run the same-topic keyword-retention gate for this keyword')
    .action((file: string, opts: { keyword?: string }) => {
      contentTemplateValidateAction(file, opts);
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

  // ── Telemetry sync command ────────────────────────────────────────────────────

  const telemetrySyncCmd = program
    .command('telemetry-sync')
    .description('Manage the telemetry sync module');

  telemetrySyncCmd
    .command('status')
    .description('Show telemetry sync state, cursor position, and config')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { db?: string }) => {
      await telemetrySyncStatusAction(opts.db ? { dbPath: opts.db } : {});
    });

  telemetrySyncCmd
    .command('run')
    .description('Force one sync attempt now (bypasses random window — debug only)')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { db?: string }) => {
      await telemetrySyncRunAction(opts.db ? { dbPath: opts.db } : {});
    });

  telemetrySyncCmd
    .command('enable')
    .description('Set telemetry_sync_enabled = true')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { db?: string }) => {
      await telemetrySyncEnableAction(opts.db ? { dbPath: opts.db } : {});
    });

  telemetrySyncCmd
    .command('disable')
    .description('Set telemetry_sync_enabled = false (in-flight syncs finish; no new ones fire)')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { db?: string }) => {
      await telemetrySyncDisableAction(opts.db ? { dbPath: opts.db } : {});
    });

  telemetrySyncCmd
    .command('reset-cursor')
    .description('Skip backlog: jump cursor to current end-of-file')
    .action(async () => {
      await telemetrySyncResetCursorAction();
    });

  telemetrySyncCmd
    .command('ping')
    .description('Smoke-test: send one event to verify network + api_key reachability')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { db?: string }) => {
      await telemetrySyncPingAction(opts.db ? { dbPath: opts.db } : {});
    });

  // ── DB command ────────────────────────────────────────────────────────────────

  const dbCmd = program
    .command('db')
    .description('Database maintenance commands');

  dbCmd
    .command('migrate')
    .description('Apply schema migrations to an existing database (safe to re-run)')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: { db?: string }) => {
      const store = await openStore(opts.db ?? DEFAULT_DB_PATH);
      console.log('Running migrations...');
      runMigrations(store.db);
      closeStore(store);
      console.log('Done.');
    });

  return program;
}

export const program = createProgram();

export async function run(): Promise<void> {
  await program.parseAsync();
}
