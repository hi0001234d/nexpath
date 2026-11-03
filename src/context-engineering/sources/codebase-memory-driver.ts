/**
 * Feature 1 — v1(a) codebase-memory-mcp driver (Phase 2).
 *
 * Answers "what is this code and who uses it" for the code names in the prompt:
 * `search_graph` finds the definition, `trace_path` its direct callers.
 *
 * Phase 0 measurements (v1(a).md §9.4): the CLI costs 5–6.5 s per call, but one MCP stdio
 * session answers in ~10 ms after a one-time ~6 s connect. So the driver holds one session
 * (in the CLI worker, or inside the desktop app) and never makes a prompt wait for the
 * connect: until it is connected, `available()` says no and V1 covers the prompt (D7).
 *
 * Only code names from the prompt are sent (never the user's words), the tool's UI port is
 * switched off, and its storage lives in a cache dir we choose (CBM_CACHE_DIR).
 */

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractIdentities } from '../ingestion/fact-extractor.js';
import type { ContextIdentity } from '../types/context-engineering.js';
import type { SourceCandidate, SourceDriver, SourceQuery } from './source-driver.js';

/** The slice of an MCP client the driver needs: a tool call that returns structured content. */
export interface CodebaseMcpClient {
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}

export interface CodebaseMemoryDriverOptions {
  /** Opens the MCP session (real: createStdioCodebaseClient). */
  connect: () => Promise<CodebaseMcpClient>;
  /** Most code names looked up per prompt. */
  maxSymbols?: number;
  /** Most callers listed per code name. */
  maxCallers?: number;
}

interface JsonGroup {
  qn_prefix?: string;
  file?: string;
  rows?: unknown[][];
}

const DEFAULT_MAX_SYMBOLS = 3;
const DEFAULT_MAX_CALLERS = 3;
/** An exact definition match for a code name the user typed. */
const DEFINITION_SCORE = 0.75;

export class CodebaseMemoryDriver implements SourceDriver {
  readonly name = 'codebase' as const;
  private client: CodebaseMcpClient | undefined;
  private connecting: Promise<void> | undefined;
  private readonly projectByRoot = new Map<string, string | null>();
  private readonly indexRequested = new Set<string>();

  constructor(private readonly options: CodebaseMemoryDriverOptions) {}

  /** Never waits for the connect: the first call starts it, later calls see the result. */
  async available(): Promise<boolean> {
    if (this.client) return true;
    if (!this.connecting) {
      this.connecting = this.options
        .connect()
        .then((client) => {
          this.client = client;
        })
        .catch(() => {
          this.connecting = undefined; // retry on a later prompt
        });
    }
    return false;
  }

  async search(query: SourceQuery, deadlineAt: number, signal: AbortSignal): Promise<SourceCandidate[]> {
    const client = this.client;
    if (!client) return [];

    const names = codeNamesIn(query.prompt).slice(0, this.options.maxSymbols ?? DEFAULT_MAX_SYMBOLS);
    if (names.length === 0) return [];

    const root = query.context?.workspacePath || query.projectRoot;
    const project = await this.resolveProject(client, root, signal);
    if (!project) {
      this.requestIndex(client, root);
      return [];
    }

    const candidates: SourceCandidate[] = [];
    for (const name of names) {
      if (signal.aborted || Date.now() >= deadlineAt) break;
      const found = await this.describe(client, project, name, signal);
      if (found) candidates.push(found);
    }
    return candidates;
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.connecting = undefined;
    await client?.close().catch(() => {});
  }

  /** Longest indexed project root that contains the workspace (cached per workspace). */
  private async resolveProject(client: CodebaseMcpClient, root: string, signal: AbortSignal): Promise<string | null> {
    if (this.projectByRoot.has(root)) return this.projectByRoot.get(root) ?? null;
    const listed = (await client.callTool('list_projects', { format: 'json' }, signal)) as {
      projects?: { name?: string; root_path?: string }[];
    };
    let best: { name: string; length: number } | undefined;
    for (const p of listed?.projects ?? []) {
      if (!p.name || !p.root_path) continue;
      const contains = root === p.root_path || root.startsWith(p.root_path.endsWith('/') ? p.root_path : `${p.root_path}/`);
      if (contains && (!best || p.root_path.length > best.length)) best = { name: p.name, length: p.root_path.length };
    }
    const name = best?.name ?? null;
    if (name) this.projectByRoot.set(root, name); // not cached when missing: indexing may finish later
    return name;
  }

  /** Not indexed yet: ask once, in the background; this prompt gets no code context. */
  private requestIndex(client: CodebaseMcpClient, root: string): void {
    if (this.indexRequested.has(root)) return;
    this.indexRequested.add(root);
    client.callTool('index_repository', { repo_path: root, async: true }).catch(() => {
      this.indexRequested.delete(root);
    });
  }

