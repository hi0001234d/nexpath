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
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src', 'ext-browser');

/**
 * Build-identity stamp (design amendment A10): every bundle self-reports the
 * exact commit + branch it was built from, logged as one of the first service
 * worker activation lines. Ends the "which code is actually running" class of
 * live-debugging round-trip — a stale unpacked reload is immediately visible.
 * Falls back to 'unknown' outside a git checkout (e.g. AMO source-archive
 * rebuilds), where reproducibility is verified by byte-diff instead.
 */
function readBuildId() {
  try {
    const hash   = execSync('git rev-parse --short HEAD',        { cwd: ROOT }).toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD',   { cwd: ROOT }).toString().trim();
    return `${hash}@${branch}`;
  } catch {
    return 'unknown';
  }
}
const BUILD_ID = readBuildId();

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

/**
 * First-party heavy-chain stubs for the prompt-enhancement engine's import
 * graph (same remap technique as the logger plugin above — match by RESOLVED
 * absolute path so nothing else is caught):
 *  - config/ApiKeyResolver.ts → drags dotenv + cross-keychain + native keyring;
 *    the facade only calls its pure `isValidApiKey` regex. Stub keeps the regex
 *    (drift-pinned by a differential test).
 *  - store/db.ts → the sql.js/WASM CLI store; reached via store/config.ts,
 *    which the engine imports for the real `DEFAULT_CONFIG` DATA (deliberately
 *    kept real). Stub throws loudly on any actual store call.
 * Engine files themselves are never modified (owner boundary).
 */
const FIRST_PARTY_STUBS = new Map([
  [path.join(ROOT, 'src', 'config', 'ApiKeyResolver.ts'), path.join(SRC, 'shims', 'api-key-resolver.ts')],
  [path.join(ROOT, 'src', 'store', 'db.ts'),              path.join(SRC, 'shims', 'store-db.ts')],
]);
const firstPartyStubPlugin = {
  name: 'nexpath-first-party-stubs',
  setup(build) {
    build.onResolve({ filter: /(ApiKeyResolver|db)(\.js|\.ts)?$/ }, (args) => {
      if (args.kind === 'entry-point' || !args.importer) return null;
      const abs = path
        .resolve(path.dirname(args.importer), args.path)
        .replace(/\.js$/, '.ts');
      const stub = FIRST_PARTY_STUBS.get(abs);
      return stub ? { path: stub } : null;
    });
  },
};

/**
 * Browser shims for the three node builtins the prompt-enhancement engine's
 * import graph reaches (source-reality → node:fs/node:path; guidance-fatigue /
 * feedback-sink → node:crypto). The shims answer with absent-filesystem
 * semantics (fs/path) or a vector-tested sha256 (crypto) so the ENGINE'S OWN
 * defensive branches run — engine files are never modified. Any other node:*
 * import stays unresolved on purpose: a new engine dependency must fail the
 * build loudly so the shim set is extended deliberately.
 */
const NODE_SHIMS = {
  'node:fs':     path.join(SRC, 'shims', 'node-fs.ts'),
  'node:path':   path.join(SRC, 'shims', 'node-path.ts'),
  'node:os':     path.join(SRC, 'shims', 'node-os.ts'),
  'node:crypto': path.join(SRC, 'shims', 'node-crypto.ts'),
  // Imported by the engine's CLI popup module for its default TTY interaction —
  // statically unreachable in the browser (the SW always injects its own
  // interaction); the shims exist so the import resolves and any actual call
  // fails loudly.
  'node:tty':      path.join(SRC, 'shims', 'node-tty.ts'),
  'node:readline': path.join(SRC, 'shims', 'node-readline.ts'),
  // The real Node SDK is heavy and refuses browser-like environments; the stub
  // keeps the engine's `new OpenAI()` fallback paths working with full LLM
  // parity through the fetch adapter (see shims/openai-sdk.ts). Root import
  // only — an `openai/...` subpath import would be a new dependency and must
  // fail the build loudly.
  'openai':      path.join(SRC, 'shims', 'openai-sdk.ts'),
};
const nodeShimPlugin = {
  name: 'nexpath-node-shims',
  setup(build) {
    build.onResolve({ filter: /^(node:(fs|path|os|crypto|tty|readline)|openai)$/ }, (args) => ({ path: NODE_SHIMS[args.path] }));
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
  const define = {
    'globalThis.__NEXPATH_TARGET__': JSON.stringify(target),
    // Identifier replacement (typeof-safe): source guards with
    // `typeof __NEXPATH_BUILD_ID__ === 'string'` so unbundled runs (vitest) fall
    // back to 'dev-unbundled' instead of crashing.
    '__NEXPATH_BUILD_ID__': JSON.stringify(`${BUILD_ID}:${target}`),
  };

  // The engine chain reads `process.env.*` in module-top-level positions that
  // evaluate BEFORE pe-engine.ts's import-time bootstrap can run — in a real
  // MV3 worker (no `process` global) that is an instant ReferenceError and the
  // SERVICE WORKER FAILS TO REGISTER (live-caught 2026-08-24, status code 15).
  // Node-hosted tests can never see it (process always exists there), so the
  // shim must be installed by the BUNDLER before any module code: a banner is
  // the only thing guaranteed to run first.
  const processBanner = 'globalThis.process ??= { env: {} }; globalThis.process.env ??= {};';

  /** @type {esbuild.BuildOptions} */
  const contentScriptOpts = { ...commonOpts, format: 'iife', entryPoints: contentScriptEntries, outdir: outDir, define, banner: { js: processBanner }, plugins: [browserLoggerPlugin, firstPartyStubPlugin, nodeShimPlugin] };
  /** @type {esbuild.BuildOptions} */
  const moduleOpts = { ...commonOpts, format: 'esm', entryPoints: moduleEntries, outdir: outDir, define, banner: { js: processBanner }, plugins: [browserLoggerPlugin, firstPartyStubPlugin, nodeShimPlugin] };

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
