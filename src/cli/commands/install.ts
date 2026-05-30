import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { confirm, isCancel, select, password, note, intro, outro, cancel as clackCancel } from '@clack/prompts';
import { SelectPrompt } from '@clack/core';
import pc from 'picocolors';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { isConfigSet, setConfig, getConfig } from '../../store/config.js';
import {
  VALID_ROLES,
  setAdvisoryFrequency,
  setRole,
} from '../shared/config-setters.js';
import { ROLE_OPTIONS, buildRoleDescriptionLines } from '../shared/role-description.js';
import {
  storeApiKey,
  removeApiKey,
  isValidApiKey,
  getKeySource,
  type KeySource,
} from '../../config/ApiKeyResolver.js';

export const MCP_SERVER_NAME = 'nexpath-prompt-store';

// ── Config entry builders (pure — no I/O) ─────────────────────────────────────

/** Standard entry used by Claude Code, Cursor, and Windsurf. */
export function buildStandardEntry(isWin = process.platform === 'win32') {
  return isWin
    ? { command: 'cmd', args: ['/c', 'npx', '-y', 'nexpath-serve'] }
    : { command: 'npx', args: ['-y', 'nexpath-serve'] };
}

/** Cline / Roo Code entry — adds disabled flag to avoid per-prompt dialogs. */
export function buildClineEntry(isWin = process.platform === 'win32') {
  return {
    ...buildStandardEntry(isWin),
    disabled: false,
  };
}

/** KiloCode entry — same as Cline but requires explicit type field. */
export function buildKiloEntry(isWin = process.platform === 'win32') {
  return {
    type: 'stdio' as const,
    ...buildStandardEntry(isWin),
    disabled: false,
  };
}

/** OpenCode entry — structurally different: array command, type local, enabled flag. */
export function buildOpenCodeEntry(isWin = process.platform === 'win32') {
  const command = isWin
    ? ['cmd', '/c', 'npx', '-y', 'nexpath-serve']
    : ['npx', '-y', 'nexpath-serve'];
  return { type: 'local' as const, command, enabled: true };
}

// ── Config path resolution ─────────────────────────────────────────────────────

export function getClinePath(home: string, appdata: string, platform = process.platform): string {
  const tail = ['Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'];
  if (platform === 'win32') return join(appdata, ...tail);
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', ...tail);
  return join(home, '.config', ...tail);
}

export function getRooCodePath(home: string, appdata: string, platform = process.platform): string {
  const tail = ['Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json'];
  if (platform === 'win32') return join(appdata, ...tail);
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', ...tail);
  return join(home, '.config', ...tail);
}

export type AgentPaths = {
  claudeJson:      string;   // user-level Claude Code MCP config (~/.claude.json)
  claudeSettings:  string;   // user-level Claude Code hook config (~/.claude/settings.json)
  claudeMcpJson:   string;   // project-level .mcp.json (fallback for uninstall)
  cursor:          string;
  windsurf:        string;
  cline:           string;
  rooCode:         string;
  kiloCode:        string;
  openCodeGlobal:  string;
  openCodeProject: string;
};

export function resolveAgentPaths(
  home = homedir(),
  appdata = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
  cwd = process.cwd(),
  platform = process.platform,
): AgentPaths {
  return {
    claudeJson:      join(home, '.claude.json'),
    claudeSettings:  join(home, '.claude', 'settings.json'),
    claudeMcpJson:   join(cwd, '.mcp.json'),
    cursor:          join(home, '.cursor', 'mcp.json'),
    windsurf:        join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    cline:           getClinePath(home, appdata, platform),
    rooCode:         getRooCodePath(home, appdata, platform),
    kiloCode:        join(cwd, '.kilocode', 'mcp.json'),
    openCodeGlobal:  join(home, '.config', 'opencode', 'opencode.json'),
    openCodeProject: join(cwd, 'opencode.json'),
  };
}

// ── Agent detection ────────────────────────────────────────────────────────────

export type AgentType = 'standard' | 'cline' | 'kilo' | 'opencode' | 'claude-cli';

export type DetectedAgent = {
  id: string;
  label: string;
  configPath: string;
  type: AgentType;
};

/**
 * Determine which agents are installed by checking whether the parent
 * directory of each agent's config file exists.
 *
 * Claude Code is always included — home dir is always present, and the CLI
 * command (claude mcp add) will be attempted first regardless.
 */
