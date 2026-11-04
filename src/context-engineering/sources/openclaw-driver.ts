/**
 * Feature 1 — v1(a) OpenClaw driver: months-old memory, search only (decided 2026-11-02;
 * our own learner stays, so no session-backfill / promote / skills).
 *
 * Phase 0 (v1(a).md §9.5): an OpenClaw memory search takes 10–19 s from its CLI, so it is
 * never run while a prompt waits. A prompt that names code (e.g. `processRetry`) asks OpenClaw
 * in the background; the answer is cached per project and term, and the next prompt about the
 * same code gets it instantly.
 *
 * What OpenClaw remembers (architecture.md Path A, "session ends → OpenClaw: save the session's
 * decisions"): when a session ends, the decisions our map recorded during it are written to one
 * memory file per session and indexed in the background. No raw conversation goes to OpenClaw.
 *
 * OpenClaw runs in its own profile under ~/.nexpath/openclaw (OPENCLAW_STATE_DIR /
 * OPENCLAW_CONFIG_PATH), never touching the user's own OpenClaw, one agent per project.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeNamesIn } from './codebase-memory-driver.js';
import type { SourceCandidate, SourceDriver, SourceQuery } from './source-driver.js';

/** Runs `openclaw <args>`; resolves stdout. Injected in tests. */
export type OpenClawRunner = (args: string[], env: Record<string, string>, timeoutMs: number) => Promise<string>;

/** One finished session's decisions, from our map. */
export interface OpenClawSessionDecisions {
  projectRoot: string;
  sessionId: string;
  /** When the session's first turn finished. */
  startedAt: number;
  decisions: readonly { kind: string; content: string; locked: boolean }[];
}

export interface OpenClawDriverOptions {
  /** ~/.nexpath/openclaw */
  home: string;
  /** Background job queue (the worker's: one job at a time, steps aside for prompts). */
  schedule?: (job: () => Promise<void>) => void;
  run?: OpenClawRunner;
  /** Is OpenClaw installed (default: the one that came with Nexpath, else an `openclaw` on PATH, and a Node it can run on). */
  installed?: () => boolean;
  /**
   * A Node that meets the installed OpenClaw's own requirement, to run it with (default: this
   * process). Required inside Electron, whose process is the app, not a Node to run scripts with.
   */
  nodePath?: string;
  /** Extra environment for OpenClaw only, e.g. its embedding endpoint on the desktop. Never a Nexpath token. */
  extraEnv?: Record<string, string>;
  /** How long a cached answer is used (default 30 min). */
  cacheMs?: number;
  now?: () => number;
}

interface CacheEntry {
  at: number;
  candidates: SourceCandidate[];
}

const MAX_TERMS = 2;
const MAX_RESULTS = 3;
const MIN_SCORE = 0.4;
const MAX_DECISION_CHARS = 300;
/** A project whose memory files changed since the last index (survives a worker restart). */
const NEEDS_INDEX = '.needs-index';
const CLI_TIMEOUT_MS = 90_000;

export class OpenClawDriver implements SourceDriver {
  readonly name = 'openclaw' as const;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Set<string>();
  private readonly agents = new Map<string, Promise<boolean>>();
  private readonly run: OpenClawRunner;
  private readonly schedule: (job: () => Promise<void>) => void;
  private readonly now: () => number;

  constructor(private readonly options: OpenClawDriverOptions) {
    this.run = options.run ?? openClawRunner(options.nodePath);
    this.schedule = options.schedule ?? ((job) => void job().catch(() => {}));
    this.now = options.now ?? Date.now;
  }

  async available(): Promise<boolean> {
    if (this.options.installed) return this.options.installed();
    if (process.versions.electron && !this.options.nodePath) return false;
    // OpenClaw refuses to start on a Node outside its own `engines` range (2026.9.2: Node
    // 22.22.3+); with a separate Node (nodePath, desktop) the install step guarantees it.
    if (!this.options.nodePath && !nodeVersionOkForOpenClaw()) return false;
    return isOpenClawInstalled();
  }

  /**
   * Cached answers only; a miss asks OpenClaw in the background for next time. Only when the gap
   * detector found something missing in the prompt (architecture.md: "OpenClaw (if [6] says yes)").
   */
  async search(query: SourceQuery): Promise<SourceCandidate[]> {
    if (query.hasGaps === false) return [];
    const project = query.projectRoot;
    const terms = codeNamesIn(query.prompt).slice(0, MAX_TERMS);
    const found: SourceCandidate[] = [];
    for (const term of terms) {
      const key = `${project}\u0000${term}`;
      const hit = this.cache.get(key);
      if (hit && this.now() - hit.at < (this.options.cacheMs ?? 30 * 60_000)) {
        found.push(...hit.candidates);
      } else if (!this.pending.has(key)) {
        this.pending.add(key);
        this.schedule(async () => {
          try {
            const candidates = await this.searchNow(project, term);
            this.cache.set(key, { at: this.now(), candidates });
          } finally {
            this.pending.delete(key);
          }
        });
      }
    }
    return found;
  }

