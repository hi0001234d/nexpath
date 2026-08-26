// Bundles the harness with the repo's own esbuild. Lives inside surfaces/ so
// C-5 holds — no file outside this layer is touched, and the output is
// git-ignored beside it. Run: `node build.mjs` from this directory.
import * as esbuild from '../../../../../node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
await esbuild.build({
  entryPoints: [path.join(here, 'harness.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: path.join(here, 'harness.bundle.js'),
});
console.log('[harness] built harness.bundle.js');