export function detectAgents(paths: AgentPaths): DetectedAgent[] {
  const found: DetectedAgent[] = [];

  // Claude Code — always detected; CLI install attempted first
  found.push({ id: 'claude', label: 'Claude Code', configPath: paths.claudeJson, type: 'claude-cli' });

  if (existsSync(dirname(paths.cursor))) {
    found.push({ id: 'cursor', label: 'Cursor', configPath: paths.cursor, type: 'standard' });
  }

  if (existsSync(dirname(paths.windsurf))) {
    found.push({ id: 'windsurf', label: 'Windsurf', configPath: paths.windsurf, type: 'standard' });
  }

  if (existsSync(dirname(paths.cline))) {
    found.push({ id: 'cline', label: 'Cline', configPath: paths.cline, type: 'cline' });
  }

  if (existsSync(dirname(paths.rooCode))) {
    found.push({ id: 'rooCode', label: 'Roo Code', configPath: paths.rooCode, type: 'cline' });
  }

  // KiloCode — detected if .kilocode/ directory exists in CWD
  if (existsSync(dirname(paths.kiloCode))) {
    found.push({ id: 'kiloCode', label: 'KiloCode', configPath: paths.kiloCode, type: 'kilo' });
  }

  // OpenCode — prefer global config dir; fall back to project-level file
  if (existsSync(dirname(paths.openCodeGlobal))) {
    found.push({ id: 'openCode', label: 'OpenCode', configPath: paths.openCodeGlobal, type: 'opencode' });
  } else if (existsSync(paths.openCodeProject)) {
    found.push({ id: 'openCode', label: 'OpenCode', configPath: paths.openCodeProject, type: 'opencode' });
  }

  return found;
}

// ── Config read / write helpers ───────────────────────────────────────────────

function readJsonSafe(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Write / overwrite the nexpath entry inside mcpServers, preserving all other content. */
export function writeMcpEntry(filePath: string, entry: Record<string, unknown>): void {
  const data = readJsonSafe(filePath);
  const servers = (data.mcpServers as Record<string, unknown> | undefined) ?? {};
  servers[MCP_SERVER_NAME] = entry;
  data.mcpServers = servers;
  writeJson(filePath, data);
}

/** Remove the nexpath entry from mcpServers. Returns false if file / key absent. */
export function removeMcpEntry(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const data = readJsonSafe(filePath);
  const servers = data.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(MCP_SERVER_NAME in servers)) return false;
  delete servers[MCP_SERVER_NAME];
  data.mcpServers = servers;
  writeJson(filePath, data);
  return true;
}

/** Write / overwrite the nexpath entry inside OpenCode's "mcp" key. */
export function writeOpenCodeEntry(filePath: string, entry: Record<string, unknown>): void {
  const data = readJsonSafe(filePath);
  if (!data.$schema) data.$schema = 'https://opencode.ai/config.json';
  const mcp = (data.mcp as Record<string, unknown> | undefined) ?? {};
  mcp[MCP_SERVER_NAME] = entry;
  data.mcp = mcp;
  writeJson(filePath, data);
}

/** Remove the nexpath entry from OpenCode's "mcp" key. Returns false if absent. */
export function removeOpenCodeEntry(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const data = readJsonSafe(filePath);
  const mcp = data.mcp as Record<string, unknown> | undefined;
  if (!mcp || !(MCP_SERVER_NAME in mcp)) return false;
  delete mcp[MCP_SERVER_NAME];
  data.mcp = mcp;
  writeJson(filePath, data);
  return true;
}

// ── Claude Code hook helpers ──────────────────────────────────────────────────

/** Path to the user-level Claude Code settings file (where hooks are configured). */
export function getClaudeSettingsPath(home: string): string {
  return join(home, '.claude', 'settings.json');
}

/**
 * Build the shell command string for the UserPromptSubmit hook.
 *
 * Uses `node` explicitly with the absolute path to the running CLI so the hook
 * works regardless of whether nexpath is globally installed or run from a local
 * build (PATH is not required).
 *
 * Forward slashes are used throughout so the value is safe in PowerShell and cmd
 * on Windows as well as bash/zsh on Unix.
 */
export function buildHookCommand(home: string, platform = process.platform): string {
  const cliPath = resolve(process.argv[1]).replace(/\\/g, '/');
  const dbPath  = join(home, '.nexpath', 'prompt-store.db').replace(/\\/g, '/');
  return `node "${cliPath}" auto --db "${dbPath}"`;
}

/** Build the shell command string for the Stop hook. */
export function buildStopHookCommand(home: string, platform = process.platform): string {
  const cliPath = resolve(process.argv[1]).replace(/\\/g, '/');
  const dbPath  = join(home, '.nexpath', 'prompt-store.db').replace(/\\/g, '/');
  return `node "${cliPath}" stop --db "${dbPath}"`;
}

