import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KEEP_ITEMTABLE_PREFIXES,
  shouldKeepItemTable,
  redactValue,
  cursorConfigRoot,
  discoverAllStateVscdb,
  parseArgs,
} from './cursor-state-dump-helpers.js';

describe('shouldKeepItemTable', () => {
  it('keeps every prefix in the default allowlist', () => {
    for (const p of KEEP_ITEMTABLE_PREFIXES) {
      expect(shouldKeepItemTable(`${p}some-suffix`)).toBe(true);
    }
  });

  it('drops keys that do not match any prefix', () => {
    expect(shouldKeepItemTable('workbench.editor.recent')).toBe(false);
    expect(shouldKeepItemTable('terminal.integrated.layoutInfo')).toBe(false);
    expect(shouldKeepItemTable('debug.selectedroot')).toBe(false);
    expect(shouldKeepItemTable('')).toBe(false);
  });

  it('respects a custom prefix list when supplied', () => {
    expect(shouldKeepItemTable('foo.bar', ['foo.'])).toBe(true);
    expect(shouldKeepItemTable('foo.bar', ['baz.'])).toBe(false);
  });

  it('matches by prefix, not exact string', () => {
    expect(shouldKeepItemTable('aiService.prompts')).toBe(true);
    expect(shouldKeepItemTable('aiService.generations.extra')).toBe(true);
  });
});

describe('redactValue', () => {
  it('keeps strings of length <= 8 unchanged', () => {
    const v = JSON.stringify({ role: 'user', type: 'assistant', short: 'hi' });
    const out = redactValue(v);
    // 'user' (4), 'assistant' (9 — gets redacted!), 'hi' (2) — boundary matters
    const parsed = JSON.parse(out);
    expect(parsed.role).toBe('user');
    expect(parsed.short).toBe('hi');
    // 'assistant' is 9 chars → over threshold → redacted
    expect(parsed.type).toBe('*********');
  });

  it('redacts strings of length > 8 inside JSON', () => {
    const v = JSON.stringify({ prompt: 'sensitive-secret-text' });
    const out = redactValue(v);
    const parsed = JSON.parse(out);
    expect(parsed.prompt).toBe('*'.repeat('sensitive-secret-text'.length));
  });

  it('recurses into nested JSON objects and arrays', () => {
    const v = JSON.stringify({
      conv: [
        { role: 'user', text: 'a long sensitive prompt' },
        { role: 'assistant', text: 'a long sensitive reply' },
      ],
    });
    const parsed = JSON.parse(redactValue(v));
    expect(parsed.conv[0].role).toBe('user');
    expect(parsed.conv[0].text).toBe('*'.repeat('a long sensitive prompt'.length));
    expect(parsed.conv[1].text).toBe('*'.repeat('a long sensitive reply'.length));
  });

  it('preserves non-string values (numbers, booleans, null) in JSON', () => {
    const v = JSON.stringify({ count: 42, ok: true, missing: null, x: false });
    const parsed = JSON.parse(redactValue(v));
    expect(parsed.count).toBe(42);
    expect(parsed.ok).toBe(true);
    expect(parsed.missing).toBeNull();
    expect(parsed.x).toBe(false);
  });

  it('bulk-redacts the entire string when the value is not JSON', () => {
    const v = 'this-is-not-json-and-should-vanish';
    expect(redactValue(v)).toBe('*'.repeat(v.length));
  });

  it('handles a bare JSON string (still JSON, but the root is a long string)', () => {
    const v = JSON.stringify('a fairly long string here');
    const out = redactValue(v);
    // Result is also JSON-encoded — parse to check
    const parsed = JSON.parse(out);
    expect(parsed).toBe('*'.repeat('a fairly long string here'.length));
  });

  it('redacts at exactly the 9-char threshold (boundary)', () => {
    // 8 chars → kept
    expect(JSON.parse(redactValue(JSON.stringify({ k: '12345678' }))).k).toBe('12345678');
    // 9 chars → redacted
    expect(JSON.parse(redactValue(JSON.stringify({ k: '123456789' }))).k).toBe('*'.repeat(9));
  });
});

