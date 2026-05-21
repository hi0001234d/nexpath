import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AgentAdapter, InstallContext } from './types.js';

/**
 * Unit tests for the adapter registry.
 *
 * The registry stores adapters in a module-local mutable array, so tests would
 * leak state into each other if we re-used the same module instance. Each test
 * calls `vi.resetModules()` and re-imports `./registry.js` so it gets a fresh,
 * empty registry.
 */
describe('agents/registry', () => {
  let registerAdapter: typeof import('./registry.js')['registerAdapter'];
  let detectAll: typeof import('./registry.js')['detectAll'];
  let getAdapter: typeof import('./registry.js')['getAdapter'];

  const dummyCtx: InstallContext = {
    home: '/fake/home',
    cwd: '/fake/cwd',
    yes: true,
    dbPath: ':memory:',
  };

  const makeAdapter = (id: string, detectResult: boolean): AgentAdapter => ({
    id,
    label: `Label-${id}`,
    category: 'hook',
    detect: () => detectResult,
    install: async () => ({ status: 'installed' }),
    uninstall: async () => {},
  });

  beforeEach(async () => {
    vi.resetModules();
    const reg = await import('./registry.js');
    registerAdapter = reg.registerAdapter;
    detectAll = reg.detectAll;
    getAdapter = reg.getAdapter;
  });

  describe('registerAdapter + getAdapter', () => {
    it('registers an adapter and retrieves it by id', () => {
      const a = makeAdapter('cursor', true);
      registerAdapter(a);
      expect(getAdapter('cursor')).toBe(a);
    });

    it('returns undefined for an unknown id', () => {
      registerAdapter(makeAdapter('cursor', true));
      expect(getAdapter('nonexistent')).toBeUndefined();
    });

    it('returns undefined when no adapters are registered', () => {
      expect(getAdapter('any')).toBeUndefined();
    });

    it('supports multiple registrations and finds each by its id', () => {
      const a = makeAdapter('a', true);
      const b = makeAdapter('b', true);
      registerAdapter(a);
      registerAdapter(b);
      expect(getAdapter('a')).toBe(a);
      expect(getAdapter('b')).toBe(b);
    });
  });

  describe('detectAll', () => {
    it('returns an empty list when no adapters are registered', async () => {
      const result = await detectAll(dummyCtx);
      expect(result).toEqual([]);
    });

    it('returns only adapters whose detect() returns true', async () => {
      const yes = makeAdapter('yes', true);
      const no = makeAdapter('no', false);
      registerAdapter(yes);
      registerAdapter(no);
      const result = await detectAll(dummyCtx);
      expect(result).toEqual([yes]);
    });

    it('supports async detect() returning a Promise', async () => {
      const yesAsync: AgentAdapter = {
        ...makeAdapter('async-yes', true),
        detect: async () => true,
      };
      const noAsync: AgentAdapter = {
        ...makeAdapter('async-no', false),
        detect: async () => false,
      };
      registerAdapter(yesAsync);
      registerAdapter(noAsync);
      const result = await detectAll(dummyCtx);
      expect(result.map((x) => x.id)).toEqual(['async-yes']);
    });

    it('preserves insertion order across multiple detected adapters', async () => {
      registerAdapter(makeAdapter('a', true));
      registerAdapter(makeAdapter('b', true));
      registerAdapter(makeAdapter('c', true));
      const result = await detectAll(dummyCtx);
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    });

    it('passes the InstallContext through to each adapter.detect()', async () => {
      const detectSpy = vi.fn(() => true);
      const adapter: AgentAdapter = {
        ...makeAdapter('spy', true),
        detect: detectSpy,
      };
      registerAdapter(adapter);
      await detectAll(dummyCtx);
      expect(detectSpy).toHaveBeenCalledWith(dummyCtx);
      expect(detectSpy).toHaveBeenCalledTimes(1);
    });

    it('skips false-detecting adapters while keeping true-detecting ones, regardless of registration order', async () => {
      registerAdapter(makeAdapter('first-no', false));
      registerAdapter(makeAdapter('second-yes', true));
      registerAdapter(makeAdapter('third-no', false));
      registerAdapter(makeAdapter('fourth-yes', true));
      const result = await detectAll(dummyCtx);
      expect(result.map((x) => x.id)).toEqual(['second-yes', 'fourth-yes']);
    });
  });
});
