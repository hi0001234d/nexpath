#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

// Silence console.log BEFORE any modules load — natural's storage files call
// dotenv.config() at import time, which writes "◇ injected env" lines to stdout
// via console.log.  Claude Code parses stdout as JSON; stray lines break it.
console.log = (...args: unknown[]) => process.stderr.write(args.join(' ') + '\n');

const { run, createProgram, program } = await import('./main.js');
export { createProgram, program };

const thisFile = fileURLToPath(import.meta.url);
const mainFile = process.argv[1]
  ? (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })()
  : '';

if (thisFile === mainFile) {
  await run();
}
