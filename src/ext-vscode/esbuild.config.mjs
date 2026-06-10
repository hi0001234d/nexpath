import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // `vscode` is provided by the host. `sql.js` ships node_modules into the
  // .vsix and is loaded via dynamic import at runtime so the wasm boot
  // happens only on first chat-history read.
  external: ['vscode', 'sql.js'],
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
  console.log('[esbuild] built out/extension.js');
}
