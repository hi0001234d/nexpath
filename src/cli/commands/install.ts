import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { confirm, isCancel, select, password, note, intro, outro, cancel as clackCancel } from '@clack/prompts';
import { SelectPrompt } from '@clack/core';
import pc from 'picocolors';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { describeFeature1Tools, feature1ToolsStatus, stopFeature1Worker } from '../../context-engineering/worker/tools-status.js';
import { FEATURE1_TOOLS_CONFIG_KEY } from '../../context-engineering/worker/worker-client.js';
import { isConfigSet, setConfig, getConfig } from '../../store/config.js';
import { setInstalledAtIfMissing } from '../../store/feedback-signals.js';
import { expireSessionsForCredentialChange } from '../../store/session-reset.js';
import { NonInteractiveTerminalError, withInteractiveTerminal } from './interactive-terminal.js';
import { flushIfTelemetryOn } from '../../telemetry/lifecycle-flush.js';
import {
  VALID_ROLES,
  setAdvisoryFrequency,
  setRole,
} from '../shared/config-setters.js';
import { ROLE_OPTIONS, buildRoleDescriptionLines } from '../shared/role-description.js';
import {
  CREDENTIAL_OPTIONS,
  CREDENTIAL_PROMPT_TITLE,
  CREDENTIAL_KEY_WINS_NOTICE,
  buildCredentialTokenHelpLines,
  buildCredentialOptionLines,
  credentialInputMessage,
  type CredentialChoice,
} from '../shared/credential-description.js';
import {
  storeApiKey,
  removeApiKey,
  isValidApiKey,
  getKeySource,
  type KeySource,
} from '../../config/ApiKeyResolver.js';
import {
  storeNexpathToken,
  removeNexpathToken,
  isValidNexpathToken,
} from '../../config/NexpathTokenStore.js';

// Side-effect import: registers all coding-agent adapters with the in-process
// registry. Must precede any getAdapter() / detectAll() call in installAction below.
import '../../agents/index.js';
import { getAdapter, detectAll } from '../../agents/registry.js';
import type { HookAdapter, InstallContext } from '../../agents/types.js';
// Internal use + backward-compat re-export of the Claude Code hook helpers
// (moved to src/agents/adapters/claude-code.ts in M1 Branch 2 — v0.1.3/m1/claude-code-refactor).
import {
  getClaudeSettingsPath,
  buildHookCommand,
  buildStopHookCommand,
  buildHookEntry,
  writeHookEntry,
  removeHookEntry,
} from '../../agents/adapters/claude-code.js';
import {
  type SupportedPlatform,
  DEFAULT_PLATFORM,
  supportedAgentsForPlatform,
  supportedIdsForPlatform,
  eligibleCategoriesForPlatform,
} from './supported-agents-by-platform.js';
export {
  getClaudeSettingsPath,
  buildHookCommand,
  buildStopHookCommand,
  buildHookEntry,
  writeHookEntry,
  removeHookEntry,
};

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
 * Detect every agent whose config directory exists on disk, without applying
 * any platform gate. Used by the uninstall flow so that legacy registration
 * entries written by older nexpath versions can still be removed.
 */
