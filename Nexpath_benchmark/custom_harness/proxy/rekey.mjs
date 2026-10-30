#!/usr/bin/env node
// Re-name an existing cassette's files using the proxy's current key rule.
// Uses only what is already saved — it never calls the API.
import { readdirSync, readFileSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const dir = resolve(process.argv[2] ?? (console.error('usage: rekey.mjs <cassette dir>'), process.exit(2)));
const VOLATILE = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>'],
  [/\b1[0-9]{12}\b/g, '<epoch-ms>'],
  [/\b1[0-9]{9}\b/g, '<epoch-s>'],
];
const stable = (body) => {
  let t = body;
  try { t = JSON.stringify(JSON.parse(body)); } catch { /* not JSON */ }
  return VOLATILE.reduce((acc, [re, to]) => acc.replace(re, to), t);
};
const keyOf = (m, p, b) => createHash('sha256').update(`${m} ${p}\n${stable(b)}`).digest('hex').slice(0, 32);

let moved = 0, same = 0, clash = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const body = typeof rec.request.body === 'string' ? rec.request.body : JSON.stringify(rec.request.body);
  const key = keyOf(rec.request.method, rec.request.path, body);
  if (`${key}.json` === f) { same++; continue; }
  if (existsSync(join(dir, `${key}.json`))) { clash++; continue; }
  renameSync(join(dir, f), join(dir, `${key}.json`)); moved++;
}
console.log(`re-keyed: ${moved} renamed, ${same} already correct, ${clash} would collide (left alone)`);