/**
 * Build the UserPromptSubmit + Stop hook entry objects.
 *
 * The `_nexpath_hook: true` field is the reliable deduplication and removal
 * marker — it survives path changes across reinstalls, unlike scanning the
 * command string.
 *
 * No `timeout` field is set so Claude Code uses its default (600 s), which is
 * required for hooks that block for UI interaction (the decision session).
 */
export function buildHookEntry(home: string, platform = process.platform): Record<string, unknown> {
  return {
    UserPromptSubmit: [
      {
        _nexpath_hook: true,
        matcher:       '',
        hooks: [
          {
            type:    'command',
            command: buildHookCommand(home, platform),
          },
        ],
      },
    ],
    Stop: [
      {
        _nexpath_hook: true,
        matcher:       '',
        hooks: [
          {
            type:    'command',
            command: buildStopHookCommand(home, platform),
          },
        ],
      },
    ],
  };
}

/**
 * Write the nexpath UserPromptSubmit and Stop hooks into ~/.claude/settings.json.
 *
 * Uses a read-filter-append pattern so existing hooks written by other tools are
 * preserved.  Any prior nexpath hook group (identified by `_nexpath_hook: true`)
 * is removed before appending the fresh entry, making this operation idempotent.
 */
export function writeHookEntry(filePath: string, home: string, platform = process.platform): void {
  const data  = readJsonSafe(filePath);
  const hooks = (data.hooks as Record<string, unknown> | undefined) ?? {};
  const entry = buildHookEntry(home, platform);

  // UserPromptSubmit
  const existingUPS = (hooks.UserPromptSubmit as Array<Record<string, unknown>> | undefined) ?? [];
  hooks.UserPromptSubmit = [
    ...existingUPS.filter((g) => !g._nexpath_hook),
    ...(entry.UserPromptSubmit as unknown[]),
  ];

  // Stop
  const existingStop = (hooks.Stop as Array<Record<string, unknown>> | undefined) ?? [];
  hooks.Stop = [
    ...existingStop.filter((g) => !g._nexpath_hook),
    ...(entry.Stop as unknown[]),
  ];

  data.hooks = hooks;
  writeJson(filePath, data);
}

/**
 * Remove the nexpath UserPromptSubmit and Stop hooks from ~/.claude/settings.json.
 *
 * Identifies nexpath-written hook groups by the `_nexpath_hook: true` field.
 * Returns false if the file does not exist or no nexpath hooks were found.
 */
export function removeHookEntry(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const data  = readJsonSafe(filePath);
  const hooks = data.hooks as Record<string, unknown> | undefined;
  if (!hooks) return false;

  let removed = false;

  // UserPromptSubmit
  const upsGroups = hooks.UserPromptSubmit as Array<Record<string, unknown>> | undefined;
  if (upsGroups) {
    const filtered = upsGroups.filter((g) => !g._nexpath_hook);
    if (filtered.length < upsGroups.length) {
      removed = true;
      if (filtered.length === 0) delete hooks.UserPromptSubmit;
      else hooks.UserPromptSubmit = filtered;
    }
  }

  // Stop
  const stopGroups = hooks.Stop as Array<Record<string, unknown>> | undefined;
  if (stopGroups) {
    const filtered = stopGroups.filter((g) => !g._nexpath_hook);
    if (filtered.length < stopGroups.length) {
      removed = true;
      if (filtered.length === 0) delete hooks.Stop;
      else hooks.Stop = filtered;
    }
  }

  if (!removed) return false;
  data.hooks = hooks;
  writeJson(filePath, data);
  return true;
}

// ── Claude Code CLI helpers ───────────────────────────────────────────────────

export type ExecFn = (cmd: string) => void;

const defaultExec: ExecFn = (cmd) => execSync(cmd, { stdio: 'pipe' });

export function claudeCliInstall(execFn: ExecFn = defaultExec): boolean {
  try {
    execFn(`claude mcp add --scope user ${MCP_SERVER_NAME} -- npx -y nexpath-serve`);
    return true;
  } catch {
    return false;
  }
}

export function claudeCliUninstall(execFn: ExecFn = defaultExec): boolean {
  try {
    execFn(`claude mcp remove ${MCP_SERVER_NAME}`);
    return true;
  } catch {
    return false;
  }
}

// ── installAction ──────────────────────────────────────────────────────────────

export type ConfirmFn = () => Promise<boolean>;

const defaultConfirm: ConfirmFn = async () => {
  const answer = await confirm({
    message: `Register ${MCP_SERVER_NAME} in all detected agents?`,
  });
  return !isCancel(answer) && answer === true;
};

