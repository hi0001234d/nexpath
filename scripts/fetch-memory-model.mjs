#!/usr/bin/env node
/**
 * Puts Feature 1's memory model (Xenova/all-MiniLM-L6-v2, q8, 23 MB) inside the package, at
 * dist/models/Xenova/all-MiniLM-L6-v2, so MemOS and the meaning source load it with no download and
 * work offline from the first prompt — for the CLI and for the desktop app that uses this package as a
 * library. Runs after `npm run build` (postbuild); never committed to git (dist/ is ignored).
 *
 *   node scripts/fetch-memory-model.mjs            fetch if missing; a failure only warns (offline build)
 *   node scripts/fetch-memory-model.mjs --require  fail when the model cannot be put in place (publishing)
 *
 * Source: the model already in MemOS's cache (~/.cache/memos/models) when it is complete, otherwise
 * Hugging Face. Every file is checked against a fixed SHA-256, so a changed or broken file is never
 * shipped. Model licence: Apache-2.0 (sentence-transformers/all-MiniLM-L6-v2).
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const TARGET = join(ROOT, 'dist', 'models', ...MODEL.split('/'));
const CACHE = join(homedir(), '.cache', 'memos', 'models', ...MODEL.split('/'));
const BASE_URL = `https://huggingface.co/${MODEL}/resolve/main`;
const REQUIRE = process.argv.includes('--require');

/** The files transformers.js loads for this model with dtype q8, and their SHA-256 (checked 2026-11-04). */
const FILES = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fileOk = (path, hash) => existsSync(path) && sha256(readFileSync(path)) === hash;

async function main() {
  if (Object.entries(FILES).every(([f, h]) => fileOk(join(TARGET, f), h))) {
    console.log(`memory model: already in ${TARGET}`);
    return;
  }
  for (const [file, hash] of Object.entries(FILES)) {
    const dest = join(TARGET, file);
    if (fileOk(dest, hash)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    const cached = join(CACHE, file);
    if (fileOk(cached, hash)) {
      copyFileSync(cached, dest);
      continue;
    }
    const res = await fetch(`${BASE_URL}/${file}`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== hash) throw new Error(`${file}: downloaded file does not match its SHA-256`);
    writeFileSync(`${dest}.part`, buf);
    renameSync(`${dest}.part`, dest);
  }
  console.log(`memory model: ready in ${TARGET}`);
}

main().catch((err) => {
  rmSync(TARGET, { recursive: true, force: true }); // never ship half a model
  const msg = `memory model not bundled (${err.message}); it downloads on first use instead`;
  if (REQUIRE) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.warn(`⚠ ${msg}`);
});
