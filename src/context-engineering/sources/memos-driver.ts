/**
 * Feature 1 — v1(a) MemOS driver ("MemOS driver, piece 1" in architecture.md Module 4).
 *
 * MemOS (`@memtensor/memos-local-plugin`) runs as a library inside the worker (CLI) or the
 * desktop app: it saves every finished turn and searches past turns by meaning at prompt time.
 * Our map stays the authority (D2): MemOS results are candidates only.
 *
 * Phase 0 (v1(a).md §9.3): boot ~180 ms, search ~10–20 ms, 190–260 MB RAM. Telemetry is on by
 * default in MemOS and is switched off here; all its AI calls go through our host bridge.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostLlmBridge } from './host-llm-bridge.js';
import type { InsertContextMemoryInput } from '../types/context-engineering.js';
import { hashProjectPath, normalizeProjectId } from '../core/project-scope.js';
import type { SourceCandidate, SourceDriver, SourceQuery } from './source-driver.js';
import { words as unicodeWords } from '../core/unicode-text.js';
import { bundledModelsDir } from './meaning-driver.js';

export const MEMOS_AGENT = 'nexpath';

interface MemosNamespace {
  agentKind: string;
  profileId: string;
  workspaceId?: string;
  workspacePath?: string;
}

export interface MemosHit {
  refId: string;
  refKind: string;
  score: number;
  snippet: string;
  tier?: number;
}

/** The part of MemOS's `MemoryCore` the driver uses (agent-contract/memory-core.ts). */
export interface MemosCoreLike {
  shutdown(): Promise<void>;
  onTurnStart(turn: {
    agent: string;
    sessionId: string;
    namespace?: MemosNamespace;
    userText: string;
    ts: number;
  }): Promise<{ query?: { episodeId?: string }; episodeId?: string; hits?: MemosHit[] }>;
  onTurnEnd(result: {
    agent: string;
    sessionId: string;
    namespace?: MemosNamespace;
    episodeId?: string;
    agentText: string;
    toolCalls: unknown[];
    ts: number;
  }): Promise<{ traceId?: string } | unknown>;
  getTrace?(id: string, namespace?: MemosNamespace): Promise<{ summary?: string | null; userText?: string } | null>;
  searchMemory(query: {
    agent: string;
    namespace?: MemosNamespace;
    query: string;
    reason?: 'turn_start' | 'tool_driven';
    deadlineAt?: number;
  }): Promise<{ hits?: MemosHit[] }>;
  listPolicies?(input: { status?: 'candidate' | 'active' | 'archived'; limit?: number; ownerProfileId?: string }): Promise<MemosPolicy[]>;
}

/** MemOS's learned rule (L2 policy), as far as write-back needs it. */
export interface MemosPolicy {
  id: string;
  title: string;
  procedure: string;
  status: 'candidate' | 'active' | 'archived';
  confidence?: number;
}

export interface MemosTurn {
  projectRoot: string;
  sessionId: string;
  prompt: string;
  response: string;
  ts: number;
}

export interface MemosDriverOptions {
  /** MemOS base folder (e.g. ~/.nexpath/memos); each project gets its own folder inside (A2). */
  home: string;
  bridge: HostLlmBridge;
  /** Starts MemOS for one project folder (default: the installed package). Injected in tests. */
  boot?: (home: string, bridge: HostLlmBridge) => Promise<MemosCoreLike>;
  /** Hits below this MemOS relevance are not offered (default 0.4, our ranker's floor). */
  minScore?: number;
  /** Projects kept open at once; the least recently used one is closed (default 2). */
  maxOpenProjects?: number;
  /**
   * Background queue (the worker's). When given, every prompt also runs MemOS's full search —
   * with its AI relevance filter, which needs 1–2 s and so never fits the prompt's 1 s — in the
   * background; its results are kept for the next prompts (2026-11-03 real-key run).
   */
  schedule?: (job: () => Promise<void>) => void;
  now?: () => number;
}

/** A finished turn as MemOS saved it (for the summary read-back). */
export interface MemosCapturedTurn {
  projectRoot: string;
  traceId: string;
  userText: string;
}

