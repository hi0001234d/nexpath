import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { confirm, isCancel } from '@clack/prompts';

export const MCP_SERVER_NAME = 'nexpath-prompt-store';

// ── Config entry builders (pure — no I/O) ─────────────────────────────────────

/** Standard entry used by Claude Code, Cursor, and Windsurf. */
export function buildStandardEntry(isWin = process.platform === 'win32') {
  return isWin
    ? { command: 'cmd', args: ['/c', 'npx', '-y', 'nexpath-serve'] }
    : { command: 'npx', args: ['-y', 'nexpath-serve'] };
}

/** Cline / Roo Code entry — adds disabled flag and alwaysAllow to avoid per-prompt dialogs. */
export function buildClineEntry(isWin = process.platform === 'win32') {
  return {
    ...buildStandardEntry(isWin),
    disabled: false,
    alwaysAllow: ['capture_prompt'],
  };
}

/** KiloCode entry — same as Cline but requires explicit type field. */
export function buildKiloEntry(isWin = process.platform === 'win32') {
  return {
    type: 'stdio' as const,
    ...buildStandardEntry(isWin),
    disabled: false,
    alwaysAllow: ['capture_prompt'],
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
 * Build the shell command string written into the UserPromptSubmit hook entry.
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

/**
 * Build the UserPromptSubmit hook entry object.
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
  };
}

/**
 * Write the nexpath UserPromptSubmit hook into ~/.claude/settings.json.
 *
 * Uses a read-filter-append pattern so existing UserPromptSubmit hooks written
 * by other tools are preserved.  Any prior nexpath hook group (identified by
 * `_nexpath_hook: true`) is removed before appending the fresh entry, making
 * this operation idempotent on reinstall.
 */
export function writeHookEntry(filePath: string, home: string, platform = process.platform): void {
  const data     = readJsonSafe(filePath);
  const hooks    = (data.hooks as Record<string, unknown> | undefined) ?? {};
  const existing = (hooks.UserPromptSubmit as Array<Record<string, unknown>> | undefined) ?? [];
  const filtered = existing.filter((g) => !g._nexpath_hook);
  const entry    = buildHookEntry(home, platform);
  hooks.UserPromptSubmit = [...filtered, ...(entry.UserPromptSubmit as unknown[])];
  data.hooks = hooks;
  writeJson(filePath, data);
}

/**
 * Remove the nexpath UserPromptSubmit hook from ~/.claude/settings.json.
 *
 * Identifies nexpath-written hook groups by the `_nexpath_hook: true` field.
 * Returns false if the file does not exist or no nexpath hook group was found.
 */
export function removeHookEntry(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const data     = readJsonSafe(filePath);
  const hooks    = data.hooks as Record<string, unknown> | undefined;
  if (!hooks) return false;
  const groups   = hooks.UserPromptSubmit as Array<Record<string, unknown>> | undefined;
  if (!groups) return false;
  const filtered = groups.filter((g) => !g._nexpath_hook);
  if (filtered.length === groups.length) return false;
  if (filtered.length === 0) delete hooks.UserPromptSubmit;
  else hooks.UserPromptSubmit = filtered;
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

export async function installAction(
  opts: { yes?: boolean } = {},
  {
    isWin = process.platform === 'win32',
    paths = resolveAgentPaths(),
    execFn,
    confirmFn = defaultConfirm,
  }: {
    isWin?: boolean;
    paths?: AgentPaths;
    execFn?: ExecFn;
    confirmFn?: ConfirmFn;
  } = {},
): Promise<void> {
  const agents = detectAgents(paths);

  if (agents.length === 0) {
    console.log('No supported agents detected. Run nexpath install --help for details.');
    return;
  }

  const detectedNames = agents.map((a) => a.label).join(', ');
  console.log(`Detected: ${detectedNames}`);

  if (!opts.yes) {
    const ok = await confirmFn();
    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  }

  for (const agent of agents) {
    try {
      if (agent.type === 'claude-cli') {
        const ok = claudeCliInstall(execFn);
        if (ok) {
          console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 registered via claude mcp add`);
        } else {
          // Fallback: write ~/.claude.json directly
          writeMcpEntry(agent.configPath, buildStandardEntry(isWin));
          console.log(`\u2713 ${agent.label.padEnd(12)} \u2014 written to ${agent.configPath} (CLI fallback)`);
        }
        // Register the advisory pipeline hook (separate from MCP — different file)
        try {
          writeHookEntry(paths.claudeSettings, homedir(), isWin ? 'win32' : process.platform);
          console.log(`\u2713 ${'Claude Code'.padEnd(12)} \u2014 advisory hook written to ${paths.claudeSettings}`);
        } catch (err) {
          console.log(`\u26a0 ${'Claude Code'.padEnd(12)} \u2014 hook write failed: ${(err as Error).message}`);
        }
      } else if (agent.type === 'cline') {
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
    } catch (err) {
      console.log(`\u2717 ${agent.label.padEnd(12)} \u2014 failed: ${(err as Error).message}`);
    }
  }

  console.log('');
  console.log('Restart your agents to activate nexpath-prompt-store.');
  console.log('Note: advisory pipeline (nexpath auto) auto-wired for Claude Code only.');
  console.log('Run: nexpath status  to verify connections.');
}

// ── uninstallAction ────────────────────────────────────────────────────────────

export async function uninstallAction(
  {
    paths = resolveAgentPaths(),
    execFn,
  }: {
    paths?: AgentPaths;
    execFn?: ExecFn;
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
  console.log('Prompt history retained at ~/.nexpath/prompt-store.db');
  console.log('To delete it: nexpath store delete');
}