  /**
   * Session end: write the session's decisions to their own memory file (written again, not
   * appended, if the same session ends twice) and index in the background.
   */
  async saveSessionDecisions(session: OpenClawSessionDecisions): Promise<boolean> {
    if (session.decisions.length === 0 || !(await this.available())) return false;
    const ws = this.workspace(session.projectRoot);
    mkdirSync(join(ws, 'memory'), { recursive: true, mode: 0o700 });
    const day = new Date(session.startedAt).toISOString().slice(0, 10);
    const sid = createHash('sha256').update(session.sessionId).digest('hex').slice(0, 8);
    const clip = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_DECISION_CHARS);
    const lines = session.decisions.map((d) => `- ${d.locked ? 'locked ' : ''}${d.kind}: ${clip(d.content)}`);
    writeFileSync(
      join(ws, 'memory', `${day}-session-${sid}.md`),
      `# Decisions from the session of ${new Date(session.startedAt).toISOString()}\n\n${lines.join('\n')}\n`,
      { mode: 0o600 }
    );
    writeFileSync(join(ws, NEEDS_INDEX), '', { mode: 0o600 });
    this.schedule(() => this.indexIfNeeded(session.projectRoot).then(() => {}));
    return true;
  }

  /** Index the project's memory files if they changed; drop its cached answers after. */
  async indexIfNeeded(projectRoot: string): Promise<boolean> {
    const marker = join(this.workspace(projectRoot), NEEDS_INDEX);
    if (!existsSync(marker) || !(await this.ensureAgent(projectRoot))) return false;
    try {
      await this.run(['memory', 'index', '--agent', agentId(projectRoot)], this.env(), CLI_TIMEOUT_MS);
    } catch (err) {
      // OpenClaw 2026.9.2 without an embedding key: the keyword index IS built, then the command
      // fails on the missing key. Searching works, so count it as indexed instead of redoing it
      // before every search (2026-11-03, Node 22 test).
      if (!isMissingEmbeddingKeyError(err)) throw err;
    }
    try {
      unlinkSync(marker);
    } catch {
      /* already gone */
    }
    for (const key of this.cache.keys()) if (key.startsWith(`${projectRoot}\u0000`)) this.cache.delete(key);
    return true;
  }

  private async searchNow(projectRoot: string, term: string): Promise<SourceCandidate[]> {
    if (!(await this.ensureAgent(projectRoot))) return [];
    await this.indexIfNeeded(projectRoot).catch(() => false);
    const out = await this.run(
      ['memory', 'search', '--agent', agentId(projectRoot), '--json', '--max-results', String(MAX_RESULTS), term],
      this.env(),
      CLI_TIMEOUT_MS
    );
    return parseSearch(out);
  }

  private ensureAgent(projectRoot: string): Promise<boolean> {
    let ready = this.agents.get(projectRoot);
    if (!ready) {
      const ws = this.workspace(projectRoot);
      mkdirSync(join(ws, 'memory'), { recursive: true, mode: 0o700 });
      ready = this.run(['agents', 'add', agentId(projectRoot), '--non-interactive', '--workspace', ws, '--json'], this.env(), CLI_TIMEOUT_MS)
        .then(() => true)
        .catch((err: Error) => /already exists|exists/i.test(err.message));
      this.agents.set(projectRoot, ready);
    }
    return ready;
  }

  private workspace(projectRoot: string): string {
    return join(this.options.home, 'agents', agentId(projectRoot), 'workspace');
  }

  private env(): Record<string, string> {
    const state = join(this.options.home, 'state');
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      // OpenClaw switches its plugin commands (incl. `memory`) off when it sees VITEST.
      if (v !== undefined && !k.startsWith('VITEST')) env[k] = v;
    }
    return { ...env, ...(this.options.extraEnv ?? {}), OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: join(state, 'openclaw.json') };
  }
}

export function agentId(projectRoot: string): string {
  return `nx-${createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)}`;
}

/** `openclaw memory search --json` → candidates (one per matching line of a memory file). */
export function parseSearch(stdout: string): SourceCandidate[] {
  const start = stdout.indexOf('{');
  if (start < 0) return [];
  let parsed: { results?: { path?: string; startLine?: number; score?: number; snippet?: string; provenance?: { observedAt?: number } }[] };
  try {
    parsed = JSON.parse(stdout.slice(start, stdout.lastIndexOf('}') + 1));
  } catch {
    return [];
  }
  // One candidate per remembered decision (one per line of our session files), so our map can
  // drop a replaced decision and skip one it already holds (a snippet often spans several).
  const out: SourceCandidate[] = [];
  for (const r of parsed.results ?? []) {
    const score = typeof r.score === 'number' ? Math.min(1, r.score) : 0;
    if (score < MIN_SCORE) continue;
    const lines = (r.snippet ?? '').split('\n');
    lines.forEach((raw, i) => {
      const text = raw
        .replace(/^#+\s*|^[-*]\s+|^\s+/, '')
        .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '')
        .replace(/^(locked\s+)?[a-z_]+:\s+/i, (prefix) => (/^(user|agent):/i.test(prefix) ? prefix : ''))
        .trim()
        .slice(0, 300);
      if (!text || /^decisions( from the session of .*)?$/i.test(text)) return;
      out.push({
        source: 'openclaw',
        ref: `${r.path ?? 'memory'}:${(r.startLine ?? 1) + i}`,
        text,
        score,
        ...(r.provenance?.observedAt ? { observedAt: r.provenance.observedAt } : {}),
      });
    });
  }
  return out;
}