const MAX_SNIPPET_CHARS = 300;
/**
 * MemOS gets a slightly earlier deadline than ours: its own AI relevance filter respects it
 * and returns its safe results in time, instead of our timeout dropping MemOS for the prompt.
 */
const MEMOS_DEADLINE_MARGIN_MS = 200;
/** Learned rules are never as strong as a decision the user locked (0.95). */
const MAX_POLICY_CONFIDENCE = 0.85;
/** After MemOS failed to start, report it unavailable for this long, then try again. */
const RETRY_AFTER_MS = 60_000;
/** Background search: time MemOS's AI filter gets, how long results are kept, how many. */
const BACKGROUND_SEARCH_MS = 10_000;
const RECALL_KEEP_MS = 30 * 60_000;
const RECALL_MAX = 20;
/** A reply shorter than this ("OK", "Noted.") carries no decision of its own. */
const MIN_REPLY_WORDS = 4;

interface RecalledHit {
  candidate: SourceCandidate;
  at: number;
}

interface OpenProject {
  core?: MemosCoreLike;
  booting?: Promise<MemosCoreLike | undefined>;
  lastUsed: number;
  inUse: number;
}

/**
 * MemOS, one data folder per project (architecture.md A2: "MemOS keeps its own data (SQLite) in
 * its own folder, one per project"): `<home>/<project hash>/`. A project's MemOS starts on its
 * first prompt (that prompt gets no MemOS lines; our map is always there) and stays open; at most
 * `maxOpenProjects` are open, the local embedding model is shared between them.
 */
export class MemosDriver implements SourceDriver {
  readonly name = 'memos' as const;
  private readonly projects = new Map<string, OpenProject>();
  /** Per project: results of background searches (AI-filtered), newest last. */
  private readonly recalled = new Map<string, RecalledHit[]>();
  private failedAt = 0;
  private closed = false;

  constructor(private readonly options: MemosDriverOptions) {}

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  /** False only for a while after MemOS failed to start; a project's MemOS starts on demand. */
  async available(): Promise<boolean> {
    return !(this.failedAt > 0 && this.now() - this.failedAt < RETRY_AFTER_MS);
  }

  /** The folder a project's MemOS data lives in. */
  projectHome(projectRoot: string): string {
    return join(this.options.home, hashProjectPath(normalizeProjectId(projectRoot)));
  }

  async search(query: SourceQuery, deadlineAt: number): Promise<SourceCandidate[]> {
    if (!query.prompt.trim()) return [];
    const root = normalizeProjectId(query.projectRoot);
    const entry = this.projects.get(root);
    if (!entry?.core) {
      if (await this.available()) void this.start(root); // ready for the next prompt
      return [];
    }
    // With a background queue (the worker), MemOS answers from earlier background results only:
    // with a key its AI filter never finishes inside the prompt's 1 s, so a live search would add
    // ~0.8 s to every prompt and return nothing (2026-11-03 real-key run).
    const live: SourceCandidate[] = this.options.schedule ? [] : toCandidates(
      await this.use(root, entry, (core) =>
        core.searchMemory({ agent: MEMOS_AGENT, namespace: projectNamespace(root), query: query.prompt, reason: 'tool_driven', deadlineAt: deadlineAt - MEMOS_DEADLINE_MARGIN_MS })
      ),
      query.prompt,
      this.options.minScore ?? 0.4
    );
    if (this.options.schedule) {
      const prompt = query.prompt;
      this.options.schedule(() => this.searchInBackground(root, prompt));
    }
    // Earlier background results (AI-filtered for an earlier prompt). Our ranker still decides
    // whether they fit this prompt (shared-word gate), and echoes of this prompt are dropped.
    const seen = new Set(live.map((c) => c.ref));
    const fresh = (this.recalled.get(root) ?? []).filter((r) => this.now() - r.at < RECALL_KEEP_MS);
    this.recalled.set(root, fresh);
    const earlier = fresh
      .map((r) => r.candidate)
      .filter((c) => !seen.has(c.ref) && !isEcho(c.text, query.prompt))
      .map((c) => ({ ...c, score: Math.min(c.score, 0.9) }));
    return [...live, ...earlier.reverse()];
  }

