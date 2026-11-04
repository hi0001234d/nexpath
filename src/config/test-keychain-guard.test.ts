/**
 * Guard for vitest.setup.ts: no test may reach the real OS keychain (it is system-wide, so the HOME
 * redirect does not isolate it). Before the guard, uninstall tests deleted the developer's real
 * OpenAI key and Nexpath token on every full run.
 */
import { describe, it, expect, vi } from 'vitest';
import * as keychain from 'cross-keychain';

describe('test keychain guard', () => {
  it('cross-keychain is the in-memory fake, not the real OS keychain', async () => {
    const real = await vi.importActual<typeof import('cross-keychain')>('cross-keychain');
    // Checked first, so a broken guard fails here before anything is written.
    expect(keychain.getPassword).not.toBe(real.getPassword);
    expect(keychain.setPassword).not.toBe(real.setPassword);
    expect(keychain.deletePassword).not.toBe(real.deletePassword);
  });

  it('set / get / delete work in memory', async () => {
    expect(await keychain.getPassword('nexpath-guard', 'a')).toBeNull();
    await keychain.setPassword('nexpath-guard', 'a', 'v');
    expect(await keychain.getPassword('nexpath-guard', 'a')).toBe('v');
    await keychain.deletePassword('nexpath-guard', 'a');
    expect(await keychain.getPassword('nexpath-guard', 'a')).toBeNull();
  });
});
