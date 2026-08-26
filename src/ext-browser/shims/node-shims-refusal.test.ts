/**
 * The "loud refusal" shims — node:os, node:tty, node:readline, the store-db
 * first-party stub, and node:fs's openSync. Their contract is the opposite of
 * emulation: statically-unreachable surfaces must THROW on any call (a call is
 * a wiring bug that has to surface immediately), while the two real answers
 * (homedir's marker path, fs's absent-file semantics) stay pinned because the
 * engine's defensive branches depend on them.
 */
import { describe, expect, it } from 'vitest';
import { homedir } from './node-os.js';
import { ReadStream, WriteStream } from './node-tty.js';
import * as readline from './node-readline.js';
import * as storeDb from './store-db.js';
import { existsSync, openSync, readFileSync, statSync } from './node-fs.js';

describe('node-os shim', () => {
  it('homedir returns the fixed marker path that only feeds the absent-fs shim', () => {
    expect(homedir()).toBe('/nexpath-browser-home');
  });
});

describe('node-tty shim — construction is a loud refusal', () => {
  it('ReadStream and WriteStream throw on construction', () => {
    expect(() => new ReadStream()).toThrow(/node:tty ReadStream is not available/);
    expect(() => new WriteStream()).toThrow(/node:tty WriteStream is not available/);
  });
});

describe('node-readline shim — every entry point refuses', () => {
  for (const fn of ['createInterface', 'emitKeypressEvents', 'clearScreenDown', 'cursorTo', 'moveCursor'] as const) {
    it(`${fn} throws`, () => {
      expect(() => (readline[fn] as () => never)()).toThrow(new RegExp(`node:readline ${fn} is not available`));
    });
  }
});

describe('store-db first-party stub — the CLI sql.js store is unreachable', () => {
  it('DEFAULT_DB_PATH stays under the marker home (feeds the absent-fs shim)', () => {
    expect(storeDb.DEFAULT_DB_PATH.startsWith('/nexpath-browser-home/')).toBe(true);
  });

  it('every sync entry point refuses with the browser-data-layer message', () => {
    for (const fn of ['saveStore', 'closeStore', 'releaseStoreLock'] as const) {
      expect(() => (storeDb[fn] as (s: unknown) => never)({}), fn).toThrow(/browser data layer is IndexedDB/);
    }
  });

  it('every async entry point rejects the same way', async () => {
    await expect(storeDb.getSql()).rejects.toThrow(/getSql\(\) is not available/);
    await expect(storeDb.openStore()).rejects.toThrow(/openStore\(\) is not available/);
    await expect(storeDb.reacquireStoreLock({})).rejects.toThrow(/reacquireStoreLock\(\) is not available/);
    await expect(storeDb.withReleasedStoreLockV1({}, async () => 1)).rejects.toThrow(/withReleasedStoreLockV1\(\) is not available/);
  });
});

describe('node-fs shim — absent-file semantics incl. the PB4 openSync addition', () => {
  it('reads answer as a missing file (the engine takes its own defensive branches)', () => {
    expect(existsSync('/any/path')).toBe(false);
    expect(() => readFileSync('/any/path')).toThrow(/ENOENT/);
    expect(() => statSync('/any/path')).toThrow(/ENOENT/);
  });

  it('openSync (the engine CLI popup\'s /dev/tty fallback) throws ENOENT-coded', () => {
    try {
      openSync('/dev/tty');
      expect.unreachable('openSync must throw');
    } catch (err) {
      expect((err as Error & { code?: string }).code).toBe('ENOENT');
    }
  });
});