  private async searchInBackground(root: string, prompt: string): Promise<void> {
    const entry = this.projects.get(root);
    if (!entry?.core) return;
    const result = await this.use(root, entry, (core) =>
      core.searchMemory({ agent: MEMOS_AGENT, namespace: projectNamespace(root), query: prompt, reason: 'tool_driven', deadlineAt: this.now() + BACKGROUND_SEARCH_MS })
    ).catch(() => undefined);
    const found = toCandidates(result, prompt, this.options.minScore ?? 0.4);
    if (found.length === 0) return;
    const pool = (this.recalled.get(root) ?? []).filter((r) => !found.some((c) => c.ref === r.candidate.ref));
    for (const candidate of found) pool.push({ candidate, at: this.now() });
    this.recalled.set(root, pool.slice(-RECALL_MAX));
  }

  /** Save one finished turn (background job in the worker; after the reply on the desktop). */
  async capture(turn: MemosTurn): Promise<MemosCapturedTurn | undefined> {
    const root = normalizeProjectId(turn.projectRoot);
    const core = await this.start(root);
    const entry = this.projects.get(root);
    if (!core || !entry) return undefined;
    const namespace = projectNamespace(root);
    return this.use(root, entry, async (c) => {
      const started = await c.onTurnStart({ agent: MEMOS_AGENT, sessionId: turn.sessionId, namespace, userText: turn.prompt, ts: turn.ts });
      const ended = await c.onTurnEnd({
        agent: MEMOS_AGENT,
        sessionId: turn.sessionId,
        namespace,
        episodeId: started.query?.episodeId ?? started.episodeId,
        agentText: turn.response,
        toolCalls: [],
        ts: turn.ts + 1,
      });
      const traceId = (ended as { traceId?: string } | undefined)?.traceId;
      // A turn whose reply says nothing ("OK") is a question or a request, not a decision:
      // its summary must not become a fact (2026-11-03: "switch the sender to noreply" was saved).
      const replyWords = turn.response.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      return traceId && replyWords >= MIN_REPLY_WORDS ? { projectRoot: root, traceId, userText: turn.prompt } : undefined;
    });
  }

  /**
   * MemOS's AI summary of a captured turn (read a little later: MemOS writes it in the
   * background). Undefined when MemOS only has its fallback (a copy of the user's words).
   */
  async turnSummary(turn: MemosCapturedTurn): Promise<string | undefined> {
    const entry = this.projects.get(turn.projectRoot);
    if (!entry?.core?.getTrace) return undefined;
    const trace = await this.use(turn.projectRoot, entry, (c) => c.getTrace!(turn.traceId, projectNamespace(turn.projectRoot)));
    const summary = trace?.summary?.replace(/\s+/g, ' ').trim();
    if (!summary) return undefined;
    const fallback = turn.userText.replace(/\s+/g, ' ').trim();
    if (summary === fallback || (fallback.length > 139 && summary.startsWith(fallback.slice(0, 120)))) return undefined;
    return summary;
  }

  /** MemOS's active learned rules for this project, as rows for our map (D12 write-back). */
  async learnedRules(projectRoot: string): Promise<InsertContextMemoryInput[]> {
    const root = normalizeProjectId(projectRoot);
    const core = await this.start(root);
    const entry = this.projects.get(root);
    if (!core?.listPolicies || !entry) return [];
    const policies = await this.use(root, entry, (c) =>
      c.listPolicies!({ status: 'active', limit: 20, ownerProfileId: projectNamespace(root).profileId })
    );
    return policiesToMapRows(root, policies ?? []);
  }

  async close(): Promise<void> {
    this.closed = true;
    const cores = [...this.projects.values()].map((p) => p.core).filter((c): c is MemosCoreLike => c !== undefined);
    this.projects.clear();
    await Promise.all(cores.map((c) => c.shutdown().catch(() => {})));
  }

