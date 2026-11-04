/**
 * Feature 1 — v1(a) meaning source (2026-11-03): matches the prompt to OUR map's facts by
 * meaning, with MemOS's own local embedding model (Xenova/all-MiniLM-L6-v2, q8, CPU — same
 * model, options and cache folder MemOS uses, so nothing extra is downloaded).
 *
 * Why: our ranker needs a shared word; "why is the tax zero for some carts" shares none with
 * "TypeError in calculateTax for empty carts". Measured on the natural-work facts: real meaning
 * matches score 0.60, unrelated prompts ("hello", "capital of France") at most 0.13.
 *
 * It never adds new text: each result is one of our map's rows (`mapRowId`), which the ranker may
 * then use for a line left over after V1's own choice. The hook sends the map's facts with the
 * query (no database read here); embeddings are cached, so only new facts are embedded (~3 ms).
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceCandidate, SourceDriver, SourceQuery } from './source-driver.js';
import { scriptShare } from '../core/unicode-text.js';

export const MEANING_MODEL = 'Xenova/all-MiniLM-L6-v2';
/** Cosine at or above this counts as "about the same thing" (unrelated prompts stay ≤ 0.13). */
export const MEANING_MIN_SCORE = 0.5;
/**
 * The floor for a prompt written mostly in Devanagari (Hindi script). The model reads Devanagari
 * poorly, so unrelated Hindi texts score up to 0.75. At 0.6 the same Hindi memories are found as at
 * 0.5 (12/20) and 13/20 unrelated prompts are rejected instead of 4/20 (multilingual #7, measured on
 * AI-written sample sentences). Every other script keeps MEANING_MIN_SCORE.
 */
export const MEANING_MIN_SCORE_DEVANAGARI = 0.6;
/** A prompt is "mostly Devanagari" at this share of its letters. */
const DEVANAGARI_PROMPT_SHARE = 0.5;
const MAX_RESULTS = 5;
const MAX_CACHED = 5000;
/** Stop embedding new facts this long before the deadline; the rest are embedded in the background. */
const DEADLINE_MARGIN_MS = 50;

/** text → unit-length vector. */
export type Embedder = (text: string) => Promise<Float32Array>;

export interface MeaningDriverOptions {
  /** Loads the embedder (default: MemOS's local model through @huggingface/transformers). */
  load?: () => Promise<Embedder>;
  /** Default ~/.cache/memos/models — where MemOS keeps the model. */
  cacheDir?: string;
  minScore?: number;
  /** Floor for mostly-Devanagari prompts (default MEANING_MIN_SCORE_DEVANAGARI; never below minScore). */
  minScoreDevanagari?: number;
  now?: () => number;
}

export class MeaningDriver implements SourceDriver {
  readonly name = 'meaning' as const;
  private embed: Embedder | undefined;
  private loading: Promise<void> | undefined;
  private readonly vectors = new Map<string, Float32Array>();
  private embeddingInBackground = false;

  constructor(private readonly options: MeaningDriverOptions = {}) {}

  /** False until the model is loaded; the first call starts loading it. */
  async available(): Promise<boolean> {
    if (this.embed) return true;
    if (!this.loading) {
      this.loading = (this.options.load ?? (() => loadMemosEmbedder(this.options.cacheDir)))()
        .then((embed) => {
          this.embed = embed;
        })
        .catch(() => {
          this.loading = undefined; // try again on a later prompt
        });
    }
    return false;
  }

