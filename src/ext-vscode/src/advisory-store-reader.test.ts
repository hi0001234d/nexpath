import { describe, it, expect, vi } from 'vitest';
import {
  readLatestAdvisory,
  parseJsonStringArray,
  defaultStorePath,
  type ReadAdvisoryRowFn,
} from './advisory-store-reader.js';

describe('parseJsonStringArray', () => {
  it('parses a JSON string-array', () => {
    expect(parseJsonStringArray('["a","b"]')).toEqual(['a', 'b']);
  });
  it('drops non-string members', () => {
    expect(parseJsonStringArray('["a",1,null,"b"]')).toEqual(['a', 'b']);
  });
  it('returns [] for null / undefined / empty / non-string', () => {
    expect(parseJsonStringArray(null)).toEqual([]);
    expect(parseJsonStringArray(undefined)).toEqual([]);
    expect(parseJsonStringArray('')).toEqual([]);
    expect(parseJsonStringArray(42)).toEqual([]);
  });
  it('returns [] for malformed JSON', () => {
    expect(parseJsonStringArray('[not json')).toEqual([]);
  });
  it('returns [] for non-array JSON', () => {
    expect(parseJsonStringArray('{"a":1}')).toEqual([]);
  });
});

describe('defaultStorePath', () => {
  it('points at ~/.nexpath/prompt-store.db (mirrors Layer C DEFAULT_DB_PATH)', () => {
    expect(defaultStorePath('/home/u')).toBe('/home/u/.nexpath/prompt-store.db');
  });
});

describe('readLatestAdvisory', () => {
  const baseRow = {
    project_root: '/proj',
    stage: 'implementation',
    flag_type: 'stage_transition',
    pinch_label: 'Quick check.',
    generated_l1: '["Run the full test suite"]',
    generated_l2: '["Run the changed tests"]',
    generated_l3: '["Smoke-test the happy path"]',
    created_at: 1700000000000,
    status: 'shown',
  };

  it('normalises a row into a StoredAdvisory', async () => {
    const readRow: ReadAdvisoryRowFn = vi.fn().mockResolvedValue(baseRow);
    const out = await readLatestAdvisory('/proj', { readRow, dbPath: '/db' });
    expect(out).toEqual({
      projectRoot: '/proj',
      stage: 'implementation',
      flagType: 'stage_transition',
      pinchLabel: 'Quick check.',
      createdAt: 1700000000000,
      status: 'shown',
      l1: ['Run the full test suite'],
      l2: ['Run the changed tests'],
      l3: ['Smoke-test the happy path'],
    });
    expect(readRow).toHaveBeenCalledWith('/db', '/proj');
  });

  it('returns null when no row exists', async () => {
    const readRow: ReadAdvisoryRowFn = vi.fn().mockResolvedValue(null);
    expect(await readLatestAdvisory('/proj', { readRow })).toBeNull();
  });

  it('returns null when the row has no generated options at any level', async () => {
    const readRow: ReadAdvisoryRowFn = vi.fn().mockResolvedValue({
      ...baseRow,
      generated_l1: null,
      generated_l2: null,
      generated_l3: null,
    });
    expect(await readLatestAdvisory('/proj', { readRow })).toBeNull();
  });

  it('keeps the advisory when only L2/L3 options exist', async () => {
    const readRow: ReadAdvisoryRowFn = vi.fn().mockResolvedValue({
      ...baseRow,
      generated_l1: null,
      generated_l2: '["lighter"]',
      generated_l3: null,
    });
    const out = await readLatestAdvisory('/proj', { readRow });
    expect(out?.l1).toEqual([]);
    expect(out?.l2).toEqual(['lighter']);
  });

  it('coerces a string created_at to a number', async () => {
    const readRow: ReadAdvisoryRowFn = vi.fn().mockResolvedValue({
      ...baseRow,
      created_at: '1700000000001',
    });
    const out = await readLatestAdvisory('/proj', { readRow });
    expect(out?.createdAt).toBe(1700000000001);
  });

  it('never throws when the reader rejects — returns null', async () => {
    const readRow: ReadAdvisoryRowFn = vi.fn().mockRejectedValue(new Error('db locked'));
    await expect(readLatestAdvisory('/proj', { readRow })).resolves.toBeNull();
  });

  it('tolerates missing/odd field types defensively', async () => {
    const readRow: ReadAdvisoryRowFn = vi.fn().mockResolvedValue({
      generated_l1: '["x"]',
      // everything else missing
    });
    const out = await readLatestAdvisory('/proj', { readRow });
    expect(out).toMatchObject({
      projectRoot: '/proj', // falls back to the requested project root
      stage: '',
      flagType: '',
      pinchLabel: '',
      status: '',
      createdAt: 0,
      l1: ['x'],
    });
  });
});