export type FreqPromptFn = (currentValue: string) => Promise<string | symbol>;
export type RolePromptFn = (currentValue: string) => Promise<string | symbol>;

const DEFAULT_FREQUENCY = 'every_event';
const DEFAULT_ROLE      = 'founder';

const defaultFreqPrompt: FreqPromptFn = async (currentValue) =>
  select({
    message: 'Advisory frequency — choose how often nexpath should surface advisories',
    initialValue: currentValue,
    options: [
      { value: 'optimum',          label: 'Optimum — frequent advisories' },
      { value: 'every_event',      label: 'Every qualifying event' },
      { value: 'major_only',       label: 'Major transitions only' },
      { value: 'once_per_session', label: 'Once per coding session' },
      { value: 'off',              label: 'Off — disable all advisories' },
    ],
  });

// Radio-button role picker whose gray "why" description sits BELOW the options
// (a plain select() only renders its message above them). Mirrors the popup.
const defaultRolePrompt: RolePromptFn = async (currentValue) => {
  const descLines = buildRoleDescriptionLines();
  const p = new SelectPrompt<{ value: string; label: string }>({
    options: ROLE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
    initialValue: currentValue,
    render() {
      const sym = this.state === 'submit' ? pc.green('◇')
                : this.state === 'cancel' ? pc.red('■')
                : pc.cyan('◆');
      const head = `${pc.gray('│')}\n${sym}  ${pc.bold('Project role')}\n`;
      if (this.state === 'submit' || this.state === 'cancel') {
        return `${head}${pc.gray('│')}  ${pc.dim(this.options[this.cursor].label)}`;
      }
      const optLines = this.options
        .map((o, i) =>
          i === this.cursor
            ? `${pc.cyan('│')}  ${pc.green('●')} ${o.label}`
            : `${pc.cyan('│')}  ${pc.dim('○')} ${pc.dim(o.label)}`,
        )
        .join('\n');
      return `${head}${optLines}\n${pc.cyan('│')}\n${descLines.join('\n')}\n${pc.cyan('└')}\n`;
    },
  });
  return p.prompt();
};

/** Read the currently configured advisory_frequency, default 'every_event'. */
function readInstallFreq(db: import('sql.js').Database): string {
  const v = getConfig(db, 'advisory_frequency');
  return v && v !== '' ? v : DEFAULT_FREQUENCY;
}

/** Read the currently configured role, default 'founder'; reject legacy 'clear' / ''. */
function readInstallRole(db: import('sql.js').Database): string {
  const v = getConfig(db, 'role');
  if (!v || v === 'clear') return DEFAULT_ROLE;
  return (VALID_ROLES as readonly string[]).includes(v) ? v : DEFAULT_ROLE;
}

// ── 3-step install UX prompt interface ───────────────────────────────────────

export type ApiKeyPromptContext = {
  hasEnvKey:    boolean;
  hasStoredKey: boolean;
  keychainName: string;
};

export type ApiKeyPromptResult =
  | { kind: 'use_env' }
  | { kind: 'keep_existing' }
  | { kind: 'new_key'; value: string }
  | { kind: 'skip' }
  | { kind: 'cancel' };

export type TelemetryConsentResult =
  | { kind: 'enable' }
  | { kind: 'disable' }
  | { kind: 'cancel' };

export interface InstallPrompts {
  apiKeyPrompt:     (ctx: ApiKeyPromptContext) => Promise<ApiKeyPromptResult>;
  telemetryConsent: () => Promise<TelemetryConsentResult>;
}

export function getKeychainName(platform: NodeJS.Platform = process.platform): string {
  switch (platform) {
    case 'darwin': return 'macOS Keychain';
    case 'linux':  return 'Secret Service (libsecret)';
    case 'win32':  return 'Credential Manager';
    default:       return 'Encrypted file at ~/.nexpath/config.json';
  }
}

