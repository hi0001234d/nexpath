import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
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
  console.log('[esbuild] built out/extension.js');
}
