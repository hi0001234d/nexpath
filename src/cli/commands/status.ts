import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { getPromptStats } from '../../store/prompts.js';
import { getAllConfig, DEFAULT_CONFIG } from '../../store/config.js';
import {
  detectAgents,
  resolveAgentPaths,
  MCP_SERVER_NAME,
  type DetectedAgent,
} from './install.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentStatus {
  label:      string;
  configPath: string;
  registered: boolean;
}

export interface HookStatus {
  settingsPath: string;
  registered:   boolean;
}

export interface StoreStatus {
  exists:        boolean;
  dbPath:        string;
  totalPrompts:  number;
  dbSizeBytes:   number;
  perProject:    Array<{ projectRoot: string; count: number }>;
}

export interface StatusResult {
  agents:  AgentStatus[];
  hook:    HookStatus;
  store:   StoreStatus;
  config:  Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJsonSafe(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Check if nexpath-prompt-store is registered in a standard mcpServers config.
 * Used for Claude Code (~/.claude.json), Cursor, Windsurf, Cline, Roo Code, KiloCode.
 */
export function isMcpRegistered(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  const data    = readJsonSafe(configPath);
  const servers = data.mcpServers as Record<string, unknown> | undefined;
  return servers !== undefined && MCP_SERVER_NAME in servers;
}

/**
 * Check if nexpath-prompt-store is registered in OpenCode's "mcp" key.
 */
export function isOpenCodeRegistered(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  const data = readJsonSafe(configPath);
  const mcp  = data.mcp as Record<string, unknown> | undefined;
  return mcp !== undefined && MCP_SERVER_NAME in mcp;
}

/**
 * Check if the nexpath advisory hook is registered in ~/.claude/settings.json.
 * Identified by the _nexpath_hook: true marker.
 */
export function isHookRegistered(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false;
  const data   = readJsonSafe(settingsPath);
  const hooks  = data.hooks as Record<string, unknown> | undefined;
  if (!hooks) return false;
  const groups = hooks.UserPromptSubmit as Array<Record<string, unknown>> | undefined;
  if (!groups) return false;
  return groups.some((g) => g._nexpath_hook === true);
}

/** Format bytes to human-readable string (e.g. 2.3 MB, 512 KB). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)     return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function agentRegistered(agent: DetectedAgent): boolean {
  if (agent.type === 'opencode') return isOpenCodeRegistered(agent.configPath);
  return isMcpRegistered(agent.configPath);
}

// ── Core logic ─────────────────────────────────────────────────────────────────

export interface StatusInput {
  dbPath:      string;
  home?:       string;
  agents?:     DetectedAgent[];  // injectable for tests
  settingsPath?: string;         // injectable for tests
}

export async function runStatus(input: StatusInput): Promise<StatusResult> {
  const home         = input.home         ?? homedir();
  const agents       = input.agents       ?? detectAgents(resolveAgentPaths(home));
  const settingsPath = input.settingsPath ?? join(home, '.claude', 'settings.json');

  // ── Agent MCP registration ─────────────────────────────────────────────────
  const agentStatuses: AgentStatus[] = agents.map((agent) => ({
    label:      agent.label,
    configPath: agent.configPath,
    registered: agentRegistered(agent),
  }));

  // ── Advisory hook registration ─────────────────────────────────────────────
  const hook: HookStatus = {
    settingsPath,
    registered: isHookRegistered(settingsPath),
  };

  // ── Prompt store stats + config ───────────────────────────────────────────
  // Open the DB once; read both stats and config in the same session.
  let store: StoreStatus;
  let config: Record<string, string>;

  if (input.dbPath === ':memory:' || existsSync(input.dbPath)) {
    const db = await openStore(input.dbPath);
    try {
      const stats = getPromptStats(db);
      store = {
        exists:       true,
        dbPath:       input.dbPath,
        totalPrompts: stats.totalPrompts,
        dbSizeBytes:  stats.dbSizeBytes,
        perProject:   stats.perProject.map((p) => ({
          projectRoot: p.projectRoot,
          count:       p.count,
        })),
      };
      config = getAllConfig(db.db);
    } finally {
      closeStore(db);
    }
  } else {
    store = {
      exists:       false,
      dbPath:       input.dbPath,
      totalPrompts: 0,
      dbSizeBytes:  0,
      perProject:   [],
    };
    config = { ...DEFAULT_CONFIG };
  }

  return { agents: agentStatuses, hook, store, config };
}

// ── Render ────────────────────────────────────────────────────────────────────

const TICK  = '\u2713';
const CROSS = '\u2717';
const DASH  = '-';

function line(char: string, label: string, detail: string): string {
  return `  ${char} ${label.padEnd(14)} ${detail}`;
}

export function renderStatus(result: StatusResult): string {
  const lines: string[] = [];

  // ── MCP connections ──────────────────────────────────────────────────────
  lines.push('MCP connections');
  for (const a of result.agents) {
    const sym    = a.registered ? TICK : CROSS;
    const detail = a.registered
      ? `registered  (${a.configPath})`
      : `not registered`;
    lines.push(line(sym, a.label, detail));
  }

  // Advisory hook line (Claude Code only)
  const sym    = result.hook.registered ? TICK : DASH;
  const detail = result.hook.registered
    ? `advisory hook registered  (${result.hook.settingsPath})`
    : `advisory hook not registered  (run: nexpath install)`;
  lines.push(line(sym, 'Claude Code', detail));

  lines.push('');

  // ── Prompt store ──────────────────────────────────────────────────────────
  if (result.store.exists) {
    lines.push(`Prompt store  (${result.store.dbPath})`);
    lines.push(`  Total prompts : ${result.store.totalPrompts.toLocaleString()}`);
    lines.push(`  DB size       : ${formatBytes(result.store.dbSizeBytes)}`);
    lines.push(`  Projects      : ${result.store.perProject.length}`);
    for (const p of result.store.perProject) {
      lines.push(`    ${p.projectRoot}  —  ${p.count.toLocaleString()} prompts`);
    }
  } else {
    lines.push(`Prompt store  (${result.store.dbPath})`);
    lines.push(`  Not initialised — run: nexpath install && nexpath init`);
  }

  lines.push('');

  // ── Config ────────────────────────────────────────────────────────────────
  lines.push('Config');
  for (const [key, value] of Object.entries(result.config).sort()) {
    lines.push(`  ${key.padEnd(36)} : ${value}`);
  }

  return lines.join('\n') + '\n';
}

// ── CLI entry point ────────────────────────────────────────────────────────────

export function registerStatusCommand(program: import('commander').Command): void {
  program
    .command('status')
    .description('Verify MCP connections across detected agents, prompt store stats, and config summary')
    .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
    .action(async (opts: { db: string }) => {
      const result = await runStatus({ dbPath: opts.db });
      process.stdout.write(renderStatus(result));
    });
}
