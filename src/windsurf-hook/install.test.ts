import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getWindsurfHooksPath,
  buildWindsurfHookCommand,
  buildWindsurfHookPowershell,
  buildWindsurfHookEntry,
  buildWindsurfHooksConfig,
  isNexpathWindsurfHook,
  writeWindsurfHooks,
  removeWindsurfHooks,
} from './install.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wshooks-'));
  file = join(dir, 'hooks.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = (): any => JSON.parse(readFileSync(file, 'utf8'));

describe('paths + command', () => {
  it('hooks.json lives under ~/.codeium/windsurf', () => {
    expect(getWindsurfHooksPath('/home/u')).toBe('/home/u/.codeium/windsurf/hooks.json');
  });
  it('command embeds absolute node + cli (both quoted, forward-slashed)', () => {
    const cmd = buildWindsurfHookCommand('/abs/dist/cli/index.js', 'pre_user_prompt', '/usr/bin/node');
    expect(cmd).toBe('"/usr/bin/node" "/abs/dist/cli/index.js" windsurf-hook pre_user_prompt');
  });
  it('forward-slashes a Windows node path (sanitized-PATH safety)', () => {
    const cmd = buildWindsurfHookCommand(
      '/abs/cli.js',
      'post_cascade_response',
      'C:\\Program Files\\nodejs\\node.exe',
    );
    expect(cmd).toBe(
      '"C:/Program Files/nodejs/node.exe" "/abs/cli.js" windsurf-hook post_cascade_response',
    );
  });
  it('powershell variant uses the & call operator + native node path (Windows)', () => {
    const ps = buildWindsurfHookPowershell(
      '/abs/cli.js',
      'pre_user_prompt',
      'C:\\Program Files\\nodejs\\node.exe',
    );
    // PowerShell needs `&` to run a quoted executable path; node path stays native.
    expect(ps).toBe('& "C:\\Program Files\\nodejs\\node.exe" "/abs/cli.js" windsurf-hook pre_user_prompt');
  });
  it('hook entry carries BOTH command (bash) and powershell (Windows)', () => {
    const e = buildWindsurfHookEntry('/abs/cli.js', 'post_cascade_response', '/usr/bin/node');
    expect(e.command).toBe('"/usr/bin/node" "/abs/cli.js" windsurf-hook post_cascade_response');
    expect(e.powershell).toBe('& "/usr/bin/node" "/abs/cli.js" windsurf-hook post_cascade_response');
  });
  it('config writes both events with both platform commands', () => {
    const cfg = buildWindsurfHooksConfig('/abs/cli.js');
    expect(cfg.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
    expect(cfg.pre_user_prompt[0].powershell).toContain('& ');
    expect(cfg.pre_user_prompt[0].powershell).toContain('windsurf-hook pre_user_prompt');
    expect(cfg.post_cascade_response[0].command).toContain('windsurf-hook post_cascade_response');
    expect(cfg.post_cascade_response[0].powershell).toContain('windsurf-hook post_cascade_response');
  });
  it('isNexpathWindsurfHook matches our command OR powershell', () => {
    expect(isNexpathWindsurfHook({ command: 'node x windsurf-hook pre_user_prompt' })).toBe(true);
    expect(isNexpathWindsurfHook({ powershell: '& "node" "x" windsurf-hook stop' })).toBe(true);
    expect(isNexpathWindsurfHook({ command: 'python3 audit.py' })).toBe(false);
    expect(isNexpathWindsurfHook({})).toBe(false);
  });
});

describe('writeWindsurfHooks', () => {
  it('creates hooks.json with both nexpath hooks (capture + popup)', () => {
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    expect(d.hooks.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
    expect(d.hooks.post_cascade_response[0].command).toContain('windsurf-hook post_cascade_response');
  });

  it("keeps another tool's post_cascade_response alongside ours", () => {
    writeFileSync(file, JSON.stringify({
      hooks: { post_cascade_response: [{ command: 'python3 audit.py' }] },
    }));
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    expect(d.hooks.post_cascade_response).toHaveLength(2);
    expect(d.hooks.post_cascade_response.some((h: any) => h.command === 'python3 audit.py')).toBe(true);
    expect(d.hooks.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
  });

  it('is idempotent — re-running does not duplicate our entries', () => {
    writeWindsurfHooks(file, '/abs/cli.js');
    writeWindsurfHooks(file, '/abs/cli2.js');
    const d = read();
    expect(d.hooks.pre_user_prompt).toHaveLength(1);
    expect(d.hooks.pre_user_prompt[0].command).toContain('/abs/cli2.js'); // refreshed
  });

  it("preserves other tools' hooks (same + other events)", () => {
    writeFileSync(file, JSON.stringify({
      hooks: {
        pre_user_prompt: [{ command: 'python3 audit.py' }],
        pre_write_code: [{ command: 'node guard.js' }],
      },
    }));
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    // ours appended, the other tool's pre_user_prompt kept
    expect(d.hooks.pre_user_prompt).toHaveLength(2);
    expect(d.hooks.pre_user_prompt.some((h: any) => h.command === 'python3 audit.py')).toBe(true);
    // an unrelated event is untouched
    expect(d.hooks.pre_write_code[0].command).toBe('node guard.js');
  });

  it('preserves unrelated top-level keys in hooks.json', () => {
    writeFileSync(file, JSON.stringify({ version: 1, other: { a: 1 } }));
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    expect(d.version).toBe(1);
    expect(d.other).toEqual({ a: 1 });
  });
});

describe('removeWindsurfHooks', () => {
  it('removes only our entries, keeps others, returns true', () => {
    writeFileSync(file, JSON.stringify({
      hooks: { pre_user_prompt: [{ command: 'python3 audit.py' }] },
    }));
    writeWindsurfHooks(file, '/abs/cli.js'); // adds ours alongside
    const removed = removeWindsurfHooks(file);
    expect(removed).toBe(true);
    const d = read();
    expect(d.hooks.pre_user_prompt).toEqual([{ command: 'python3 audit.py' }]);
    expect(d.hooks.post_cascade_response).toBeUndefined(); // ours-only event dropped
  });

  it('returns false when the file does not exist', () => {
    expect(removeWindsurfHooks(join(dir, 'nope.json'))).toBe(false);
  });

  it('returns false when there are no nexpath hooks to remove', () => {
    writeFileSync(file, JSON.stringify({ hooks: { pre_write_code: [{ command: 'node guard.js' }] } }));
    expect(removeWindsurfHooks(file)).toBe(false);
    expect(read().hooks.pre_write_code[0].command).toBe('node guard.js');
  });
});