const defaultInstallPrompts: InstallPrompts = {
  apiKeyPrompt: async (ctx) => {
    note(
      [
        'Nexpath needs an OpenAI API key to generate advisories.',
        'Enter it once here — it will be stored securely and used',
        'for all your projects until you run `nexpath uninstall`.',
        '',
        'Get a key: https://platform.openai.com/api-keys',
      ].join('\n'),
      'Step 1 of 3 — OpenAI API Key (required)',
    );

    if (ctx.hasEnvKey) {
      const useEnv = await confirm({
        message:      'Detected existing API key in environment. Use it?',
        initialValue: true,
      });
      if (isCancel(useEnv)) return { kind: 'cancel' };
      if (useEnv === true)  return { kind: 'use_env' };
    }
    const promptMsg = ctx.hasStoredKey
      ? `API Key (Enter to keep existing key stored in ${ctx.keychainName}):`
      : `API Key (will be stored in ${ctx.keychainName}):`;
    const input = await password({
      message:  promptMsg,
      validate: (value) => {
        if (ctx.hasStoredKey && value === '') return undefined;
        if (!isValidApiKey(value)) return 'Invalid OpenAI API key format (expected sk-...)';
        return undefined;
      },
    });
    if (isCancel(input)) return { kind: 'cancel' };
    if (input === '' && ctx.hasStoredKey) return { kind: 'keep_existing' };
    if (input === '') return { kind: 'skip' };
    return { kind: 'new_key', value: String(input) };
  },
  telemetryConsent: async () => {
    note(
      [
        'We highly recommend you provide us logs so we can',
        'get better information to improve nexpath as much',
        'as possible.',
        '',
        "What's collected:  anonymous usage events (command",
        '                   names, timings, error types)',
        "What's NOT sent:   your code, prompts, API key,",
        '                   file paths, personal information',
        '',
        'If you select:',
        'Yes  → events captured locally AND auto-synced to our server',
        'No   → no capture, no sync — full stop',
        '',
        'Change anytime: `nexpath config set telemetry.enabled true|false`',
      ].join('\n'),
      'Step 2 of 3 — Telemetry',
    );
    const answer = await confirm({
      message:      'Enable telemetry?',
      initialValue: true,
    });
    if (isCancel(answer)) return { kind: 'cancel' };
    return answer === true ? { kind: 'enable' } : { kind: 'disable' };
  },
};

export interface InstallSummary {
  apiKey:    { source: 'keychain' | 'file' | 'kept' | 'skipped' };
  telemetry: { enabled: boolean };
  agents:    { registered: string[]; failed: string[] };
  extras:    { clipboardInstalled: boolean; clipboardTool: string | null };
}

