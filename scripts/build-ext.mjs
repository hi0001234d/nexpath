/**
 * Build script for the browser extension (Chrome MV3 + Firefox MV3).
 *
 * Outputs:
 *   dist/ext-chrome/  — Chrome unpacked extension
 *   dist/ext-firefox/ — Firefox unpacked extension
 *
 * Run:  node scripts/build-ext.mjs
 * Watch: node scripts/build-ext.mjs --watch
 */

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src', 'ext-browser');

const watch = process.argv.includes('--watch');
const targets = ['chrome', 'firefox'];

/**
 * Redirect the CLI's node:fs file-logger (src/logger.ts) to the browser-safe,
 * console-backed stub. The engine modules (OptionGenerator + runtime-substitution
 * deps) import the global `logger` directly; without this remap, bundling them
 * into the service worker pulls node:fs/path/os and the build fails. Filename is
 * unique in src (adapters use log-console/log-persistent), and we still verify the
 * resolved path is exactly src/logger.ts so nothing else is caught.
 */
const ROOT_LOGGER    = path.join(ROOT, 'src', 'logger.ts');
const BROWSER_LOGGER = path.join(SRC, 'adapters', 'logger-browser.ts');
const browserLoggerPlugin = {
  name: 'nexpath-browser-logger',
  setup(build) {
    build.onResolve({ filter: /logger(\.js|\.ts)?$/ }, (args) => {
      if (args.kind === 'entry-point' || !args.importer) return null;
      const abs = path
        .resolve(path.dirname(args.importer), args.path)
        .replace(/\.js$/, '.ts');
      return abs === ROOT_LOGGER ? { path: BROWSER_LOGGER } : null;
    });
  },
};

/** Common esbuild options shared by every bundle entry point. */
const commonOpts = {
  bundle:    true,
  target:    'es2022',
  // No source maps in the store build. Inline source maps pushed the service
  // worker to ~5.3 MB and Firefox AMO's linter hard-fails any file it can't
  // parse ("File is too large to parse"). Store builds must not ship maps
  // anyway. Opt in for local debugging with NEXPATH_EXT_SOURCEMAP=1.
  sourcemap: process.env.NEXPATH_EXT_SOURCEMAP === '1' ? 'inline' : false,
  minify:    false,
};

/**
 * MV3 content scripts (declared in manifest.json's content_scripts[].js) are always
 * loaded as CLASSIC scripts by the browser — there is no manifest mechanism to load
 * them as ES modules. A bundle containing a top-level `export` statement (which esbuild
 * emits whenever the entry file exports anything, e.g. for testability) is a syntax
 * error in that context and silently kills the entire script before it runs. These
 * entries must be built with format: 'iife', never 'esm'.
 */
const contentScriptEntries = [
  { in: path.join(SRC, 'content', 'main-world-injector.ts'), out: 'content/main-world-injector' },
  { in: path.join(SRC, 'content', 'inject.ts'),               out: 'content/inject' },
  { in: path.join(SRC, 'content', 'agents', 'replit.ts'),     out: 'content/agents/replit' },
  { in: path.join(SRC, 'content', 'agents', 'bolt.ts'),       out: 'content/agents/bolt' },
  { in: path.join(SRC, 'content', 'agents', 'lovable.ts'),    out: 'content/agents/lovable' },
];

/**
 * Entries loaded as real ES modules — the MV3 service worker (manifest declares
 * background.type: 'module'), main-world.ts (injected via a dynamic
 * `<script type="module">` tag), and options.ts (its HTML uses
 * `<script type="module">` directly). format: 'esm' is correct and required here.
 */
const moduleEntries = [
  { in: path.join(SRC, 'background', 'service-worker.ts'), out: 'service-worker' },
  { in: path.join(SRC, 'inject',     'main-world.ts'),     out: 'inject/main-world' },
  { in: path.join(SRC, 'options',    'options.ts'),        out: 'options/options' },
];

/**
 * Static files to copy verbatim into the dist folder.
 * [src relative to SRC, dst relative to dist/<target>/]
 */
const staticFiles = [
  ['options/options.html',     'options/options.html'],
  ['options/options.css',      'options/options.css'],
  ['icons/icon16.png',         'icons/icon16.png'],
  ['icons/icon48.png',         'icons/icon48.png'],
  ['icons/icon128.png',        'icons/icon128.png'],
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function writeJson(dst, obj) {
  ensureDir(path.dirname(dst));
  fs.writeFileSync(dst, JSON.stringify(obj, null, 2) + '\n');
}

async function buildTarget(target) {
  const outDir = path.join(ROOT, 'dist', `ext-${target}`);
  ensureDir(outDir);

  // ── Copy manifest ──────────────────────────────────────────────────────────
  const manifestSrc = path.join(SRC, `manifest.${target}.json`);
  writeJson(path.join(outDir, 'manifest.json'), JSON.parse(fs.readFileSync(manifestSrc, 'utf8')));

  // ── Copy static files ──────────────────────────────────────────────────────
  for (const [src, dst] of staticFiles) {
    copyFile(path.join(SRC, src), path.join(outDir, dst));
  }

  // ── Bundle TypeScript entry points (two format groups — see comments above) ──
  const define = { 'globalThis.__NEXPATH_TARGET__': JSON.stringify(target) };

  /** @type {esbuild.BuildOptions} */
  const contentScriptOpts = { ...commonOpts, format: 'iife', entryPoints: contentScriptEntries, outdir: outDir, define, plugins: [browserLoggerPlugin] };
  /** @type {esbuild.BuildOptions} */
  const moduleOpts = { ...commonOpts, format: 'esm', entryPoints: moduleEntries, outdir: outDir, define, plugins: [browserLoggerPlugin] };

  if (watch) {
    const [csCtx, modCtx] = await Promise.all([
      esbuild.context(contentScriptOpts),
      esbuild.context(moduleOpts),
    ]);
    await Promise.all([csCtx.watch(), modCtx.watch()]);
    console.log(`[nexpath-ext] Watching ${target}…`);
  } else {
    const [csResult, modResult] = await Promise.all([
      esbuild.build(contentScriptOpts),
      esbuild.build(moduleOpts),
    ]);
    const errors = [...csResult.errors, ...modResult.errors];
    if (errors.length) {
      console.error(`[nexpath-ext] ${target} build errors:`, errors);
      process.exitCode = 1;
    } else {
      console.log(`[nexpath-ext] ${target} → dist/ext-${target}/`);
    }
  }
}

// Build all targets in parallel
await Promise.all(targets.map(buildTarget));

if (!watch) {
  console.log('[nexpath-ext] Done.');
}