export function detectAgentsForCleanup(paths: AgentPaths): DetectedAgent[] {
  const found: DetectedAgent[] = [];

  // Claude Code — detected when its user-level config file (~/.claude.json) or
  // settings dir (~/.claude/) exists. Both are created on first interactive run.
  if (existsSync(paths.claudeJson) || existsSync(dirname(paths.claudeSettings))) {
    found.push({ id: 'claude', label: 'Claude Code', configPath: paths.claudeJson, type: 'claude-cli' });
  }

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

/**
 * Determine which agents to register on install for a given install target.
 * Returns only agents whose `id` is officially supported on `platform`.
 * Agents present on disk but outside the platform's supported set are
 * silently filtered out.
 */
export function detectAgentsForPlatform(
  paths: AgentPaths,
  platform: SupportedPlatform,
): DetectedAgent[] {
  const supportedIds = supportedIdsForPlatform(platform);
  return detectAgentsForCleanup(paths).filter((a) => supportedIds.has(a.id));
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
// Function definitions moved to src/agents/adapters/claude-code.ts in M1 Branch 2
// (v0.1.3/m1/claude-code-refactor). Bodies are byte-identical to what lived
// here before; the import + re-export at the top of this file preserves the
// existing public API so callers importing from './install.js' are unaffected.

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

// Owner, 2026-09-18: High, not Medium. The picker stays hidden at install, so this constant IS what a
// new machine gets — and on Medium the whole PE cadence series does nothing: its session cap is still
// 5 / 10 and `countBudgetOnShow` is false there, so a 392-prompt session tops out at ten popups against
// forty-eight on High (`measurements/phase-4-after.md`). Seeding Medium silently meant shipping the fix
// to nobody. Changeable either way with `nexpath config set advisory_frequency`.
const DEFAULT_FREQUENCY = 'optimum';
const DEFAULT_ROLE      = 'founder';

const defaultFreqPrompt: FreqPromptFn = async (currentValue) =>
  select({
    message: 'Advisory frequency — choose how often nexpath should surface advisories',
    initialValue: currentValue,
    options: [
      // Active picker options: simple High / Medium / Low labels.
      { value: 'optimum',     label: 'High' },
      { value: 'every_event', label: 'Medium' },
      { value: 'major_only',  label: 'Low' },
      // The two entries below stay valid via the CLI (nexpath config set
      // advisory_frequency once_per_session / off) and are still honoured by
      // the gating logic — they are intentionally hidden from this picker.
      // { value: 'once_per_session', label: 'Once per coding session' },
      // { value: 'off',              label: 'Off — disable all advisories' },
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

/** Read the currently configured advisory_frequency, default `DEFAULT_FREQUENCY` ('optimum' / High). */
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
  /** A Nexpath token is already stored — the token half of `hasStoredKey`. */
  hasStoredToken: boolean;
  keychainName: string;
};

export type ApiKeyPromptResult =
  | { kind: 'use_env' }
  | { kind: 'keep_existing' }
  | { kind: 'new_key'; value: string }
  // The second credential. There is deliberately no new "skip" variant beside
  // it: one credential was required before and one still is; the choice is
  // which, not whether.
  | { kind: 'nexpath_token'; value: string }
  | { kind: 'skip' }
  | { kind: 'cancel' };

export interface InstallPrompts {
  apiKeyPrompt: (ctx: ApiKeyPromptContext) => Promise<ApiKeyPromptResult>;
  /**
   * Which credential the user wants. Separated from the input itself so a test
   * can drive the branch without reimplementing the prompt, exactly as
   * `apiKeyPrompt` is injected today. Returning `null` means cancelled.
   */
  credentialChoicePrompt: (ctx: ApiKeyPromptContext) => Promise<CredentialChoice | null>;
}

export function getKeychainName(platform: NodeJS.Platform = process.platform): string {
  switch (platform) {
    case 'darwin': return 'macOS Keychain';
    case 'linux':  return 'Secret Service (libsecret)';
    case 'win32':  return 'Credential Manager';
    default:       return 'Encrypted file at ~/.nexpath/config.json';
  }
}

/**
 * The credential picker. Rendered with the same custom `SelectPrompt` the role
 * picker uses, so the explanatory block can sit beneath the options where a
 * plain `select` would have no room for it.
 */
// ── Interactive-terminal failures ────────────────────────────────────────────
// The mechanism moved to `interactive-terminal.ts` so `token.ts` can reach it
// without importing this module's whole graph (Vedansi, 2026-09-07: `config
// set-token` dies with a raw ERR_TTY_INIT_FAILED on a non-TTY stdin).
//
// `NonInteractiveTerminalError` is RE-EXPORTED, not moved out of reach: `main.ts`
// imports it from here and the `instanceof` check at its install action depends
// on there being exactly one class. Re-exporting keeps that one class.
export { NonInteractiveTerminalError } from './interactive-terminal.js';

const defaultCredentialChoicePrompt = async (): Promise<CredentialChoice | null> => {
  const p = new SelectPrompt<{ value: string; label: string }>({
    options: CREDENTIAL_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
    initialValue: CREDENTIAL_OPTIONS[0].value,
    render() {
      const sym = this.state === 'submit' ? pc.green('◇')
                : this.state === 'cancel' ? pc.red('■')
                : pc.cyan('◆');
      const head = `${pc.gray('│')}\n${sym}  ${pc.bold(CREDENTIAL_PROMPT_TITLE)}\n`;
      if (this.state === 'submit' || this.state === 'cancel') {
        return `${head}${pc.gray('│')}  ${pc.dim(this.options[this.cursor].label)}`;
      }
      // Each option is drawn with its own detail lines directly beneath it, so
      // the reader compares the two choices where they are actually choosing
      // rather than against a repeated heading further down the screen. The
      // whole block comes from the copy module — the picker no longer lays out
      // the option rows itself, which is what let the two fall out of step.
      return `${head}${buildCredentialOptionLines(this.cursor).join('\n')}\n${pc.cyan('└')}\n`;
    },
  });
  const picked = await withInteractiveTerminal(() => p.prompt() as Promise<unknown>);
  if (isCancel(picked) || typeof picked !== 'string') return null;
  return picked as CredentialChoice;
};

/**
 * The I/O the default prompt performs, as injectable functions — the same seam
 * `config.ts` uses for its own password prompt (`passwordFn`), and for the same
 * reason: the branch logic here is worth testing and clack is not mockable in
 * this suite.
 *
 * `credentialPasswordFn` receives the validate callback rather than a plain
 * string, so a test can call it and assert the rejection messages instead of
 * taking the branch's word for them. `null` means the user cancelled.
 */
export interface DefaultInstallPromptDeps {
  envConfirmFn?: () => Promise<boolean | null>;
  choiceFn?:     () => Promise<CredentialChoice | null>;
  credentialPasswordFn?: (
    message: string,
    validate: (value: string) => string | undefined,
  ) => Promise<string | null>;
  log?: (line: string) => void;
}

/**
 * Build the default prompts. Production calls this with no arguments and gets
 * the real clack widgets; tests pass stubs. Exported for that reason only —
 * `installAction` still takes the whole `InstallPrompts` object as its seam.
 */
export function buildDefaultInstallPrompts(deps: DefaultInstallPromptDeps = {}): InstallPrompts {
  const envConfirmFn = deps.envConfirmFn ?? (async () => {
    const answer = await withInteractiveTerminal(() => confirm({
      message:      'Detected existing API key in environment. Use it?',
      initialValue: true,
    }));
    return isCancel(answer) ? null : answer === true;
  });

  const choiceFn = deps.choiceFn ?? defaultCredentialChoicePrompt;

  const credentialPasswordFn = deps.credentialPasswordFn ?? (async (message, validate) => {
    const input = await withInteractiveTerminal(() => password({ message, validate }));
    return isCancel(input) ? null : String(input);
  });

  const log = deps.log ?? ((line: string) => { console.log(line); });

  return {
    credentialChoicePrompt: choiceFn,

    // ⚠️ A method, not an arrow, so `this` resolves to whichever prompts object
    // the caller passed — which is what makes `credentialChoicePrompt` a real
    // seam rather than a declared one. `installAction` calls this as
    // `promptFn.apiKeyPrompt(...)`, so a caller overriding only the choice gets
    // its override used. Destructuring this off the object would break that.
    async apiKeyPrompt(ctx) {
      // R3: the environment key is offered BEFORE the choice, exactly as before
      // — if a usable key is already in the shell there is nothing to choose.
      if (ctx.hasEnvKey) {
        const useEnv = await envConfirmFn();
        if (useEnv === null) return { kind: 'cancel' };
        if (useEnv === true) return { kind: 'use_env' };
      }

      const choice = await this.credentialChoicePrompt(ctx);
      if (choice === null) return { kind: 'cancel' };

      // Each branch keeps the key prompt's own shape: a masked input and the
      // same validate contract.
      const hasStored = choice === 'openai_key' ? ctx.hasStoredKey : ctx.hasStoredToken;

      // Where the token comes from, said between the chosen option and the
      // field it is about — inside the picker's own frame, so it reads as part
      // of the question rather than as stray output. The key half needs no
      // equivalent: anyone choosing it already has an OpenAI account, and its
      // link is on the option they just picked.
      if (choice === 'nexpath_token') {
        for (const line of buildCredentialTokenHelpLines()) log(line);
      }

      const input = await credentialPasswordFn(
        credentialInputMessage(choice, ctx.keychainName, hasStored),
        (value) => {
          if (hasStored && value === '') return undefined;
          if (choice === 'openai_key') {
            if (!isValidApiKey(value)) return 'Invalid OpenAI API key format (expected sk-...)';
          } else if (!isValidNexpathToken(value)) {
            return 'Invalid Nexpath token format (expected npk_...)';
          }
          return undefined;
        },
      );
      if (input === null) return { kind: 'cancel' };
      if (input === '' && hasStored) return { kind: 'keep_existing' };
      if (input === '') return { kind: 'skip' };

      if (choice === 'nexpath_token') {
        // R8: the resolver's order is not something the install can override, so
        // saying it once here is the difference between a surprising outcome and
        // an expected one.
        if (ctx.hasStoredKey) log(CREDENTIAL_KEY_WINS_NOTICE);
        return { kind: 'nexpath_token', value: input };
      }
      return { kind: 'new_key', value: input };
    },
  };
}

const defaultInstallPrompts: InstallPrompts = buildDefaultInstallPrompts();

export interface InstallSummary {
  apiKey:    { source: 'keychain' | 'file' | 'kept' | 'skipped' | 'nexpath_token' };
  telemetry: { enabled: boolean };
  agents:    { registered: string[]; failed: string[] };
  extras:    { clipboardInstalled: boolean; clipboardTool: string | null };
}

export async function installAction(
  opts: { yes?: boolean; platform?: SupportedPlatform } = {},
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
    // ⚠️ Seams over the two credential-store functions, defaulting to the real
    // ones so production is unchanged. They exist because `--yes` now READS the
    // configured credential and can WRITE one, and every other test in this file
    // reaches the credential step only through a `promptFn` stub that answers
    // 'skip'. Without these, a `--yes` test would touch the developer's own
    // keychain: reading it makes the result depend on whose machine runs the
    // suite, and writing to it is not something a test may ever do.
    keySourceFn = getKeySource,
    storeApiKeyFn = storeApiKey,
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
    keySourceFn?:         typeof getKeySource;
    storeApiKeyFn?:       typeof storeApiKey;
  } = {},
): Promise<InstallSummary | null> {
  const platform = opts.platform ?? DEFAULT_PLATFORM;
  intro('Installing nexpath');
  console.log(`Installing for: ${platform}`);

  // Empty-bucket short-circuit — no API key prompt, no telemetry prompt, no
  // DB open. Honest exit when the target platform has no officially-supported
  // agents in this version yet.
  if (supportedAgentsForPlatform(platform).length === 0) {
    console.log('');
    console.log(`No agents are officially supported on platform "${platform}" in this version yet.`);
    console.log('See the README support roadmap for upcoming agents.');
    outro('Installation finished — no agents registered.');
    return null;
  }

  const store = await openStore(dbPath);

  // Save the install timestamp locally (kept on re-runs). It is transmitted
  // later, only when the user submits feedback.
  setInstalledAtIfMissing(store);

  let apiKeySource:  InstallSummary['apiKey']['source'] = 'skipped';
  // Whether a credential was actually WRITTEN this run. `apiKeySource` cannot answer that:
  // 'kept' and a `--yes` run that found an existing credential both leave it set to something
  // truthy while nothing changed, and ending a live session because the user re-ran install
  // without touching their key would cost them their history for no reason.
  let credentialStored = false;
  let telemetryEnabled = false;

  try {
    // ── Step 1: API key ───────────────────────────────────────────────────────
    if (!opts.yes) {
      const envKey       = process.env.OPENAI_API_KEY ?? '';
      const hasEnvKey    = envKey !== '' && isValidApiKey(envKey);
      const storedSource = await keySourceFn(process.cwd());
      const hasStoredKey = !hasEnvKey && (storedSource === 'keychain' || storedSource === 'file');
      // `getKeySource` reports the token as its own layer, which is neither
      // 'keychain' nor 'file' — so before this a returning token user was
      // prompted as though nothing at all were configured, and never offered
      // the "Enter to keep existing" the key half has always had.
      const hasStoredToken = !hasEnvKey && storedSource === 'nexpath_token';
      const keychainName = getKeychainName(platformForKeychain);

      const result = await promptFn.apiKeyPrompt({ hasEnvKey, hasStoredKey, hasStoredToken, keychainName });

      if (result.kind === 'cancel') {
        clackCancel('Setup aborted — no changes made');
        closeStore(store);
        return null;
      }
      if (result.kind === 'new_key') {
        const stored = await storeApiKeyFn(result.value);
        apiKeySource = stored.source;
        credentialStored = true;
        console.log(`✓ Stored in ${stored.source === 'keychain' ? keychainName : 'fallback file (~/.nexpath/config.json)'}`);
      } else if (result.kind === 'nexpath_token') {
        const stored = await storeNexpathToken(result.value);
        apiKeySource = 'nexpath_token';
        credentialStored = true;
        console.log(`✓ Stored in ${stored.source === 'keychain' ? keychainName : 'fallback file (~/.nexpath/config.json)'}`);
      } else if (result.kind === 'use_env') {
        const stored = await storeApiKeyFn(envKey);
        apiKeySource = stored.source;
        credentialStored = true;
        console.log(`✓ Stored in ${stored.source === 'keychain' ? keychainName : 'fallback file (~/.nexpath/config.json)'}`);
      } else if (result.kind === 'keep_existing') {
        apiKeySource = 'kept';
      } else {
        apiKeySource = 'skipped';
      }
    } else {
      // `--yes` means "accept the defaults without prompting", not "pretend no
      // credential exists". It cannot ASK for one — but it was also refusing to
      // NOTICE one, hard-coding 'skipped' with a usable key sitting in the shell
      // or a credential already in the keychain. A non-interactive install then
      // finished successfully and left the machine with no credential resolved,
      // which surfaces much later as "the popup stopped being helpful" with
      // nothing at install time having said so.
      //
      // Each branch below is the non-interactive equivalent of the answer the
      // interactive flow DEFAULTS to, and nothing else:
      //   · a key in the environment  → the env prompt's own default is Yes, so
      //     it is stored, exactly as answering Yes would;
      //   · a credential already stored → "Enter to keep existing", so it is
      //     kept and NOT overwritten;
      //   · neither → there is no default to take, so 'skipped' as before.
      //
      // ⚠️ Both credential formats are handled identically here. Treating only
      // the OpenAI key as "configured" is the same class of bug as the composer
      // gate: a stored token is a working credential, and an install that
      // reported 'skipped' over one would be reporting the wrong thing.
      const envKey = process.env.OPENAI_API_KEY ?? '';
      const keychainName = getKeychainName(platformForKeychain);

      if (envKey !== '' && isValidApiKey(envKey)) {
        const stored = await storeApiKeyFn(envKey);
        apiKeySource = stored.source;
        credentialStored = true;
        console.log(`✓ Stored in ${stored.source === 'keychain' ? keychainName : 'fallback file (~/.nexpath/config.json)'}`);
      } else {
        const storedSource = await keySourceFn(process.cwd());
        // 'nexpath_token' is reported as itself rather than as 'kept': the
        // summary line renders anything that is not 'nexpath_token' as
        // "OpenAI key (…)", so a kept token described as 'kept' would be
        // printed back to the user as the wrong credential entirely.
        if (storedSource === 'nexpath_token')  apiKeySource = 'nexpath_token';
        else if (storedSource === 'none')      apiKeySource = 'skipped';
        else                                   apiKeySource = 'kept';
      }
    }

    // A credential was written, so the session that ran under the previous one is over —
    // the same reason `config set-api-key` ends it. Only when something was actually stored:
    // a re-run that keeps an existing key changes nothing and must not cost the user their
    // accumulated session.
    //
    // ⛔ Best-effort, like every other side task on this path. `store` is already open here,
    // so this is one statement — but a failure must not abort an install that has already
    // saved the credential.
    if (credentialStored) {
      try {
        expireSessionsForCredentialChange(store);
      } catch {
        /* hygiene only — never fail the install over it */
      }
    }

    // ── Telemetry: OFF by default, NOT prompted at install (NF Plan A) ─────────
    // Telemetry starts OFF and there is no install-time telemetry step. Consent to SEND is the explicit
    // feedback-popup click, not an install toggle (the feedback send stays independent of this flag). Seed
    // default-off on first install; preserve an existing choice on re-run (e.g. a user who enabled it
    // later, or the VS Code two-pass setup — must not silently flip a prior choice). Same interactive and
    // `--yes` behaviour now — no prompt either way.
    if (!isConfigSet(store.db, 'telemetry.enabled')) {
      setConfig(store, 'telemetry.enabled',      'false');
      setConfig(store, 'telemetry_sync_enabled', 'false');
      telemetryEnabled = false;
    } else {
      telemetryEnabled = getConfig(store.db, 'telemetry.enabled') === 'true';
    }
  } finally {
    if (store.dbPath !== ':memory:' || telemetryEnabled !== true) {
      // close happens at end of step 3 path; nothing to do here
    }
  }

  // ── Step 2: Agent detection + registration ────────────────────────────────
  // When the VS Code extension drives setup it targets ONLY the IDE the user is
  // in (NEXPATH_ONLY_AGENT = cursor|windsurf). Additive: with the env unset this
  // is a no-op and the legacy multi-agent behaviour is byte-identical.
  // NOTE: we do NOT filter `agents` itself — the API-key/telemetry/frequency/role
  // prompt gating below keys off `agents.length`, so filtering here could skip
  // those prompts. We only (a) suppress the multi-agent "Detected/Not found"
  // notices and (b) gate the per-adapter install loop further down on onlyAgent.
  const onlyAgent   = process.env.NEXPATH_ONLY_AGENT;
  const agents      = detectAgentsForPlatform(paths, platform);
  const detectedIds = new Set(agents.map((a) => a.id));
  const missing     = supportedAgentsForPlatform(platform).filter((sa) => !detectedIds.has(sa.id));
  if (onlyAgent) {
    // Extension-driven single-IDE setup: the extension runs INSIDE the target IDE,
    // so it's definitely present — show just that one (matches the CLI's "Detected: X")
    // regardless of the file-based detection above.
    const onlyLabel = supportedAgentsForPlatform(platform).find((sa) => sa.id === onlyAgent)?.label ?? onlyAgent;
    console.log(`Detected: ${onlyLabel}`);
  } else if (agents.length > 0) {
    console.log(`Detected: ${agents.map((a) => a.label).join(', ')}`);
  }
  // Skip the "Not found" notice when deliberately targeting a single IDE — the
  // other agents aren't "missing", they're just not the target.
  if (missing.length > 0 && !onlyAgent) {
    console.log(`Not found: ${missing.map((sa) => sa.label).join(', ')}`);
    console.log('nexpath currently supports Claude Code only — support for Cursor, Windsurf, and other agents is coming in future updates.');
  }
  const registered: string[] = [];
  const failed:     string[] = [];
  // Confirmation, Claude Code registration, and the frequency / role prompts run
  // only when a supported agent (Claude Code) is actually present on disk. The
  // registry-driven adapter installs further below run regardless, so Cursor /
  // Windsurf VSCode extensions are still offered on machines without Claude Code.
  if (agents.length > 0 || onlyAgent) {
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
              console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 written to ${agent.configPath}
(CLI fallback)`);
            }
          }
          // Register the advisory pipeline hook (separate from MCP — different file)
          const claudeAdapter = getAdapter('claude-code') as HookAdapter | undefined;
          if (claudeAdapter) {
            await claudeAdapter.install({
              home:         homedir(),
              cwd:          process.cwd(),
              yes:          !!opts.yes,
              dbPath,
              // Pass paths.claudeSettings so tests that inject a custom paths
              // object still control the target file independently of homedir().
              settingsPath: paths.claudeSettings,
            });
            registered.push(agent.label);
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

    // ── Advisory frequency (picker hidden) + role prompt ────────────────────────
    // Owner ruling 2026-08-10: ONLY the advisory-frequency picker is hidden at install (support to be
    // re-added later) — seed its default silently (High / optimum, owner 2026-09-18) when unset. Its interactive
    // block is kept COMMENTED OUT (not removed): un-comment it (and drop the default-seed line) to
    // restore the picker. The freqPromptFn param + defaultFreqPrompt are retained for that. The ROLE
    // picker stays interactive (restored 2026-08-10). Both settings stay changeable via
    // `nexpath config set advisory_frequency|role …`.
    // (Reuse the already-open `store`; a second open on the same dbPath would deadlock the file lock.)
    const currentFreq = readInstallFreq(store.db);
    if (!isConfigSet(store.db, 'advisory_frequency')) {
      setAdvisoryFrequency(store, 'advisory_frequency', currentFreq);
    }
    // HIDDEN picker (owner 2026-08-10) — un-comment to restore the interactive frequency selection:
    // if (!opts.yes) {
    //   const picked = await freqPromptFn(currentFreq);
    //   if (!isCancel(picked) && typeof picked === 'string') {
    //     setAdvisoryFrequency(store, 'advisory_frequency', picked);
    //     console.log(`✓ advisory_frequency = ${picked}`);
    //   }
    // }

    // Role picker stays interactive at install (owner 2026-08-10: only the frequency picker is hidden).
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
  }

  // ── Registry-driven adapter installs (M2+) ────────────────────────────────────
  // VSCodeExtensionAdapters (cursor, windsurf) self-register via
  // src/agents/index.ts side-effect imports. detectAll() asks each registered
  // adapter if it should run on THIS machine; only those whose detect() returns
  // true end up in the list. claude-code is excluded here because it's already
  // handled in the legacy for-loop above (agent.type === 'claude-cli' branch).
  //
  // This block runs regardless of whether Claude Code was detected, so Cursor /
  // Windsurf extension installs are still offered on machines without Claude.
  const adapterCtx: InstallContext = {
    home: homedir(),
    cwd:  process.cwd(),
    yes:  !!opts.yes,
    dbPath,
  };
  const detectedAdapters    = await detectAll(adapterCtx);
  const eligibleCategories  = eligibleCategoriesForPlatform(platform);
  for (const adapter of detectedAdapters) {
    if (adapter.id === 'claude-code') continue;
    // Extension-driven single-IDE setup: install only the target agent.
    if (onlyAgent && adapter.id !== onlyAgent) continue;
    // Platform gate: only run adapter.install() for adapters whose category
    // matches the chosen install platform. Under --for cli, vscode-extension
    // and browser-extension adapters stay silent.
    if (!eligibleCategories.has(adapter.category)) continue;
    try {
      const res = await adapter.install(adapterCtx);
      if (res.status === 'installed' || res.status === 'already-installed') registered.push(adapter.label);
      else if (res.status === 'failed') failed.push(adapter.label);
    } catch (err) {
      console.log(`\u2717 ${adapter.label.padEnd(12)} \u2014 failed: ${(err as Error).message}`);
      failed.push(adapter.label);
    }
  }

  console.log('');
  console.log('Restart your agents to activate nexpath-prompt-store.');

  // Emit the install event now when telemetry is on; when off it stays buffered
  // locally until the user submits feedback.
  await flushIfTelemetryOn(store);

  // Feature 1 v1(a): switch the memory tools on when MemOS or codebase-memory-mcp is installed
  // (both ship as Nexpath dependencies; OpenClaw is a separate global install).
  const feature1Tools = feature1ToolsStatus();
  if (feature1Tools.memos || feature1Tools.codebase) setConfig(store, FEATURE1_TOOLS_CONFIG_KEY, 'on');

  closeStore(store);

  let clipboardResult: ClipboardEnsureResult = { installed: false, toolName: null, alreadyHad: false };
  if (!skipClipboardCheck) {
    clipboardResult = await ensureLinuxClipboard({ autoConfirm: opts.yes });
    // Keystroke tool for the Windsurf in-editor auto-inject (clipboard → focus
    // Cascade → paste). Linux-only; no-op on macOS/Windows. Degrades to clipboard if declined.
    await ensureLinuxInjectTools({ autoConfirm: opts.yes });
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
    `Credential: ${apiKeySource === 'nexpath_token' ? 'Nexpath token' : `OpenAI key (${apiKeySource})`}`,
    // HIDDEN line (owner 2026-09-19) — un-comment to show telemetry state in the summary again.
    // Kept COMMENTED OUT rather than removed, like the advisory-frequency picker above. Nothing about
    // telemetry itself changes: it is still seeded OFF on a fresh install (NF Plan A, see step 1), the
    // `telemetry` field below still carries the state for callers, and `nexpath status` still reports
    // it. Only the install summary stops naming it.
    // `Telemetry:  ${telemetryEnabled ? 'enabled' : 'disabled'}`,
    `Agents:     ${registered.length > 0 ? registered.join(', ') : 'none'}`,
    failed.length > 0 ? `Failed:     ${failed.join(', ')}` : null,
    `Memory:     ${describeFeature1Tools(feature1Tools)}`,
    extrasLine,
  ].filter((l): l is string => l !== null).join('\n');

  // Dev-environment + prompt-capture disclosure, shown just above the Setup
  // Complete summary in interactive installs (skipped under --yes). Facts and
  // prompts are stored locally; only ChatGPT API calls leave the machine.
  if (!opts.yes) {
    note(
      [
        'To time its guidance, nexpath takes a basic read of your',
        "project and your agent's responses — only what it needs, all",
        'on your machine.',
        '',
        'It reads and stores your prompts too — everything stays local',
        'and is processed using the ChatGPT API, and is NEVER',
        'transmitted elsewhere.',
        '',
        "This capture is core to nexpath — without it, nexpath won't work.",
      ].join('\n'),
      'Dev-environment facts - Notes',
    );
  }
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


/**
 * On Linux, ensure the keystroke tool the Windsurf in-editor auto-inject needs
 * (`xdotool` on X11, `wtype` on Wayland) is installed — so the popup selection
 * auto-pastes into Cascade instead of falling back to "copy to clipboard". The
 * same tool also raises the Cursor advisory popup. macOS/Windows use built-in
 * automation (osascript / SendKeys), so this is Linux-only. If skipped/failed,
 * Windsurf advisories degrade gracefully to the clipboard path.
 */
export async function ensureLinuxInjectTools(
  deps: {
    platform?: string;
    spawnFn?: typeof spawnSync;
    execFn?: typeof execSync;
    confirmFn?: ConfirmFn;
    autoConfirm?: boolean;
    waylandDisplay?: string;
  } = {},
): Promise<void> {
  const plat  = deps.platform ?? process.platform;
  const spawn = deps.spawnFn  ?? spawnSync;
  const exec  = deps.execFn   ?? execSync;

  if (plat !== 'linux') return;

  const isWayland = !!(deps.waylandDisplay ?? process.env.WAYLAND_DISPLAY);
  const toolName  = isWayland ? 'wtype' : 'xdotool'; // package name == tool name

  if (spawn('which', [toolName], { stdio: 'pipe' }).status === 0) return; // already present

  const pkgManagers = PKG_MANAGERS.map((p) => ({
    cmd: p.cmd,
    install: p.install.map((arg) => (arg === 'xclip' ? toolName : arg)),
  }));
  const pm = pkgManagers.find((p) => spawn('which', [p.cmd], { stdio: 'pipe' }).status === 0);
  if (!pm) {
    console.log(`⚠ No keystroke tool (${toolName}) found — install it for Windsurf auto-inject.`);
    return;
  }

  console.log('');
  console.log(`Windsurf auto-inject (paste into Cascade) requires ${toolName} (not found on this system).`);

  if (!deps.autoConfirm) {
    const confirmFn = deps.confirmFn ?? (async () => {
      const answer = await confirm({ message: `Install ${toolName} using ${pm.cmd}?` });
      return !isCancel(answer) && answer === true;
    });
    const ok = await confirmFn();
    if (!ok) {
      console.log('⚠ Skipped — Windsurf advisories will fall back to "copy to clipboard".');
      return;
    }
  }

  try {
    exec(pm.install.join(' '), { stdio: 'inherit' });
    if (spawn('which', [toolName], { stdio: 'pipe' }).status === 0) {
      console.log(`✓ ${toolName} installed successfully`);
    } else {
      console.log(`⚠ ${toolName} install command ran but ${toolName} not found — check output above`);
    }
  } catch {
    console.log(`⚠ ${toolName} installation failed — install manually: sudo ${pm.cmd} install ${toolName}`);
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

export type UninstallStoreDeleteConfirmFn = () => Promise<boolean>;

// Owner ruling 2026-08-10: deleting local data on uninstall no longer prompts the user — it is
// automatic (default yes). The injectable seam is kept only so tests can exercise a decline.
const defaultUninstallStoreDeleteConfirm: UninstallStoreDeleteConfirmFn = async () => true;

export async function uninstallAction(
  {
    paths = resolveAgentPaths(),
    execFn,
    apiKeyConfirmFn = defaultUninstallApiKeyConfirm,
    storeDeleteConfirmFn = defaultUninstallStoreDeleteConfirm,
    yes = false,
    projectRoot = process.cwd(),
    dbPath,
  }: {
    paths?:               AgentPaths;
    execFn?:              ExecFn;
    apiKeyConfirmFn?:     UninstallApiKeyConfirmFn;
    storeDeleteConfirmFn?: UninstallStoreDeleteConfirmFn;
    yes?:                 boolean;
    projectRoot?:         string;
    dbPath?:              string;
  } = {},
): Promise<void> {
  // Feature 1 v1(a): stop the background worker (and the tools it holds) first.
  await stopFeature1Worker();

  // Uninstall must clean up registration entries from agents that may have
  // been written by an older nexpath version, so it bypasses the support
  // filter and walks every agent present on disk.
  const agents = detectAgentsForCleanup(paths);

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

  // \u2500\u2500 Registry-driven adapter uninstalls (M2+) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Mirror of the installAction's registry block. Skips claude-code (already
  // handled in the legacy for-loop above) and calls each detected adapter's
  // uninstall() so the user can cleanly back out of every adapter the install
  // touched. Errors are surfaced as a single line per adapter \u2014 they don't
  // halt the rest of the uninstall.
  const adapterCtx: InstallContext = {
    home: homedir(),
    cwd:  process.cwd(),
    yes:  false,
    dbPath: ':memory:',
  };
  const detectedAdapters = await detectAll(adapterCtx);
  for (const adapter of detectedAdapters) {
    if (adapter.id === 'claude-code') continue;
    try {
      await adapter.uninstall(adapterCtx);
    } catch (err) {
      console.log(`\u2717 ${adapter.label.padEnd(12)} \u2014 failed: ${(err as Error).message}`);
    }
  }

  console.log('');
  console.log('MCP registration removed from all agents.');

  // ── Credential cleanup ───────────────────────────────────────────────────
  // Both are removed on the one confirmation. `removeNexpathToken` existed but
  // had no caller here, so a token survived `nexpath uninstall` indefinitely —
  // and `getKeySource` reports only the winning layer, so a machine holding
  // both would answer 'keychain' and the token would never even be considered.
  const currentSource = await getKeySource(projectRoot);
  if (currentSource === 'none') {
    console.log('No stored credential found, nothing to remove.');
  } else {
    const shouldRemove = yes || await apiKeyConfirmFn();
    if (shouldRemove) {
      await removeApiKey();
      await removeNexpathToken();
      console.log(`✓ Credential removed (was in ${currentSource}).`);
    } else {
      console.log('- Credential retained; remove later with `nexpath config remove-api-key` or `remove-token`.');
    }
  }

  // ── Local data cleanup (NF: delete on uninstall) ─────────────────────────
  // Owner ruling 2026-08-10: the local store (prompt history, config, and the content-free
  // feedback/action signals all live there) is deleted AUTOMATICALLY — no user prompt (default yes).
  // A programmatic decline (test seam) keeps the retain + telemetry-off behaviour. Best-effort:
  // a delete failure never crashes uninstall (e.g. a locked file).
  const resolvedDbPath = dbPath ?? DEFAULT_DB_PATH;
  const shouldDeleteData = yes || await storeDeleteConfirmFn();
  console.log('');
  if (shouldDeleteData) {
    try {
      if (existsSync(resolvedDbPath)) unlinkSync(resolvedDbPath);
      console.log('✓ Local data deleted.');
    } catch (err) {
      console.log(`- Could not delete local data (${(err as Error).message}); remove ${resolvedDbPath} manually.`);
    }
  } else {
    // Declined (programmatic only): retain the DB, but ensure telemetry stays off in the config.
    try {
      const store = await openStore(resolvedDbPath);
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
    console.log('Prompt history retained at ~/.nexpath/prompt-store.db');
    console.log('To delete it later: nexpath store delete');
  }
}