  private start(root: string): Promise<MemosCoreLike | undefined> {
    if (this.closed) return Promise.resolve(undefined);
    const existing = this.projects.get(root);
    if (existing?.core) {
      existing.lastUsed = this.now();
      return Promise.resolve(existing.core);
    }
    if (existing?.booting) return existing.booting;
    const entry: OpenProject = existing ?? { lastUsed: this.now(), inUse: 0 };
    this.projects.set(root, entry);
    const boot = this.options.boot ?? bootInstalledMemos;
    entry.booting = boot(this.projectHome(root), this.options.bridge).then(
      async (core) => {
        entry.booting = undefined;
        if (this.closed || this.projects.get(root) !== entry) {
          await core.shutdown().catch(() => {});
          return undefined;
        }
        entry.core = core;
        entry.lastUsed = this.now();
        this.failedAt = 0;
        await this.closeLeastRecent(root);
        return core;
      },
      () => {
        this.projects.delete(root);
        this.failedAt = this.now();
        return undefined;
      }
    );
    return entry.booting;
  }

  private async use<T>(root: string, entry: OpenProject, fn: (core: MemosCoreLike) => Promise<T>): Promise<T | undefined> {
    if (!entry.core) return undefined;
    entry.inUse++;
    entry.lastUsed = this.now();
    try {
      return await fn(entry.core);
    } finally {
      entry.inUse--;
    }
  }

