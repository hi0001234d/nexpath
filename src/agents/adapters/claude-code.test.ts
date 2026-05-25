import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InstallContext } from '../types.js';
import {
  claudeCodeAdapter,
  getClaudeSettingsPath,
  buildHookCommand,
  buildStopHookCommand,
  buildHookEntry,
  writeHookEntry,
  removeHookEntry,
} from './claude-code.js';

/**
 * Unit tests for the Claude Code HookAdapter and its supporting hook helpers.
 * These cover the adapter's contract (detect/install/uninstall/settingsPath/buildHooks)
 * plus the building-block functions that were moved here from install.ts in M1
 * Branch 2 (v0.1.3/m1/claude-code-refactor).
 *
 * The install-time byte-identical guarantee is enforced separately by
 * src/cli/commands/install.snapshot.test.ts.
 */
describe('claude-code adapter + helpers', () => {
  let tmpHome: string;
  let originalArgv1: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  const makeCtx = (): InstallContext => ({
    home: tmpHome,
    cwd: join(tmpHome, 'cwd'),
    yes: true,
    dbPath: ':memory:',
  });

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'nexpath-claude-adapter-'));
    originalArgv1 = process.argv[1];
    process.argv[1] = '/fixture/nexpath/dist/cli/index.js';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv[1] = originalArgv1;
    logSpy.mockRestore();
    rmSync(tmpHome, { recursive: true, force: true });
  });

  // ── helpers ─────────────────────────────────────────────────────────────────

  describe('getClaudeSettingsPath', () => {
    it('joins home with .claude/settings.json', () => {
      expect(getClaudeSettingsPath(tmpHome)).toBe(join(tmpHome, '.claude', 'settings.json'));
    });
  });

  describe('buildHookCommand', () => {
    it('produces a node command with the resolved CLI path and the prompt-store DB path', () => {
      const cmd = buildHookCommand(tmpHome);
      expect(cmd).toBe(`node "/fixture/nexpath/dist/cli/index.js" auto --db "${tmpHome}/.nexpath/prompt-store.db"`);
    });
  });

  describe('buildStopHookCommand', () => {
    it('produces a node command ending in `stop`', () => {
      const cmd = buildStopHookCommand(tmpHome);
      expect(cmd).toBe(`node "/fixture/nexpath/dist/cli/index.js" stop --db "${tmpHome}/.nexpath/prompt-store.db"`);
    });
  });

  describe('buildHookEntry', () => {
    it('returns UserPromptSubmit and Stop groups each with _nexpath_hook marker and one command entry', () => {
      const entry = buildHookEntry(tmpHome);
      expect(Object.keys(entry).sort()).toEqual(['Stop', 'UserPromptSubmit']);
      const ups = (entry.UserPromptSubmit as Array<Record<string, unknown>>)[0];
      expect(ups._nexpath_hook).toBe(true);
      expect(ups.matcher).toBe('');
      const upsHooks = ups.hooks as Array<{ type: string; command: string }>;
      expect(upsHooks).toHaveLength(1);
      expect(upsHooks[0].type).toBe('command');
      expect(upsHooks[0].command).toContain('auto');
      const stop = (entry.Stop as Array<Record<string, unknown>>)[0];
      expect(stop._nexpath_hook).toBe(true);
      const stopHooks = stop.hooks as Array<{ type: string; command: string }>;
      expect(stopHooks[0].command).toContain('stop');
    });
  });

  describe('writeHookEntry + removeHookEntry round-trip', () => {
    it('writes the hook entry and produces a parseable JSON file', () => {
      const settingsPath = getClaudeSettingsPath(tmpHome);
      writeHookEntry(settingsPath, tmpHome);
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(parsed.hooks.UserPromptSubmit[0]._nexpath_hook).toBe(true);
      expect(parsed.hooks.Stop[0]._nexpath_hook).toBe(true);
    });

    it('is idempotent — re-writing replaces the previous nexpath hook, does not duplicate', () => {
      const settingsPath = getClaudeSettingsPath(tmpHome);
      writeHookEntry(settingsPath, tmpHome);
      writeHookEntry(settingsPath, tmpHome);
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(parsed.hooks.UserPromptSubmit).toHaveLength(1);
      expect(parsed.hooks.Stop).toHaveLength(1);
    });

    it('preserves non-nexpath hooks already present in settings.json', () => {
      const settingsPath = getClaudeSettingsPath(tmpHome);
      // pre-existing hook entry from some other tool
      const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
      mkdirSync(join(tmpHome, '.claude'), { recursive: true });
      writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: {
            UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'other-tool' }] }],
          },
        }),
        'utf8',
      );
      writeHookEntry(settingsPath, tmpHome);
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(parsed.hooks.UserPromptSubmit).toHaveLength(2); // one foreign + one nexpath
      const nexpathGroup = parsed.hooks.UserPromptSubmit.find((g: { _nexpath_hook?: boolean }) => g._nexpath_hook);
      const foreignGroup = parsed.hooks.UserPromptSubmit.find((g: { _nexpath_hook?: boolean }) => !g._nexpath_hook);
      expect(nexpathGroup).toBeDefined();
      expect(foreignGroup.hooks[0].command).toBe('other-tool');
    });

    it('removeHookEntry returns true and strips only the nexpath group', () => {
      const settingsPath = getClaudeSettingsPath(tmpHome);
      writeHookEntry(settingsPath, tmpHome);
      const result = removeHookEntry(settingsPath);
      expect(result).toBe(true);
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
      // After removal, both UserPromptSubmit and Stop are gone (had only the nexpath entry)
      expect(parsed.hooks.UserPromptSubmit).toBeUndefined();
      expect(parsed.hooks.Stop).toBeUndefined();
    });

    it('removeHookEntry returns false when no nexpath hook is present', () => {
      const settingsPath = getClaudeSettingsPath(tmpHome);
      expect(removeHookEntry(settingsPath)).toBe(false);
    });
  });

  // ── adapter ─────────────────────────────────────────────────────────────────

  describe('claudeCodeAdapter static fields', () => {
    it('has the expected id, label, and category', () => {
      expect(claudeCodeAdapter.id).toBe('claude-code');
      expect(claudeCodeAdapter.label).toBe('Claude Code');
      expect(claudeCodeAdapter.category).toBe('hook');
    });
  });

  describe('claudeCodeAdapter.detect', () => {
    it('always returns true', () => {
      expect(claudeCodeAdapter.detect(makeCtx())).toBe(true);
    });
  });

  describe('claudeCodeAdapter.settingsPath', () => {
    it('returns ~/.claude/settings.json relative to ctx.home when no override', () => {
      expect(claudeCodeAdapter.settingsPath(makeCtx())).toBe(join(tmpHome, '.claude', 'settings.json'));
    });

    it('returns ctx.settingsPath when provided (override)', () => {
      const override = join(tmpHome, 'custom', 'settings.json');
      expect(claudeCodeAdapter.settingsPath({ ...makeCtx(), settingsPath: override })).toBe(override);
    });
  });

  describe('claudeCodeAdapter.buildHooks', () => {
    it('returns UserPromptSubmit and Stop with command-type entries', () => {
      const hooks = claudeCodeAdapter.buildHooks(makeCtx());
      expect(hooks.UserPromptSubmit).toHaveLength(1);
      expect(hooks.UserPromptSubmit[0].type).toBe('command');
      expect(hooks.UserPromptSubmit[0].command).toContain('auto');
      expect(hooks.Stop[0].command).toContain('stop');
    });
  });

  describe('claudeCodeAdapter.install', () => {
    it('writes the hook entry and returns status installed', async () => {
      const result = await claudeCodeAdapter.install(makeCtx());
      expect(result.status).toBe('installed');
      const settingsPath = join(tmpHome, '.claude', 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(parsed.hooks.UserPromptSubmit[0]._nexpath_hook).toBe(true);
    });

    it('logs the success line containing the settings path', async () => {
      await claudeCodeAdapter.install(makeCtx());
      const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allLogs).toContain('advisory hook written to');
      expect(allLogs).toContain(join(tmpHome, '.claude', 'settings.json'));
    });

    it('writes to ctx.settingsPath when override is provided, not to home/.claude/', async () => {
      const customPath = join(tmpHome, 'custom-dir', 'override.json');
      const result = await claudeCodeAdapter.install({ ...makeCtx(), settingsPath: customPath });
      expect(result.status).toBe('installed');
      expect(existsSync(customPath)).toBe(true);
      expect(existsSync(join(tmpHome, '.claude', 'settings.json'))).toBe(false);
      const parsed = JSON.parse(readFileSync(customPath, 'utf8'));
      expect(parsed.hooks.UserPromptSubmit[0]._nexpath_hook).toBe(true);
    });
  });

  describe('claudeCodeAdapter.uninstall', () => {
    it('removes the hook entry after a prior install', async () => {
      await claudeCodeAdapter.install(makeCtx());
      logSpy.mockClear();
      await claudeCodeAdapter.uninstall(makeCtx());
      const parsed = JSON.parse(readFileSync(join(tmpHome, '.claude', 'settings.json'), 'utf8'));
      expect(parsed.hooks.UserPromptSubmit).toBeUndefined();
      expect(parsed.hooks.Stop).toBeUndefined();
      const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allLogs).toContain('advisory hook removed');
    });

    it('logs the skip message when no nexpath hook is present', async () => {
      await claudeCodeAdapter.uninstall(makeCtx());
      const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allLogs).toContain('hook not registered, skipped');
    });
  });
});
