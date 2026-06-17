import { describe, it, expect } from 'vitest';

import {
  PLATFORM_VALUES,
  DEFAULT_PLATFORM,
  SUPPORTED_CLI_AGENTS,
  SUPPORTED_IDE_AGENTS,
  SUPPORTED_VSCODE_EXT_AGENTS,
  SUPPORTED_BROWSER_AGENTS,
  supportedIdsForPlatform,
  allSupportedIds,
  validatePlatform,
  type SupportedPlatform,
} from './supported-agents-by-platform.js';

describe('PLATFORM_VALUES + DEFAULT_PLATFORM', () => {
  it('lists every SupportedPlatform value exactly once', () => {
    expect([...PLATFORM_VALUES].sort()).toEqual(['browser', 'cli', 'vscode']);
    expect(new Set(PLATFORM_VALUES).size).toBe(PLATFORM_VALUES.length);
  });

  it('defaults to cli', () => {
    expect(DEFAULT_PLATFORM).toBe('cli');
    expect(PLATFORM_VALUES).toContain(DEFAULT_PLATFORM);
  });
});

describe('sub-constants shape', () => {
  const buckets: Array<[string, ReadonlyArray<{ id: string; label: string }>]> = [
    ['SUPPORTED_CLI_AGENTS',         SUPPORTED_CLI_AGENTS],
    ['SUPPORTED_IDE_AGENTS',         SUPPORTED_IDE_AGENTS],
    ['SUPPORTED_VSCODE_EXT_AGENTS',  SUPPORTED_VSCODE_EXT_AGENTS],
    ['SUPPORTED_BROWSER_AGENTS',     SUPPORTED_BROWSER_AGENTS],
  ];

  for (const [name, bucket] of buckets) {
    it(`${name} entries are { id, label } pairs with non-empty strings`, () => {
      for (const a of bucket) {
        expect(typeof a.id).toBe('string');
        expect(a.id.length).toBeGreaterThan(0);
        expect(typeof a.label).toBe('string');
        expect(a.label.length).toBeGreaterThan(0);
      }
    });
  }

  it('cli bucket contains Claude Code today and nothing else', () => {
    expect(SUPPORTED_CLI_AGENTS).toEqual([{ id: 'claude', label: 'Claude Code' }]);
  });

  it('ide, vscodeExt, and browser buckets are empty today', () => {
    expect(SUPPORTED_IDE_AGENTS).toHaveLength(0);
    expect(SUPPORTED_VSCODE_EXT_AGENTS).toHaveLength(0);
    expect(SUPPORTED_BROWSER_AGENTS).toHaveLength(0);
  });

  it('no agent id is duplicated across all four sub-constants', () => {
    const all = [
      ...SUPPORTED_CLI_AGENTS,
      ...SUPPORTED_IDE_AGENTS,
      ...SUPPORTED_VSCODE_EXT_AGENTS,
      ...SUPPORTED_BROWSER_AGENTS,
    ].map((a) => a.id);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('supportedIdsForPlatform', () => {
  it('returns { claude } for cli today', () => {
    expect([...supportedIdsForPlatform('cli')].sort()).toEqual(['claude']);
  });

  it('returns the union of ide + vscodeExt for vscode (empty today)', () => {
    expect(supportedIdsForPlatform('vscode').size).toBe(0);
  });

  it('returns the browser bucket for browser (empty today)', () => {
    expect(supportedIdsForPlatform('browser').size).toBe(0);
  });

  it('returns a fresh Set on each call (caller can mutate without affecting next call)', () => {
    const first = supportedIdsForPlatform('cli') as Set<string>;
    first.add('mutation');
    const second = supportedIdsForPlatform('cli');
    expect(second.has('mutation')).toBe(false);
  });
});

describe('allSupportedIds', () => {
  it('returns the union of every platform bucket', () => {
    expect([...allSupportedIds()].sort()).toEqual(['claude']);
  });

  it('union equals concatenation of per-platform sets (no duplicates lost)', () => {
    const perPlatform = new Set<string>();
    for (const p of PLATFORM_VALUES) {
      for (const id of supportedIdsForPlatform(p)) perPlatform.add(id);
    }
    expect([...allSupportedIds()].sort()).toEqual([...perPlatform].sort());
  });
});

describe('validatePlatform', () => {
  it('accepts each PLATFORM_VALUES entry as-is', () => {
    for (const p of PLATFORM_VALUES) {
      expect(validatePlatform(p)).toBe(p);
    }
  });

  it('returns DEFAULT_PLATFORM when value is undefined', () => {
    expect(validatePlatform(undefined)).toBe(DEFAULT_PLATFORM);
  });

  it('lower-cases incoming value before lookup', () => {
    expect(validatePlatform('CLI')).toBe('cli');
    expect(validatePlatform('VSCode')).toBe('vscode');
    expect(validatePlatform('BROWSER')).toBe('browser');
  });

  it('throws with a friendly message on unknown value', () => {
    expect(() => validatePlatform('garbage')).toThrowError(
      /Invalid --for value "garbage"\. Expected one of: cli, vscode, browser\./,
    );
  });

  it('quotes the original (un-normalised) value in the error message', () => {
    expect(() => validatePlatform('VSCODE-EXT')).toThrowError(/"VSCODE-EXT"/);
  });

  it('rejects empty string', () => {
    expect(() => validatePlatform('')).toThrowError(/Invalid --for value/);
  });

  it('return type narrows to SupportedPlatform', () => {
    const p: SupportedPlatform = validatePlatform('vscode');
    expect(p).toBe('vscode');
  });
});
