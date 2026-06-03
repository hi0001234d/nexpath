import { describe, it, expect } from 'vitest';
import { openStore } from '../../store/index.js';
import { getConfig } from '../../store/config.js';
import {
  ConfigValidationError,
  VALID_ROLES,
  VALID_ADVISORY_FREQUENCY_LEVELS,
  setAdvisoryFrequency,
  setRole,
} from './config-setters.js';

describe('setAdvisoryFrequency', () => {
  it.each(VALID_ADVISORY_FREQUENCY_LEVELS)('accepts and persists the valid level "%s"', async (level) => {
    const store = await openStore(':memory:');
    try {
      setAdvisoryFrequency(store, 'advisory_frequency', level);
      expect(getConfig(store.db, 'advisory_frequency')).toBe(level);
    } finally {
      store.db.close();
    }
  });

  it('accepts an empty string and persists it (legacy unset semantics)', async () => {
    const store = await openStore(':memory:');
    try {
      setAdvisoryFrequency(store, 'advisory_frequency', '');
      expect(getConfig(store.db, 'advisory_frequency')).toBe('');
    } finally {
      store.db.close();
    }
  });

  it('accepts and persists at a project-scoped key', async () => {
    const store = await openStore(':memory:');
    try {
      setAdvisoryFrequency(store, 'advisory_frequency:/some/project', 'optimum');
      expect(getConfig(store.db, 'advisory_frequency:/some/project')).toBe('optimum');
    } finally {
      store.db.close();
    }
  });

  it('throws ConfigValidationError for an invalid value', async () => {
    const store = await openStore(':memory:');
    try {
      expect(() => setAdvisoryFrequency(store, 'advisory_frequency', 'always')).toThrow(ConfigValidationError);
      expect(getConfig(store.db, 'advisory_frequency')).toBeUndefined();
    } finally {
      store.db.close();
    }
  });

  it('error message lists every valid level', async () => {
    const store = await openStore(':memory:');
    try {
      try {
        setAdvisoryFrequency(store, 'advisory_frequency', 'always');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigValidationError);
        const msg = (err as Error).message;
        for (const level of VALID_ADVISORY_FREQUENCY_LEVELS) {
          expect(msg).toContain(level);
        }
      }
    } finally {
      store.db.close();
    }
  });
});

describe('setRole', () => {
  it.each(VALID_ROLES)('accepts and persists the valid role "%s"', async (role) => {
    const store = await openStore(':memory:');
    try {
      setRole(store, 'role', role);
      expect(getConfig(store.db, 'role')).toBe(role);
    } finally {
      store.db.close();
    }
  });

  it('accepts an empty string and persists it (legacy unset semantics)', async () => {
    const store = await openStore(':memory:');
    try {
      setRole(store, 'role', '');
      expect(getConfig(store.db, 'role')).toBe('');
    } finally {
      store.db.close();
    }
  });

  it('accepts and persists at a project-scoped key', async () => {
    const store = await openStore(':memory:');
    try {
      setRole(store, 'role:/some/project', 'vibe_coder');
      expect(getConfig(store.db, 'role:/some/project')).toBe('vibe_coder');
    } finally {
      store.db.close();
    }
  });

  it('throws ConfigValidationError for an invalid role', async () => {
    const store = await openStore(':memory:');
    try {
      expect(() => setRole(store, 'role', 'developer')).toThrow(ConfigValidationError);
      expect(getConfig(store.db, 'role')).toBeUndefined();
    } finally {
      store.db.close();
    }
  });

  it('error message lists every valid role', async () => {
    const store = await openStore(':memory:');
    try {
      try {
        setRole(store, 'role', 'developer');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigValidationError);
        const msg = (err as Error).message;
        for (const role of VALID_ROLES) {
          expect(msg).toContain(role);
        }
      }
    } finally {
      store.db.close();
    }
  });
});
