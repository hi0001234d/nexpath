import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getWindsurfHooksPath,
  buildWindsurfHookCommand,
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
  it('command is absolute `node "<cli>" windsurf-hook <event>` with forward slashes', () => {
    const cmd = buildWindsurfHookCommand('/abs/dist/cli/index.js', 'pre_user_prompt');
    expect(cmd).toBe('node "/abs/dist/cli/index.js" windsurf-hook pre_user_prompt');
  });
  it('config has both events pointing at the cli', () => {
    const cfg = buildWindsurfHooksConfig('/abs/cli.js');
    expect(cfg.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
    expect(cfg.post_cascade_response[0].command).toContain('windsurf-hook post_cascade_response');
  });
  it('isNexpathWindsurfHook matches only our command', () => {
    expect(isNexpathWindsurfHook({ command: 'node x windsurf-hook pre_user_prompt' })).toBe(true);
    expect(isNexpathWindsurfHook({ command: 'python3 audit.py' })).toBe(false);
    expect(isNexpathWindsurfHook({})).toBe(false);
  });
});

describe('writeWindsurfHooks', () => {
  it('creates hooks.json with both nexpath hooks', () => {
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    expect(d.hooks.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
    expect(d.hooks.post_cascade_response[0].command).toContain('windsurf-hook post_cascade_response');
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
