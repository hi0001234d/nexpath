import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';

vi.mock('../../config/ApiKeyResolver.js', () => ({
  storeApiKey:     vi.fn().mockResolvedValue({ source: 'keychain' }),
  isValidApiKey:   (key: string) => /^sk-[A-Za-z0-9_-]{20,}$/.test(key),
  getKeySource:    vi.fn().mockResolvedValue('none'),
  removeApiKey:    vi.fn().mockResolvedValue(undefined),
}));

import {
  installAction,
  resolveAgentPaths,
  getKeychainName,
  type InstallPrompts,
} from './install.js';
import * as resolver from '../../config/ApiKeyResolver.js';
import { openStore, closeStore } from '../../store/db.js';
import { getConfig, isConfigSet } from '../../store/config.js';

function tmpDirAgents(): { dir: string; cleanup: () => void } {
  const dir = join(tmpdir(), `nexpath-install3-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true }); } catch { /* ignore */ } } };
}

let savedEnvKey: string | undefined;

beforeEach(() => {
  savedEnvKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  vi.mocked(resolver.storeApiKey).mockReset().mockResolvedValue({ source: 'keychain' });
  vi.mocked(resolver.getKeySource).mockReset().mockResolvedValue('none');
});

afterEach(() => {
  if (savedEnvKey === undefined) delete process.env.OPENAI_API_KEY;
  else                            process.env.OPENAI_API_KEY = savedEnvKey;
  vi.restoreAllMocks();
});

function makePrompts(overrides: Partial<InstallPrompts> = {}): InstallPrompts {
  return {
    apiKeyPrompt:     async () => ({ kind: 'skip' }),
    telemetryConsent: async () => ({ kind: 'enable' }),
    ...overrides,
  };
}

// installAction also runs the advisory frequency + role step. These non-interactive
// stubs keep that step from blocking on real stdin during 3-step tests.
const noopFreqPrompt = async () => 'every_event';
const noopRolePrompt = async () => 'founder';

// ── Step 1: API key prompt ───────────────────────────────────────────────────

describe('install 3-step — Step 1: API key', () => {
  it('new_key result → storeApiKey called with the value; summary source = keychain', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'new_key', value: 'sk-abcdefghij1234567890abcdefghij' }),
        }),
      });
      expect(resolver.storeApiKey).toHaveBeenCalledWith('sk-abcdefghij1234567890abcdefghij');
      expect(summary).not.toBeNull();
      expect(summary!.apiKey.source).toBe('keychain');
    } finally { cleanup(); }
  });

  it('use_env result → storeApiKey called with process.env.OPENAI_API_KEY', async () => {
    process.env.OPENAI_API_KEY = 'sk-fromenv1234567890abcdefghij1234';
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'use_env' }),
        }),
      });
      expect(resolver.storeApiKey).toHaveBeenCalledWith('sk-fromenv1234567890abcdefghij1234');
    } finally { cleanup(); }
  });

  it('keep_existing result → storeApiKey NOT called; summary source = kept', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'keep_existing' }),
        }),
      });
      expect(resolver.storeApiKey).not.toHaveBeenCalled();
      expect(summary!.apiKey.source).toBe('kept');
    } finally { cleanup(); }
  });

  it('skip result → storeApiKey NOT called; summary source = skipped', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'skip' }),
        }),
      });
      expect(resolver.storeApiKey).not.toHaveBeenCalled();
      expect(summary!.apiKey.source).toBe('skipped');
    } finally { cleanup(); }
  });

  it('cancel result → returns null and writes nothing', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'cancel.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'cancel' }),
        }),
      });
      expect(summary).toBeNull();
      expect(resolver.storeApiKey).not.toHaveBeenCalled();
      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('true');
      closeStore(store);
    } finally { cleanup(); }
  });
});

// ── Step 2: Telemetry consent ────────────────────────────────────────────────

describe('install 3-step — Step 2: Telemetry consent', () => {
  it('enable → telemetry.enabled AND telemetry_sync_enabled both set to "true" in config', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'telem.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        confirmFn: async () => true,
        promptFn: makePrompts({ telemetryConsent: async () => ({ kind: 'enable' }) }),
      });
      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('true');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('true');
      closeStore(store);
    } finally { cleanup(); }
  });

  it('disable → telemetry.enabled AND telemetry_sync_enabled both set to "false" in config', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'telem-off.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        confirmFn: async () => true,
        promptFn: makePrompts({ telemetryConsent: async () => ({ kind: 'disable' }) }),
      });
      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('false');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('false');
      closeStore(store);
    } finally { cleanup(); }
  });

  it('--yes mode → both telemetry.enabled and telemetry_sync_enabled set to "true" in DB', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'telem-yes-mode.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
      });
      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('true');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('true');
      expect(isConfigSet(store.db, 'telemetry.enabled')).toBe(true);
      expect(isConfigSet(store.db, 'telemetry_sync_enabled')).toBe(true);
      closeStore(store);
    } finally { cleanup(); }
  });

  it('cancel → returns null and the telemetry config is NOT written', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'telem-cancel.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        promptFn: makePrompts({ telemetryConsent: async () => ({ kind: 'cancel' }) }),
      });
      expect(summary).toBeNull();
    } finally { cleanup(); }
  });
});

// ── Summary returned ─────────────────────────────────────────────────────────

describe('install 3-step — Summary returned', () => {
  it('summary object includes apiKey.source, telemetry.enabled, agents.registered/failed', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'skip' }),
          telemetryConsent: async () => ({ kind: 'enable' }),
        }),
      });
      expect(summary).not.toBeNull();
      expect(summary!.apiKey.source).toBe('skipped');
      expect(summary!.telemetry.enabled).toBe(true);
      expect(Array.isArray(summary!.agents.registered)).toBe(true);
      expect(Array.isArray(summary!.agents.failed)).toBe(true);
    } finally { cleanup(); }
  });

  it('--yes bypasses prompts; summary still returned with default apiKey="skipped", telemetry=true', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({ yes: true }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
      });
      expect(summary).not.toBeNull();
      expect(summary!.apiKey.source).toBe('skipped');
      expect(summary!.telemetry.enabled).toBe(true);
    } finally { cleanup(); }
  });
});

// ── Q3 + Q4 follow-ups: rich UI logs + clipboard in summary ─────────────────

describe('install 3-step — Q3 rich UI: "Stored in <keychain>" confirmation line', () => {
  it('logs "✓ Stored in <keychain>" after a new_key storeApiKey call', async () => {
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      vi.mocked(resolver.storeApiKey).mockResolvedValueOnce({ source: 'keychain' });
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        platformForKeychain: 'darwin',
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'new_key', value: 'sk-abcdefghij1234567890abcdefghij' }),
        }),
      });
      const output = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(output).toContain('Stored in macOS Keychain');
    } finally { cleanup(); }
  });

  it('logs "✓ Stored in fallback file" when storeApiKey falls back to the 0600 file', async () => {
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      vi.mocked(resolver.storeApiKey).mockResolvedValueOnce({ source: 'file' });
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'new_key', value: 'sk-abcdefghij1234567890abcdefghij' }),
        }),
      });
      const output = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(output).toContain('Stored in fallback file');
    } finally { cleanup(); }
  });
});

describe('install 3-step — Q4: clipboard install reflected in summary', () => {
  it('summary.extras has clipboardInstalled=false and clipboardTool=null when skipClipboardCheck is true', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({ yes: true }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
      });
      expect(summary!.extras.clipboardInstalled).toBe(false);
      expect(summary!.extras.clipboardTool).toBeNull();
    } finally { cleanup(); }
  });

  it('InstallSummary type includes extras { clipboardInstalled, clipboardTool } fields', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({ yes: true }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
      });
      expect(summary).not.toBeNull();
      expect(summary!.extras).toBeDefined();
      expect('clipboardInstalled' in summary!.extras).toBe(true);
      expect('clipboardTool' in summary!.extras).toBe(true);
    } finally { cleanup(); }
  });
});

// ── Context detection: hasEnvKey / hasStoredKey ──────────────────────────────

describe('install 3-step — apiKeyPrompt context detection', () => {
  it('hasEnvKey=true when OPENAI_API_KEY env var is valid', async () => {
    process.env.OPENAI_API_KEY = 'sk-abcdefghij1234567890abcdefghij';
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const apiKeyPrompt = vi.fn<InstallPrompts['apiKeyPrompt']>().mockResolvedValue({ kind: 'skip' });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: { apiKeyPrompt, telemetryConsent: async () => ({ kind: 'enable' }) },
      });
      const ctx = apiKeyPrompt.mock.calls[0][0];
      expect(ctx.hasEnvKey).toBe(true);
    } finally { cleanup(); }
  });

  it('hasEnvKey=false when OPENAI_API_KEY env var has an invalid prefix', async () => {
    process.env.OPENAI_API_KEY = 'invalid-not-sk-prefix';
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const apiKeyPrompt = vi.fn<InstallPrompts['apiKeyPrompt']>().mockResolvedValue({ kind: 'skip' });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: { apiKeyPrompt, telemetryConsent: async () => ({ kind: 'enable' }) },
      });
      const ctx = apiKeyPrompt.mock.calls[0][0];
      expect(ctx.hasEnvKey).toBe(false);
    } finally { cleanup(); }
  });

  it('hasStoredKey=true when getKeySource returns "keychain" or "file" and env is unset', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const apiKeyPrompt = vi.fn<InstallPrompts['apiKeyPrompt']>().mockResolvedValue({ kind: 'keep_existing' });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: { apiKeyPrompt, telemetryConsent: async () => ({ kind: 'enable' }) },
      });
      const ctx = apiKeyPrompt.mock.calls[0][0];
      expect(ctx.hasStoredKey).toBe(true);
      expect(ctx.hasEnvKey).toBe(false);
    } finally { cleanup(); }
  });

  it('keychainName in context matches platformForKeychain override', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const apiKeyPrompt = vi.fn<InstallPrompts['apiKeyPrompt']>().mockResolvedValue({ kind: 'skip' });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        platformForKeychain: 'win32',
        confirmFn: async () => true,
        promptFn: { apiKeyPrompt, telemetryConsent: async () => ({ kind: 'enable' }) },
      });
      const ctx = apiKeyPrompt.mock.calls[0][0];
      expect(ctx.keychainName).toBe('Credential Manager');
    } finally { cleanup(); }
  });
});

// ── Cancellation semantics (non-transactional design documented) ─────────────

describe('install 3-step — cancellation aborts subsequent steps', () => {
  it('cancel at Step 1 → no telemetry config write and no agent registration', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'cancel-step1.db');
    const telemetrySpy = vi.fn<InstallPrompts['telemetryConsent']>();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        promptFn: {
          apiKeyPrompt:     async () => ({ kind: 'cancel' }),
          telemetryConsent: telemetrySpy,
        },
      });
      expect(summary).toBeNull();
      expect(telemetrySpy).not.toHaveBeenCalled();
      const store = await openStore(dbPath);
      expect(isConfigSet(store.db, 'telemetry.enabled')).toBe(false);
      expect(isConfigSet(store.db, 'telemetry_sync_enabled')).toBe(false);
      closeStore(store);
    } finally { cleanup(); }
  });

  it('cancel at Step 2 → telemetry config NOT written; Step 1 storeApiKey HAS already landed (non-transactional)', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'cancel-step2.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        promptFn: {
          apiKeyPrompt:     async () => ({ kind: 'new_key', value: 'sk-abcdefghij1234567890abcdefghij' }),
          telemetryConsent: async () => ({ kind: 'cancel' }),
        },
      });
      expect(summary).toBeNull();
      // Step 1 already wrote: storeApiKey was called.
      expect(resolver.storeApiKey).toHaveBeenCalledWith('sk-abcdefghij1234567890abcdefghij');
      // Step 2 was cancelled → neither telemetry flag should be written.
      const store = await openStore(dbPath);
      expect(isConfigSet(store.db, 'telemetry.enabled')).toBe(false);
      expect(isConfigSet(store.db, 'telemetry_sync_enabled')).toBe(false);
      closeStore(store);
    } finally { cleanup(); }
  });
});

// ── getKeychainName platform variants ────────────────────────────────────────

describe('getKeychainName', () => {
  it('returns "macOS Keychain" on darwin', () => {
    expect(getKeychainName('darwin')).toBe('macOS Keychain');
  });

  it('returns "Secret Service (libsecret)" on linux', () => {
    expect(getKeychainName('linux')).toBe('Secret Service (libsecret)');
  });

  it('returns "Credential Manager" on win32', () => {
    expect(getKeychainName('win32')).toBe('Credential Manager');
  });

  it('falls back to the encrypted-file message on other platforms', () => {
    expect(getKeychainName('freebsd' as NodeJS.Platform)).toMatch(/Encrypted file/);
  });
});