  async search(query: SourceQuery, deadlineAt: number): Promise<SourceCandidate[]> {
    const embed = this.embed;
    const facts = query.mapFacts ?? [];
    if (!embed || facts.length === 0 || !query.prompt.trim()) return [];
    const now = this.options.now ?? Date.now;
    const promptVector = await embed(query.prompt);

    const missing: { content: string }[] = [];
    for (const fact of facts) {
      const key = keyOf(fact.content);
      if (this.vectors.has(key)) continue;
      if (now() >= deadlineAt - DEADLINE_MARGIN_MS) {
        missing.push(fact);
        continue;
      }
      this.remember(key, await embed(fact.content));
    }
    if (missing.length > 0) void this.embedInBackground(embed, missing);

    const minScore = meaningFloor(query.prompt, this.options);
    const scored: SourceCandidate[] = [];
    for (const fact of facts) {
      const vector = this.vectors.get(keyOf(fact.content));
      if (!vector) continue;
      const score = cosine(promptVector, vector);
      if (score >= minScore) scored.push({ source: 'meaning', ref: `map:${fact.id}`, text: fact.content, score: Math.min(1, score), mapRowId: fact.id });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
  }

  private remember(key: string, vector: Float32Array): void {
    if (this.vectors.size >= MAX_CACHED) this.vectors.delete(this.vectors.keys().next().value as string);
    this.vectors.set(key, vector);
  }

  private async embedInBackground(embed: Embedder, facts: readonly { content: string }[]): Promise<void> {
    if (this.embeddingInBackground) return;
    this.embeddingInBackground = true;
    try {
      for (const fact of facts) {
        const key = keyOf(fact.content);
        if (!this.vectors.has(key)) this.remember(key, await embed(fact.content));
      }
    } catch {
      /* next prompt tries again */
    } finally {
      this.embeddingInBackground = false;
    }
  }
}

/** The cosine floor for this prompt: higher when the prompt is mostly Devanagari. */
export function meaningFloor(prompt: string, options: Pick<MeaningDriverOptions, 'minScore' | 'minScoreDevanagari'> = {}): number {
  const base = options.minScore ?? MEANING_MIN_SCORE;
  if (scriptShare(prompt, 'Devanagari') < DEVANAGARI_PROMPT_SHARE) return base;
  return Math.max(base, options.minScoreDevanagari ?? MEANING_MIN_SCORE_DEVANAGARI);
}

function keyOf(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both unit length
}

/** True when MemOS's embedding library is installed next to Nexpath. */
export function isMeaningModelInstalled(): boolean {
  try {
    createRequire(import.meta.url).resolve('@huggingface/transformers');
    return true;
  } catch {
    return false;
  }
}

/**
 * `dist/models`: the model folder inside the package (put there at build time by
 * scripts/fetch-memory-model.mjs), so no download is needed. Undefined when the model is not bundled
 * (source checkout without a build, or an offline build) — then the cache / a download is used.
 */
export function bundledModelsDir(): string | undefined {
  const dir = fileURLToPath(new URL('../../models/', import.meta.url));
  return existsSync(join(dir, ...MEANING_MODEL.split('/'), 'onnx', 'model_quantized.onnx')) ? dir : undefined;
}

/** MemOS's local model, loaded the way MemOS loads it (core/embedding/providers/local.js). */
export async function loadMemosEmbedder(cacheDir?: string): Promise<Embedder> {
  const entry = createRequire(import.meta.url).resolve('@huggingface/transformers');
  const hf = (await import(entry)) as {
    env: { cacheDir?: string; allowRemoteModels?: boolean; localModelPath?: string };
    pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<(text: string, o: Record<string, unknown>) => Promise<{ data: Float32Array }>>;
  };
  hf.env.cacheDir = cacheDir ?? join(homedir(), '.cache', 'memos', 'models');
  // The model inside the package comes first (no download, offline from the first prompt).
  const bundled = bundledModelsDir();
  if (bundled) hf.env.localModelPath = bundled;
  hf.env.allowRemoteModels = true; // same as MemOS: download once if the cache is empty
  const extract = await hf.pipeline('feature-extraction', MEANING_MODEL, { dtype: 'q8', device: 'cpu' });
  return async (text) => Float32Array.from((await extract(text, { pooling: 'mean', normalize: true })).data);
}