export async function installAction(
  opts: { yes?: boolean } = {},
  {
    isWin = process.platform === 'win32',
    paths = resolveAgentPaths(),
    execFn,
    confirmFn = defaultConfirm,
    freqPromptFn = defaultFreqPrompt,
    rolePromptFn = defaultRolePrompt,
    promptFn  = defaultInstallPrompts,
    dbPath = ':memory:',
    skipClipboardCheck = false,
    platformForKeychain = process.platform,
  }: {
    isWin?:               boolean;
    paths?:               AgentPaths;
    execFn?:              ExecFn;
    confirmFn?:           ConfirmFn;
    freqPromptFn?:        FreqPromptFn;
    rolePromptFn?:        RolePromptFn;
    promptFn?:            InstallPrompts;
    dbPath?:              string;
    skipClipboardCheck?:  boolean;
    platformForKeychain?: NodeJS.Platform;
  } = {},
): Promise<InstallSummary | null> {
  intro('Installing nexpath');

  const store = await openStore(dbPath);

  let apiKeySource:  InstallSummary['apiKey']['source'] = 'skipped';
  let telemetryEnabled = true;

  try {
    // ── Step 1: API key ───────────────────────────────────────────────────────
    if (!opts.yes) {
      const envKey       = process.env.OPENAI_API_KEY ?? '';
      const hasEnvKey    = envKey !== '' && isValidApiKey(envKey);
      const storedSource = await getKeySource(process.cwd());
      const hasStoredKey = !hasEnvKey && (storedSource === 'keychain' || storedSource === 'file');
      const keychainName = getKeychainName(platformForKeychain);

      const result = await promptFn.apiKeyPrompt({ hasEnvKey, hasStoredKey, keychainName });

      if (result.kind === 'cancel') {
        clackCancel('Setup aborted — no changes made');
        closeStore(store);
        return null;
      }
      if (result.kind === 'new_key') {
        const stored = await storeApiKey(result.value);
        apiKeySource = stored.source;
        console.log(`✓ Stored in ${stored.source === 'keychain' ? keychainName : 'fallback file (~/.nexpath/config.json)'}`);
      } else if (result.kind === 'use_env') {
        const stored = await storeApiKey(envKey);
        apiKeySource = stored.source;
        console.log(`✓ Stored in ${stored.source === 'keychain' ? keychainName : 'fallback file (~/.nexpath/config.json)'}`);
      } else if (result.kind === 'keep_existing') {
        apiKeySource = 'kept';
      } else {
        apiKeySource = 'skipped';
      }
    } else {
      apiKeySource = 'skipped';
    }

    // ── Step 2: Telemetry ─────────────────────────────────────────────────────
    if (!opts.yes) {
      const consent = await promptFn.telemetryConsent();
      if (consent.kind === 'cancel') {
        clackCancel('Setup aborted — no changes made');
        closeStore(store);
        return null;
      }
      telemetryEnabled = consent.kind === 'enable';
    }
    setConfig(store, 'telemetry.enabled',      String(telemetryEnabled));
    setConfig(store, 'telemetry_sync_enabled', String(telemetryEnabled));
  } finally {
    if (store.dbPath !== ':memory:' || telemetryEnabled !== true) {
      // close happens at end of step 3 path; nothing to do here
    }
  }

  // ── Step 3: Agent detection + registration ────────────────────────────────
  const agents = detectAgents(paths);

  if (agents.length === 0) {
    console.log('No supported agents detected. Run nexpath install --help for details.');
    closeStore(store);
    return {
      apiKey:    { source: apiKeySource },
      telemetry: { enabled: telemetryEnabled },
      agents:    { registered: [], failed: [] },
      extras:    { clipboardInstalled: false, clipboardTool: null },
    };
  }

  const detectedNames = agents.map((a) => a.label).join(', ');
  console.log(`Detected: ${detectedNames}`);

  if (!opts.yes) {
    const ok = await confirmFn();
    if (!ok) {
      console.log('Cancelled.');
      closeStore(store);
      return null;
    }
  }

  // NOTE: Enable REGISTER_MCP_SERVER when MCP tools are added to src/server/tools.ts.
  // Currently TOOLS is empty — no reason to spin up the MCP server process yet.
  const REGISTER_MCP_SERVER = false;

  const registered: string[] = [];
  const failed:     string[] = [];

  for (const agent of agents) {
    try {
      if (agent.type === 'claude-cli') {
        if (REGISTER_MCP_SERVER) {
          const ok = claudeCliInstall(execFn);
          if (ok) {
            console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 registered via claude mcp add`);
          } else {
            // Fallback: write ~/.claude.json directly
            writeMcpEntry(agent.configPath, buildStandardEntry(isWin));
            console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 written to ${agent.configPath} (CLI fallback)`);
          }
        }
        // Register the advisory pipeline hook (separate from MCP — different file)
        try {
          writeHookEntry(paths.claudeSettings, homedir(), isWin ? 'win32' : process.platform);
          console.log(`\u2713 ${'Claude Code'.padEnd(12)} \u2014 advisory hook written to ${paths.claudeSettings}`);
          registered.push('Claude Code');
        } catch (err) {
          console.log(`\u26a0 ${'Claude Code'.padEnd(12)} \u2014 hook write failed: ${(err as Error).message}`);
          failed.push('Claude Code');
        }
      } else if (REGISTER_MCP_SERVER) {
        if (agent.type === 'cline') {
          writeMcpEntry(agent.configPath, buildClineEntry(isWin));
          console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 written to ${agent.configPath}`);
        } else if (agent.type === 'kilo') {
          writeMcpEntry(agent.configPath, buildKiloEntry(isWin));
          console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 written to ${agent.configPath}`);
        } else if (agent.type === 'opencode') {
          writeOpenCodeEntry(agent.configPath, buildOpenCodeEntry(isWin));
          console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 written to ${agent.configPath}`);
        } else {
          writeMcpEntry(agent.configPath, buildStandardEntry(isWin));
          console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 written to ${agent.configPath}`);
        }
        registered.push(agent.label);
      }
    } catch (err) {
      console.log(`\u2717 ${agent.label.padEnd(12)} \u2014 failed: ${(err as Error).message}`);
      failed.push(agent.label);
    }
  }

  // ── Frequency + role prompts ───────────────────────────────────────────────
  // Reuse the already-open `store` — opening a second store on the same dbPath
  // would deadlock on the exclusive file lock and clobber these writes when the
  // first store is closed afterwards.
  const currentFreq = readInstallFreq(store.db);
  if (opts.yes) {
    if (!isConfigSet(store.db, 'advisory_frequency')) {
      setAdvisoryFrequency(store, 'advisory_frequency', currentFreq);
    }
  } else {
    const picked = await freqPromptFn(currentFreq);
    if (!isCancel(picked) && typeof picked === 'string') {
      setAdvisoryFrequency(store, 'advisory_frequency', picked);
      console.log(`✓ advisory_frequency = ${picked}`);
    }
  }

  const currentRole = readInstallRole(store.db);
  if (opts.yes) {
    if (!isConfigSet(store.db, 'role')) {
      setRole(store, 'role', currentRole);
    }
  } else {
    const picked = await rolePromptFn(currentRole);
    if (!isCancel(picked) && typeof picked === 'string') {
      setRole(store, 'role', picked);
      console.log(`✓ role = ${picked}`);
    }
  }

  console.log('');
  console.log('Restart your agents to activate nexpath-prompt-store.');

  closeStore(store);

  let clipboardResult: ClipboardEnsureResult = { installed: false, toolName: null, alreadyHad: false };
  if (!skipClipboardCheck) {
    clipboardResult = await ensureLinuxClipboard({ autoConfirm: opts.yes });
  }

  // ── Final summary (note + outro) ─────────────────────────────────────────
  const summary: InstallSummary = {
    apiKey:    { source: apiKeySource },
    telemetry: { enabled: telemetryEnabled },
    agents:    { registered, failed },
    extras:    {
      clipboardInstalled: clipboardResult.installed,
      clipboardTool:      clipboardResult.toolName,
    },
  };
  const extrasLine = clipboardResult.installed
    ? `Extras:     ${clipboardResult.toolName} installed for clipboard`
    : null;
  const summaryLines = [
    `API key:    ${apiKeySource}`,
    `Telemetry:  ${telemetryEnabled ? 'enabled' : 'disabled'}`,
    `Agents:     ${registered.length > 0 ? registered.join(', ') : 'none'}`,
    failed.length > 0 ? `Failed:     ${failed.join(', ')}` : null,
    extrasLine,
  ].filter((l): l is string => l !== null).join('\n');
  note(summaryLines, 'Setup Complete');
  outro('Done!');

  return summary;
}

