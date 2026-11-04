/**
 * Feature 1 — the local memory model at install / uninstall (V2 #7 multilingual memory, dev plan
 * Phase 6: "must run offline on CPU").
 *
 * The package normally carries the model itself (dist/models, scripts/fetch-memory-model.mjs); then
 * there is nothing to fetch. Otherwise (a source checkout, an offline build):
 * MemOS and the meaning source use `Xenova/all-MiniLM-L6-v2` (24 MB) from `~/.cache/memos/models`. It
 * used to download on first use, so the first prompts after install ran without memory. `nexpath
 * install` now fetches it once; after that Feature 1 works with the network off. No network, or a
 * download slower than 60 s, is skipped quietly: the model then downloads on first use, as before.
 *
 * The download runs in a child process, so a stalled connection is killed at the time limit and can
 * never keep `nexpath install` from exiting.
 */

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MEANING_MODEL, bundledModelsDir } from './meaning-driver.js';

export const MEMORY_MODEL_MB = 24;
export const MEMORY_MODEL_TIMEOUT_MS = 60_000;

/** `~/.cache/memos/models` — MemOS's model cache (the meaning source uses the same folder). */
export function memoryModelCacheDir(home: string = homedir()): string {
  return join(home, '.cache', 'memos', 'models');
}

/** Our model's own folder inside that cache; nothing else in the cache is ours. */
export function memoryModelDir(home: string = homedir()): string {
  return join(memoryModelCacheDir(home), ...MEANING_MODEL.split('/'));
}

export type MemoryModelFetch = 'ready' | 'skipped';

/** Downloads (or finds in the cache) the model and embeds one word; resolves when done. */
export type MemoryModelLoader = (cacheDir: string) => Promise<void>;

/**
 * Loads the model in a child Node process (`loadMemosEmbedder` from the built meaning-driver.js),
 * killed when `signal` aborts.
 */
export function childProcessLoader(signal: AbortSignal): MemoryModelLoader {
  return (cacheDir) =>
    new Promise<void>((resolve, reject) => {
      const driverUrl = pathToFileURL(fileURLToPath(new URL('./meaning-driver.js', import.meta.url))).href;
      const script = `const m = await import(${JSON.stringify(driverUrl)}); const e = await m.loadMemosEmbedder(${JSON.stringify(cacheDir)}); await e('ok');`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore', windowsHide: true });
      const kill = () => child.kill();
      signal.addEventListener('abort', kill, { once: true });
      child.on('error', reject);
      child.on('exit', (code) => {
        signal.removeEventListener('abort', kill);
        if (code === 0) resolve();
        else reject(new Error(`model download exited with ${code}`));
      });
    });
}

export interface PrefetchMemoryModelOptions {
  home?: string;
  /** Test seam; default: `childProcessLoader`. */
  load?: MemoryModelLoader;
  timeoutMs?: number;
  log?: (line: string) => void;
  /** Test seam; default: `bundledModelsDir` (the model inside the package). */
  bundled?: () => string | undefined;
}

/**
 * Fetches the memory model into MemOS's cache. Never throws: on no network or after `timeoutMs` it
 * prints that the model downloads on first use and resolves `'skipped'`.
 */
export async function prefetchMemoryModel(options: PrefetchMemoryModelOptions = {}): Promise<MemoryModelFetch> {
  const log = options.log ?? ((line: string) => console.log(line));
  // Bundled in the package (scripts/fetch-memory-model.mjs): nothing to download.
  if ((options.bundled ?? bundledModelsDir)()) {
    log('✓ Memory model included with Nexpath (works offline).');
    return 'ready';
  }
  const timeoutMs = options.timeoutMs ?? MEMORY_MODEL_TIMEOUT_MS;
  const ac = new AbortController();
  const load = options.load ?? childProcessLoader(ac.signal);
  log(`Downloading the memory model (${MEMORY_MODEL_MB} MB)…`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    await Promise.race([load(memoryModelCacheDir(options.home)), timedOut]);
    log('✓ Memory model ready (works offline).');
    return 'ready';
  } catch {
    log('- Memory model not downloaded now; it downloads on first use.');
    return 'skipped';
  } finally {
    if (timer) clearTimeout(timer);
    ac.abort();
  }
}

/** Removes only our model's folder from MemOS's cache. Returns true when something was removed. */
export function removeMemoryModel(home: string = homedir()): boolean {
  const dir = memoryModelDir(home);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

/** `~/.nexpath/memos` — the saved MemOS memories, one folder per project (CLI worker + old adapter). */
export function memosDataDir(home: string = homedir()): string {
  return join(home, '.nexpath', 'memos');
}

/**
 * The memory tools' own data under `~/.nexpath` (all of it Nexpath's; the user's own OpenClaw is never
 * here, ours runs in its own profile via OPENCLAW_STATE_DIR):
 * MemOS memories, OpenClaw agents / workspaces / state, codebase-memory-mcp index (CBM_CACHE_DIR).
 */
export function memoryToolDataDirs(home: string = homedir()): { label: string; dir: string }[] {
  return [
    { label: 'Saved memories (MemOS)', dir: memosDataDir(home) },
    { label: 'OpenClaw agents and session notes', dir: join(home, '.nexpath', 'openclaw') },
    { label: 'Code index (codebase-memory-mcp)', dir: join(home, '.nexpath', 'codebase-memory') },
  ];
}

/** Removes the saved MemOS memories (uninstall). Returns true when something was removed. */
export function removeMemosData(home: string = homedir()): boolean {
  return removeDir(memosDataDir(home));
}

/** Removes every memory tool's data folder (uninstall). Returns the labels of the ones removed. */
export function removeMemoryToolData(home: string = homedir()): string[] {
  return memoryToolDataDirs(home).filter(({ dir }) => removeDir(dir)).map(({ label }) => label);
}

function removeDir(dir: string): boolean {
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}