  private async closeLeastRecent(keep: string): Promise<void> {
    const max = Math.max(1, this.options.maxOpenProjects ?? 2);
    for (;;) {
      const open = [...this.projects.entries()].filter(([, p]) => p.core);
      if (open.length <= max) return;
      const idle = open.filter(([root, p]) => root !== keep && p.inUse === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      if (idle.length === 0) return;
      const [root, p] = idle[0];
      this.projects.delete(root);
      await p.core!.shutdown().catch(() => {});
    }
  }
}

/**
 * One MemOS profile per project, so memories never cross projects. (Checked against the real
 * package: `profileId` isolates search results; `workspaceId` alone does not.)
 */
export function projectNamespace(projectRoot: string): MemosNamespace {
  const id = createHash('sha256').update(projectRoot).digest('hex').slice(0, 16);
  return { agentKind: MEMOS_AGENT, profileId: `p-${id}`, workspaceId: id, workspacePath: projectRoot };
}

/**
 * MemOS learned rules → our map: ordinary unlocked conventions tagged with their source. Our map
 * still decides (D2): they can be replaced like any other rule and never outrank locked ones.
 */
export function policiesToMapRows(projectRoot: string, policies: readonly MemosPolicy[]): InsertContextMemoryInput[] {
  const project = normalizeProjectId(projectRoot);
  const rows: InsertContextMemoryInput[] = [];
  for (const p of policies) {
    if (p.status !== 'active') continue;
    const content = `${p.title ?? ''}: ${p.procedure ?? ''}`.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (content.length < 8) continue;
    rows.push({
      projectRoot: project,
      kind: 'convention',
      key: `memos-policy-${p.id}`,
      content,
      locked: false,
      confidence: Math.max(0.4, Math.min(MAX_POLICY_CONFIDENCE, p.confidence ?? 0.6)),
      evidence: JSON.stringify({ source: 'memos', ref: p.id }),
    });
  }
  return rows;
}

function toCandidates(result: { hits?: MemosHit[] } | undefined, prompt: string, minScore: number): SourceCandidate[] {
  const out: SourceCandidate[] = [];
  for (const hit of result?.hits ?? []) {
    const text = cleanSnippet(hit.snippet);
    if (!text || !(hit.score >= minScore)) continue;
    // The user asking the same thing again is not memory (2026-11-03 run: "hello" → "hello").
    if (isEcho(text, prompt)) continue;
    out.push({ source: 'memos', ref: `${hit.refKind}:${hit.refId}`, text, score: Math.min(1, hit.score) });
  }
  return out;
}

/**
 * MemOS's snippet → one readable line: "[user] <prompt> [assistant] <reply> → call `memos_get(…)`
 * for the full turn". Keeps the user's words, adds the reply when it says more than "OK", drops
 * MemOS's own follow-up hint (meant for an agent that has MemOS tools; ours does not).
 */
export function cleanSnippet(snippet: string | undefined): string {
  let body = (snippet ?? '').replace(/→\s*call\s+`memos_get\([^`]*\)`[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  body = body.replace(/^\[(user|tool)\]\s*/i, '');
  const [userPart, ...rest] = body.split(/\s*\[(?:assistant|agent)\]\s*/i);
  const reply = rest.join(' ').trim();
  const words = reply.split(/\s+/).filter(Boolean);
  const text = words.length > 3 ? `${userPart.trim()} — reply: ${reply}` : userPart.trim();
  return text.length > MAX_SNIPPET_CHARS ? `${text.slice(0, MAX_SNIPPET_CHARS - 1)}…` : text;
}

/** Same words as the prompt (≥ 80% overlap): the user's earlier copy of this prompt. */
export function isEcho(text: string, prompt: string): boolean {
  // Words of every script (multilingual #7); for ASCII the same as the old [a-z0-9_]{2,} match.
  const words = (t: string) => unicodeWords(t, 2, { underscore: true });
  const a = words(text);
  const b = words(prompt);
  if (b.size === 0) return false;
  let shared = 0;
  for (const w of b) if (a.has(w)) shared++;
  return shared / b.size >= 0.8 && shared / Math.max(a.size, 1) >= 0.8;
}

/**
 * MemOS settings we own: telemetry off, AI through our bridge only (no fallback to any other
 * provider), local CPU embeddings (English model for v1(a), D11), quiet logs.
 */
export const MEMOS_CONFIG_YAML = `telemetry:
  enabled: false
llm:
  provider: host
  fallbackToHost: false
embedding:
  provider: local
logging:
  level: warn
`;

/**
 * Our MemOS settings for this install: MEMOS_CONFIG_YAML, plus the model inside the package when it is
 * bundled (`embedding.local.modelPath`), so MemOS loads it with no download.
 */
export function memosConfigYaml(modelsDir: string | undefined = bundledModelsDir()): string {
  if (!modelsDir) return MEMOS_CONFIG_YAML;
  return MEMOS_CONFIG_YAML.replace('  provider: local\n', `  provider: local\n  local:\n    modelPath: ${JSON.stringify(modelsDir)}\n`);
}

/** MemOS's logger is one per process: set it up with the first project only. */
let memosLoggingReady = false;

/** Starts the installed MemOS package as our "nexpath" adapter, for one project folder. */
export async function bootInstalledMemos(home: string, bridge: HostLlmBridge): Promise<MemosCoreLike> {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const configFile = join(home, 'config.yaml');
  // The file is ours (written only by Nexpath). Kept current, so a bundled model's path follows the
  // installed package (e.g. after an update moved it).
  const wanted = memosConfigYaml();
  if (!existsSync(configFile)) writeFileSync(configFile, wanted, { mode: 0o600 });
  else if (readFileSync(configFile, 'utf8') !== wanted && readFileSync(configFile, 'utf8').startsWith('telemetry:\n  enabled: false\nllm:\n  provider: host')) {
    writeFileSync(configFile, wanted, { mode: 0o600 });
  }

  // The package has no "exports" map; its entry points live under dist/.
  const pipeline = (await import('@memtensor/memos-local-plugin/dist/core/pipeline/index.js' as string)) as {
    bootstrapMemoryCoreFull: (options: Record<string, unknown>) => Promise<{ core: MemosCoreLike & { init(): Promise<void> } }>;
  };
  const config = (await import('@memtensor/memos-local-plugin/dist/core/config/index.js' as string)) as {
    resolveHome: (agent: string, defaultHome: string) => unknown;
  };
  const boot = await pipeline.bootstrapMemoryCoreFull({
    agent: MEMOS_AGENT,
    namespace: { agentKind: MEMOS_AGENT, profileId: 'default' },
    home: config.resolveHome(MEMOS_AGENT, home),
    telemetry: null,
    hostLlmBridge: bridge,
    initLogging: !memosLoggingReady,
  });
  memosLoggingReady = true;
  await boot.core.init();
  return boot.core;
}