// ── Linux clipboard tool auto-install ─────────────────────────────────────────

interface PkgManager {
  cmd:     string;
  install: string[];
}

const PKG_MANAGERS: PkgManager[] = [
  { cmd: 'apt',    install: ['sudo', 'apt', 'install', '-y', 'xclip'] },
  { cmd: 'dnf',    install: ['sudo', 'dnf', 'install', '-y', 'xclip'] },
  { cmd: 'pacman', install: ['sudo', 'pacman', '-S', '--noconfirm', 'xclip'] },
  { cmd: 'zypper', install: ['sudo', 'zypper', 'install', '-y', 'xclip'] },
  { cmd: 'apk',    install: ['sudo', 'apk', 'add', 'xclip'] },
];

/**
 * On Linux, check if a clipboard tool (xclip/wl-copy/xsel) is available.
 * If not, detect the system package manager and offer to install xclip.
 *
 * Runs only on Linux — macOS has pbcopy, Windows has clip.exe.
 * Clipboard is optional — if install is skipped or fails, decision sessions
 * still work but "Copy to clipboard" silently does nothing.
 */
export interface ClipboardEnsureResult {
  installed:    boolean;
  toolName:     string | null;
  alreadyHad:   boolean;
}

export async function ensureLinuxClipboard(
  deps: {
    platform?: string;
    spawnFn?: typeof spawnSync;
    execFn?: typeof execSync;
    confirmFn?: ConfirmFn;
    autoConfirm?: boolean;
    waylandDisplay?: string;
  } = {},
): Promise<ClipboardEnsureResult> {
  const plat  = deps.platform ?? process.platform;
  const spawn = deps.spawnFn  ?? spawnSync;
  const exec  = deps.execFn   ?? execSync;

  if (plat !== 'linux') return { installed: false, toolName: null, alreadyHad: false };

  for (const cmd of ['xclip', 'wl-copy', 'xsel']) {
    if (spawn('which', [cmd], { stdio: 'pipe' }).status === 0) {
      return { installed: false, toolName: cmd, alreadyHad: true };
    }
  }

  // Wayland prefers wl-clipboard (provides wl-copy); X11 prefers xclip
  const isWayland = !!(deps.waylandDisplay ?? process.env.WAYLAND_DISPLAY);
  const pkgName   = isWayland ? 'wl-clipboard' : 'xclip';
  const toolName  = isWayland ? 'wl-copy' : 'xclip';

  // Build install commands with the right package name
  const pkgManagers = PKG_MANAGERS.map((p) => ({
    cmd: p.cmd,
    install: p.install.map((arg) => (arg === 'xclip' ? pkgName : arg)),
  }));

  const pm = pkgManagers.find((p) => spawn('which', [p.cmd], { stdio: 'pipe' }).status === 0);
  if (!pm) {
    console.log(`\u26a0 No clipboard tool (xclip/wl-copy/xsel) found. Install one manually for clipboard support.`);
    return { installed: false, toolName: null, alreadyHad: false };
  }

  console.log('');
  console.log(`Clipboard support requires ${toolName} (not found on this system).`);

  if (!deps.autoConfirm) {
    const confirmFn = deps.confirmFn ?? (async () => {
      const answer = await confirm({ message: `Install ${pkgName} using ${pm.cmd}?` });
      return !isCancel(answer) && answer === true;
    });
    const ok = await confirmFn();
    if (!ok) {
      console.log('\u26a0 Skipped \u2014 "Copy to clipboard" in decision sessions will not work.');
      return { installed: false, toolName: null, alreadyHad: false };
    }
  }

  try {
    exec(pm.install.join(' '), { stdio: 'inherit' });
    // Verify installation succeeded
    if (spawn('which', [toolName], { stdio: 'pipe' }).status === 0) {
      console.log(`\u2713 ${pkgName} installed successfully`);
      return { installed: true, toolName, alreadyHad: false };
    }
    console.log(`\u26a0 ${pkgName} install command ran but ${toolName} not found \u2014 check output above`);
    return { installed: false, toolName: null, alreadyHad: false };
  } catch {
    console.log(`\u26a0 ${pkgName} installation failed \u2014 install manually: sudo ${pm.cmd} install ${pkgName}`);
    return { installed: false, toolName: null, alreadyHad: false };
  }
}

