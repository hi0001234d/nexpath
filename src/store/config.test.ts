import { describe, expect, it } from 'vitest';
import { closeStore, openStore } from './db.js';
import { getConfig } from './config.js';

describe('getConfig', () => {
  it('does not treat inherited object properties as built-in defaults', async () => {
    const store = await openStore(':memory:');

    try {
      expect(getConfig(store.db, 'toString')).toBeUndefined();
      expect(getConfig(store.db, 'constructor')).toBeUndefined();
      expect(getConfig(store.db, '__proto__')).toBeUndefined();
    } finally {
      closeStore(store);
    }
  });

  it('still returns a defined default when the key is missing from storage', async () => {
    const store = await openStore(':memory:');

    try {
      expect(getConfig(store.db, 'prompt_capture_enabled')).toBe('true');
    } finally {
      closeStore(store);
    }
  });
});
