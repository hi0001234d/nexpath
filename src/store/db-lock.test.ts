import { describe, it, expect, afterEach } from 'vitest';
import { rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, closeStore, releaseStoreLock, reacquireStoreLock, withReleasedStoreLockV1 } from './db.js';
import { getConfig, setConfig } from './config.js';

const paths: string[] = [];
function tmpDb(): string {
  const p = join(tmpdir(), `nexpath-lock-${randomUUID()}.db`);
  paths.push(p);
  return p;
}
afterEach(() => {
  for (const p of paths.splice(0)) {
    rmSync(p, { force: true });
    rmSync(`${p}.lock`, { force: true });
  }
});

describe('releaseStoreLock / reacquireStoreLock', () => {
  it('lets another session acquire the lock while released, then reloads its write without clobbering', async () => {
    const dbPath = tmpDb();
    const a = await openStore(dbPath);
    setConfig(a, 'k', 'a-value');

    // A releases its lock during a (simulated) blocking operation, keeping its db.
    releaseStoreLock(a);

    // Another session can now open the same DB (lock free) and write.
    const b = await openStore(dbPath);
    setConfig(b, 'k', 'b-value');
    closeStore(b);   // persists + releases B's lock

    // A re-acquires and reloads → sees B's write rather than its stale image.
    await reacquireStoreLock(a);
    expect(getConfig(a.db, 'k')).toBe('b-value');

    // A's own later save must not lose B's change.
    setConfig(a, 'k2', 'a2');
    closeStore(a);

    const c = await openStore(dbPath);
    expect(getConfig(c.db, 'k')).toBe('b-value');   // B's write survived
    expect(getConfig(c.db, 'k2')).toBe('a2');       // A's later write survived
    closeStore(c);
  });

  it('is a no-op for :memory: stores (db kept, still usable)', async () => {
    const s = await openStore(':memory:');
    setConfig(s, 'k', 'v');
    releaseStoreLock(s);
    await reacquireStoreLock(s);
    expect(getConfig(s.db, 'k')).toBe('v');   // preserved, not reopened empty
    closeStore(s);
  });
});

describe('withReleasedStoreLockV1 (MPS-8: never hold the lock across a wait)', () => {
  it('releases across fn, returns its value, then re-acquires + reloads (another session not clobbered)', async () => {
    const dbPath = tmpDb();
    const a = await openStore(dbPath);
    setConfig(a, 'k', 'a-value');

    // While `fn` runs, A's lock is released → B can open the same DB and write.
    const returned = await withReleasedStoreLockV1(a, async () => {
      const b = await openStore(dbPath);
      setConfig(b, 'k', 'b-value');
      closeStore(b);   // persists + releases B's lock
      return 'fn-result';
    });

    expect(returned).toBe('fn-result');            // fn's value is returned
    expect(getConfig(a.db, 'k')).toBe('b-value');  // reloaded → sees B's write, not A's stale image

    setConfig(a, 'k2', 'a2');
    closeStore(a);
    const c = await openStore(dbPath);
    expect(getConfig(c.db, 'k')).toBe('b-value');  // B's write survived
    expect(getConfig(c.db, 'k2')).toBe('a2');      // A's later write survived
    closeStore(c);
  });

  it('re-acquires + reloads even when fn throws (finally runs)', async () => {
    const dbPath = tmpDb();
    const a = await openStore(dbPath);
    setConfig(a, 'k', 'a-value');

    await expect(withReleasedStoreLockV1(a, async () => {
      const b = await openStore(dbPath);
      setConfig(b, 'k', 'b-value');
      closeStore(b);
      throw new Error('boom');
    })).rejects.toThrow('boom');

    // Despite the throw, the lock was re-acquired and the db reloaded (B's write is visible).
    expect(getConfig(a.db, 'k')).toBe('b-value');
    // And A can still write + save — the lock is held again.
    setConfig(a, 'k2', 'a2');
    closeStore(a);
    const c = await openStore(dbPath);
    expect(getConfig(c.db, 'k2')).toBe('a2');
    closeStore(c);
  });
});

describe('corrupted DB recovery in openStore', () => {
  it('backs up a corrupted database file ("file is not a database") and recovers cleanly', async () => {
    const dbPath = tmpDb();
    writeFileSync(dbPath, 'this is not a valid sqlite database header');

    const store = await openStore(dbPath);
    setConfig(store, 'recovered', 'yes');
    closeStore(store);

    const reopened = await openStore(dbPath);
    expect(getConfig(reopened.db, 'recovered')).toBe('yes');
    closeStore(reopened);

    const dir = dirname(dbPath);
    const base = basename(dbPath);
    const backups = readdirSync(dir).filter((f) => f.startsWith(`${base}.corrupt.`));
    expect(backups.length).toBe(1);
    for (const b of backups) rmSync(join(dir, b), { force: true });
  });
});