describe('cursorConfigRoot', () => {
  it('returns the linux path under ~/.config/Cursor', () => {
    expect(
      cursorConfigRoot({ platform: 'linux', home: '/home/u' }),
    ).toBe('/home/u/.config/Cursor');
  });

  it('returns the macOS path under ~/Library/Application Support/Cursor', () => {
    expect(
      cursorConfigRoot({ platform: 'darwin', home: '/Users/u' }),
    ).toBe('/Users/u/Library/Application Support/Cursor');
  });

  it('returns the Windows path under %APPDATA%/Cursor when APPDATA is provided', () => {
    expect(
      cursorConfigRoot({
        platform: 'win32',
        home: 'C:\\Users\\u',
        appdata: 'C:\\Users\\u\\AppData\\Roaming',
      }),
    ).toBe('C:\\Users\\u\\AppData\\Roaming/Cursor');
  });

  it('falls back to <home>/AppData/Roaming/Cursor on Windows when APPDATA missing', () => {
    expect(
      cursorConfigRoot({ platform: 'win32', home: 'C:/U' }),
    ).toContain('Cursor');
  });

  it('treats unknown platforms as linux-style', () => {
    expect(
      cursorConfigRoot({ platform: 'freebsd' as NodeJS.Platform, home: '/home/u' }),
    ).toBe('/home/u/.config/Cursor');
  });
});

describe('discoverAllStateVscdb', () => {
  it('returns empty when no Cursor tree exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cursor-disc-empty-'));
    const result = discoverAllStateVscdb(tmp);
    expect(result).toEqual([]);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('finds the global state.vscdb when only it exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cursor-disc-glob-'));
    mkdirSync(join(tmp, 'User', 'globalStorage'), { recursive: true });
    writeFileSync(join(tmp, 'User', 'globalStorage', 'state.vscdb'), '');
    const result = discoverAllStateVscdb(tmp);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('global');
    expect(result[0]!.path.endsWith('state.vscdb')).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('finds workspace state.vscdb files alongside the global one', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cursor-disc-ws-'));
    mkdirSync(join(tmp, 'User', 'globalStorage'), { recursive: true });
    writeFileSync(join(tmp, 'User', 'globalStorage', 'state.vscdb'), '');
    for (const ws of ['1234567890', 'abc-def', 'empty-window']) {
      mkdirSync(join(tmp, 'User', 'workspaceStorage', ws), { recursive: true });
      writeFileSync(join(tmp, 'User', 'workspaceStorage', ws, 'state.vscdb'), '');
    }
    const result = discoverAllStateVscdb(tmp);
    expect(result).toHaveLength(4);
    const labels = result.map((r) => r.label).sort();
    expect(labels).toEqual([
      'global',
      'workspace-1234567890',
      'workspace-abc-def',
      'workspace-empty-window',
    ]);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('skips workspace dirs that do not actually contain state.vscdb', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cursor-disc-skip-'));
    mkdirSync(join(tmp, 'User', 'workspaceStorage', 'has-db'), { recursive: true });
    writeFileSync(join(tmp, 'User', 'workspaceStorage', 'has-db', 'state.vscdb'), '');
    mkdirSync(join(tmp, 'User', 'workspaceStorage', 'no-db'), { recursive: true });
    const result = discoverAllStateVscdb(tmp);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('workspace-has-db');
    rmSync(tmp, { recursive: true, force: true });
  });

  it('uses injected fs helpers when provided', () => {
    const fakeFs = {
      existsSync: (p: string) => p.includes('workspaceStorage') || p.includes('state.vscdb'),
      readdirSync: () => ['ws1'],
    };
    const result = discoverAllStateVscdb('/fake/root', fakeFs);
    expect(result.map((r) => r.label)).toContain('workspace-ws1');
  });
});

describe('parseArgs', () => {
  it('accepts --name and produces ok=true', () => {
    const r = parseArgs(['--name', 'mine']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.args.name).toBe('mine');
      expect(r.args.redact).toBe(false);
      expect(r.args.src).toBeUndefined();
    }
  });

  it('parses --src and --redact', () => {
    const r = parseArgs(['--name', 'x', '--src', '/p', '--redact']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.args.src).toBe('/p');
      expect(r.args.redact).toBe(true);
    }
  });

  it('rejects with an error when --name is missing', () => {
    const r = parseArgs(['--redact']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('--name');
    }
  });

  it('rejects with an error when --name has no value', () => {
    const r = parseArgs(['--name']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('--name requires a value');
    }
  });

  it('rejects with an error when --src has no value', () => {
    const r = parseArgs(['--name', 'a', '--src']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('--src requires a value');
    }
  });

  it('signals help when --help or -h is passed', () => {
    expect(parseArgs(['--help'])).toMatchObject({ ok: false, help: true });
    expect(parseArgs(['-h'])).toMatchObject({ ok: false, help: true });
  });

  it('rejects unknown arguments', () => {
    const r = parseArgs(['--name', 'x', '--bogus']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('--bogus');
    }
  });
});
