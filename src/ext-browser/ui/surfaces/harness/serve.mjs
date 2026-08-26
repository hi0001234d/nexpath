// Static server for the harness, and the sink its runs report to.
//
// Run: `node build.mjs && node serve.mjs`, then open http://localhost:8392/
//   /            interactive — the real dock, chrome and controller
//   /?sweep=1    the layout matrix, measured with getBoundingClientRect
//   /?e2e=1      the behaviour scenarios
//
// TWO THINGS THIS DOES THAT A PLAIN STATIC SERVER DOES NOT, both learned the
// hard way:
//
//   no-store   A harness exists to be reloaded. Without cache headers Chrome
//              keeps `harness.bundle.js` indefinitely, and a UI you have just
//              fixed still looks broken — which happened: a focus ring deleted
//              from the source was still on screen, served from cache, and was
//              reported as a live bug.
//
//   POST sink  Firefox has no `--dump-dom`, so reading a verdict out of the
//              page only ever worked for Chromium — the engine C-3 names first
//              was the one that could not be measured. The run POSTs its result
//              here instead, which every engine can do.

import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RESULT = path.join(ROOT, 'last-result.json');
const PORT = Number(process.env.PORT ?? 8392);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/result') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      await writeFile(RESULT, body);
      console.log('RESULT ' + body);
      res.writeHead(204);
      res.end();
    });
    return;
  }

  // Path traversal is not a threat on a localhost dev tool, but a request that
  // escapes the harness directory is a bug either way — refuse it.
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = path.resolve(ROOT, '.' + (rel === '/' ? '/index.html' : rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('outside the harness'); return; }

  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store, no-cache, must-revalidate',
      pragma: 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, () => {
  console.log(`[harness] http://localhost:${PORT}/  (?sweep=1, ?e2e=1)`);
});
