import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  // `.cjs` extension is load-bearing: package.json#type is "module" (so the
  // source-side .ts imports use ESM resolution), but esbuild bundles the
  // extension entry as CommonJS — which is what VS Code's extension host
  // requires (it `require()`s the main entry). Naming the output .cjs tells
  // Node to use the CJS loader regardless of the package's type field;
  // naming it .js would trigger ERR_REQUIRE_ESM and silently break activation.
  // Locked by src/package-main-format.test.ts.
  outfile: 'out/extension.cjs',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // `vscode` is provided by the host. `better-sqlite3` is a native module
  // (.node bindings) that esbuild cannot bundle; node_modules/better-sqlite3
  // ships in the .vsix and is loaded via dynamic import at runtime so the
  // native load only hits on first chat-history read.
  external: ['vscode', 'better-sqlite3'],
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('[esbuild] watching src/extension.ts...');
} else {
  await build(config);
  console.log('[esbuild] built out/extension.cjs');
}