  private async describe(
    client: CodebaseMcpClient,
    project: string,
    name: string,
    signal: AbortSignal
  ): Promise<SourceCandidate | undefined> {
    const found = (await client.callTool(
      'search_graph',
      { project, name_pattern: `^${escapeRegex(name)}$`, limit: 3, format: 'json' },
      signal
    )) as { cols?: string[]; groups?: JsonGroup[] };
    const definition = firstRow(found);
    if (!definition) return undefined;

    const callers: string[] = [];
    const isCallable = /function|method/i.test(definition.label);
    if (isCallable) {
      const traced = (await client.callTool(
        'trace_path',
        { project, function_name: name, direction: 'inbound', depth: 1, limit: this.options.maxCallers ?? DEFAULT_MAX_CALLERS, format: 'json' },
        signal
      )) as { callers?: { cols?: string[]; groups?: JsonGroup[] } };
      for (const group of traced?.callers?.groups ?? []) {
        const module = moduleOf(group.qn_prefix);
        for (const r of group.rows ?? []) {
          const caller = String(r[0] ?? '');
          if (caller) callers.push(module ? `${caller} (${module})` : caller);
        }
      }
    }

    const where = definition.file ? ` in ${definition.file}${definition.lines ? `:${definition.lines}` : ''}` : '';
    const kind = definition.label ? definition.label.toLowerCase() : 'symbol';
    const used = callers.length > 0 ? ` It is called by ${callers.slice(0, this.options.maxCallers ?? DEFAULT_MAX_CALLERS).join(', ')}.` : '';
    const identities: ContextIdentity[] = [{ symbol: name, ...(definition.file ? { file: definition.file } : {}) }];
    return {
      source: 'codebase',
      ref: `${project}:${definition.file ?? ''}:${name}`,
      text: `${name} is a ${kind} defined${where}.${used}`,
      score: DEFINITION_SCORE,
      identities,
    };
  }
}

/** Code names worth looking up: function calls, camelCase / PascalCase symbols, backticked names. */
export function codeNamesIn(prompt: string): string[] {
  const names: string[] = [];
  for (const identity of extractIdentities(prompt)) {
    if (identity.symbol && !names.includes(identity.symbol)) names.push(identity.symbol);
  }
  return names;
}

function firstRow(found: { cols?: string[]; groups?: JsonGroup[] } | undefined):
  | { name: string; label: string; lines: string; file?: string }
  | undefined {
  const cols = found?.cols ?? [];
  const at = (name: string) => cols.indexOf(name);
  for (const group of found?.groups ?? []) {
    const r = group.rows?.[0];
    if (!r) continue;
    return {
      name: String(r[at('name')] ?? ''),
      label: String(r[at('label')] ?? ''),
      lines: String(r[at('lines')] ?? ''),
      file: group.file,
    };
  }
  return undefined;
}

/** "proj.delivery.prompt-enhancer" → "delivery/prompt-enhancer" (drops the project name). */
function moduleOf(qnPrefix: string | undefined): string {
  if (!qnPrefix) return '';
  const parts = qnPrefix.split('.');
  return parts.slice(1).join('/');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Real MCP session ─────────────────────────────────────────────────────────

export interface StdioCodebaseClientOptions {
  /** Storage for indexes and the tool's own config (CBM_CACHE_DIR). */
  cacheDir: string;
  /** Node executable to run it with (default: this process; inside Electron, the app runs as Node). */
  nodePath?: string;
  /** Override the codebase-memory-mcp entry (default: the installed package's bin.js). */
  binPath?: string;
}

/**
 * Inside Electron, `process.execPath` is the app itself: without ELECTRON_RUN_AS_NODE it would
 * start a second copy of the app instead of running the script as Node.
 */
export function nodeRuntimeEnv(nodePath?: string, versions: NodeJS.ProcessVersions = process.versions): Record<string, string> {
  return !nodePath && versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {};
}

/** Path of the installed codebase-memory-mcp entry point, or undefined if it is not installed. */
export function resolveCodebaseMemoryBin(): string | undefined {
  try {
    return createRequire(import.meta.url).resolve('codebase-memory-mcp/bin.js');
  } catch {
    return undefined;
  }
}

/** One MCP stdio session to codebase-memory-mcp, with its UI port switched off. */
export async function createStdioCodebaseClient(options: StdioCodebaseClientOptions): Promise<CodebaseMcpClient> {
  const bin = options.binPath ?? resolveCodebaseMemoryBin();
  if (!bin || !existsSync(bin)) throw new Error('codebase-memory-mcp is not installed');

  const runtime = options.nodePath ?? process.execPath;
  const env = { ...process.env, ...nodeRuntimeEnv(options.nodePath), CBM_CACHE_DIR: options.cacheDir } as Record<string, string>;
  ensureUiDisabled(runtime, bin, options.cacheDir, env);

  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({ command: runtime, args: [bin], env, stderr: 'ignore' });
  const client = new Client({ name: 'nexpath-feature1', version: '1' });
  await client.connect(transport);

  return {
    async callTool(name, args, signal) {
      const result = (await client.callTool({ name, arguments: args }, undefined, signal ? { signal } : undefined)) as {
        structuredContent?: unknown;
        content?: { type: string; text?: string }[];
        isError?: boolean;
      };
      if (result.isError) throw new Error(`codebase-memory-mcp ${name} failed`);
      if (result.structuredContent !== undefined) return result.structuredContent;
      const text = result.content?.find((c) => c.type === 'text')?.text;
      return text ? JSON.parse(text) : undefined;
    },
    async close() {
      await client.close();
      // The tool keeps its own coordination daemon alive after the session ends; stop the
      // one for our cache dir so nothing lingers once the worker (or the app) is done.
      spawnSync(runtime, [bin, 'daemon', 'stop'], { env, stdio: 'ignore', timeout: 30_000 });
    },
  };
}

/** The tool's graph UI listens on 127.0.0.1:9749 unless switched off (persisted per cache dir). */
function ensureUiDisabled(runtime: string, bin: string, cacheDir: string, env: Record<string, string>): void {
  const marker = join(cacheDir, '.nexpath-ui-off');
  if (existsSync(marker)) return;
  mkdirSync(cacheDir, { recursive: true });
  spawnSync(runtime, [bin, '--ui=false'], { env, stdio: 'ignore', timeout: 30_000 });
  writeFileSync(marker, new Date().toISOString());
}