/** OpenClaw 2026.9.2 says this when only its keyword index could be built (no embedding key). */
export function isMissingEmbeddingKeyError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /missing-provider-auth|No API key found for provider/i.test(text);
}

/**
 * OpenClaw installed WITH Nexpath (optional dependency `openclaw`, the tested version): its CLI entry
 * in the nearest `node_modules/openclaw` above this file. Found by walking up (OpenClaw's package
 * may not export its package.json). Undefined when the optional dependency was skipped.
 */
export function bundledOpenClawEntry(from: string = fileURLToPath(import.meta.url)): string | undefined {
  for (let dir = dirname(from), i = 0; i < 12; dir = dirname(dir), i++) {
    const pkgFile = join(dir, 'node_modules', 'openclaw', 'package.json');
    if (!existsSync(pkgFile)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { bin?: string | Record<string, string> };
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.openclaw;
      const entry = bin ? join(dirname(pkgFile), bin) : undefined;
      if (entry && existsSync(entry)) return realpathSync(entry);
    } catch {
      /* not usable: keep looking */
    }
    if (dirname(dir) === dir) break;
  }
  return undefined;
}

/**
 * The real entry behind the `openclaw` command, run with this process's Node: the OpenClaw that came
 * with Nexpath first (tested version, never the user's own setup), else an `openclaw` on PATH.
 */
function openClawEntry(): string | undefined {
  const bundled = bundledOpenClawEntry();
  if (bundled) return bundled;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of process.platform === 'win32' ? ['openclaw.cmd', 'openclaw'] : ['openclaw']) {
      const candidate = join(dir, name);
      if (!existsSync(candidate)) continue;
      try {
        const real = realpathSync(candidate);
        if (real.endsWith('.mjs') || real.endsWith('.js')) return real;
      } catch {
        /* keep looking */
      }
    }
  }
  return undefined;
}

/** The OpenClaw version Nexpath installs and is tested with (team lead, 2026-11-03: Node 22). */
export const OPENCLAW_DEFAULT_VERSION = '2026.9.2';
/** OpenClaw 2026.9.2's own Node requirement, used when the installed one cannot be read. */
export const OPENCLAW_DEFAULT_NODE_RANGE = '>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0';

/** The installed OpenClaw's version and Node requirement (its package.json), if it can be read. */
export function installedOpenClaw(): { version?: string; nodeRange?: string } | undefined {
  const entry = openClawEntry();
  if (!entry) return undefined;
  for (let dir = dirname(entry), i = 0; i < 6; dir = dirname(dir), i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string; version?: string; engines?: { node?: string } };
      if (pkg.name === 'openclaw') return { version: pkg.version, nodeRange: pkg.engines?.node };
    } catch {
      /* keep looking upwards */
    }
  }
  return {};
}

/**
 * Does this Node meet the installed OpenClaw's own requirement (`engines.node`)? OpenClaw
 * refuses to start otherwise (2026.10.x needs Node 24.22.1+, 2026.9.2 accepts 22.22.3+).
 */
export function nodeVersionOkForOpenClaw(
  version: string = process.versions.node,
  range: string = installedOpenClaw()?.nodeRange ?? OPENCLAW_DEFAULT_NODE_RANGE
): boolean {
  return satisfiesNodeRange(version, range);
}

/** A small semver range check for `engines.node` ranges: `>=a <b || >=c` (comparators >=, >, <=, <, =). */
export function satisfiesNodeRange(version: string, range: string): boolean {
  const parse = (v: string) => v.replace(/^[v=]/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
    return 0;
  };
  const v = parse(version);
  return range.split('||').some((alternative) => {
    const parts = alternative.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return false;
    return parts.every((part) => {
      const m = /^(>=|<=|>|<|=)?\s*v?(\d+(?:\.\d+){0,2})$/.exec(part);
      if (!m) return false;
      const c = cmp(v, parse(m[2]));
      switch (m[1]) {
        case '>=': return c >= 0;
        case '>': return c > 0;
        case '<=': return c <= 0;
        case '<': return c < 0;
        default: return c === 0;
      }
    });
  });
}

export function isOpenClawInstalled(): boolean {
  return openClawEntry() !== undefined;
}

const openClawRunner = (nodePath?: string): OpenClawRunner => (args, env, timeoutMs) =>
  new Promise((resolve, reject) => {
    const entry = openClawEntry();
    if (!entry) {
      reject(new Error('openclaw is not installed'));
      return;
    }
    execFile(nodePath ?? process.execPath, [entry, ...args], { env, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${err.message}\n${stderr}`.trim()));
      else resolve(stdout);
    });
  });