// ── uninstallAction ────────────────────────────────────────────────────────────

export type UninstallApiKeyConfirmFn = () => Promise<boolean>;

const defaultUninstallApiKeyConfirm: UninstallApiKeyConfirmFn = async () => {
  const answer = await confirm({
    message:      'Remove stored API key?',
    initialValue: true,
  });
  return !isCancel(answer) && answer === true;
};

export async function uninstallAction(
  {
    paths = resolveAgentPaths(),
    execFn,
    apiKeyConfirmFn = defaultUninstallApiKeyConfirm,
    yes = false,
    projectRoot = process.cwd(),
    dbPath,
  }: {
    paths?:           AgentPaths;
    execFn?:          ExecFn;
    apiKeyConfirmFn?: UninstallApiKeyConfirmFn;
    yes?:             boolean;
    projectRoot?:     string;
    dbPath?:          string;
  } = {},
): Promise<void> {
  const agents = detectAgents(paths);

  for (const agent of agents) {
    try {
      let removed = false;

      if (agent.type === 'claude-cli') {
        removed = claudeCliUninstall(execFn);
        if (!removed) {
          // Scope bug fallback: edit files directly
          const fromJson = removeMcpEntry(agent.configPath);
          const fromMcp  = removeMcpEntry(paths.claudeMcpJson);
          removed = fromJson || fromMcp;
        }
        // Remove advisory pipeline hook (separate from MCP)
        const hookRemoved = removeHookEntry(paths.claudeSettings);
        console.log(hookRemoved
          ? `\u2713 ${'Claude Code'.padEnd(12)} \u2014 advisory hook removed`
          : `- ${'Claude Code'.padEnd(12)} \u2014 hook not registered, skipped`);
      } else if (agent.type === 'opencode') {
        removed = removeOpenCodeEntry(agent.configPath);
      } else {
        removed = removeMcpEntry(agent.configPath);
      }

      if (removed) {
        console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 removed`);
      } else {
        console.log(`- ${agent.label.padEnd(12)} \u2014 not registered, skipped`);
      }
    } catch (err) {
      console.log(`\u2717 ${agent.label.padEnd(12)} \u2014 failed: ${(err as Error).message}`);
    }
  }

  console.log('');
  console.log('MCP registration removed from all agents.');

  // ── API key cleanup ──────────────────────────────────────────────────────
  const currentSource = await getKeySource(projectRoot);
  if (currentSource === 'none') {
    console.log('No stored API key found, nothing to remove.');
  } else {
    const shouldRemove = yes || await apiKeyConfirmFn();
    if (shouldRemove) {
      await removeApiKey();
      console.log(`✓ API key removed (was in ${currentSource}).`);
    } else {
      console.log('- API key retained; remove later with `nexpath config remove-api-key`.');
    }
  }

  // ── Telemetry config cleanup ─────────────────────────────────────────────
  try {
    const store = await openStore(dbPath ?? DEFAULT_DB_PATH);
    try {
      setConfig(store, 'telemetry.enabled',      'false');
      setConfig(store, 'telemetry_sync_enabled', 'false');
      console.log('✓ Telemetry disabled in local config.');
    } finally {
      closeStore(store);
    }
  } catch {
    // Best-effort — never crash uninstall over a config write failure.
  }

  console.log('');
  console.log('Prompt history retained at ~/.nexpath/prompt-store.db');
  console.log('To delete it: nexpath store delete');
}
