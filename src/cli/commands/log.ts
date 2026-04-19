import { existsSync, readFileSync } from 'node:fs';
import { LOG_PATH } from '../../logger.js';

export interface LogOpts {
  tail?:  number;
  level?: string;
}

export function logAction(opts: LogOpts = {}): void {
  if (!existsSync(LOG_PATH)) {
    console.log('No log file yet — run nexpath auto at least once.');
    console.log(`Expected location: ${LOG_PATH}`);
    return;
  }

  const raw      = readFileSync(LOG_PATH, 'utf8');
  const lines    = raw.split('\n').filter(Boolean);
  const level    = opts.level?.toLowerCase();
  const filtered = level
    ? lines.filter((l) => l.includes(`[${level.toUpperCase()}`))
    : lines;

  const tail    = opts.tail ?? 50;
  const display = filtered.slice(-tail);

  if (display.length === 0) {
    console.log('No log entries match the filter.');
    return;
  }

  console.log(display.join('\n'));
}
