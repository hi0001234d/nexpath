import { createHash as nodeCreateHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createHash } from './node-crypto.js';

/**
 * The sha256 shim is load-bearing: guidance-fatigue keys and feedback identity
 * hashes flow through it in the browser build. Correctness is pinned two ways:
 * published FIPS 180-4 vectors, and a DIFFERENTIAL sweep against the real
 * node:crypto (the same proof style the TF-IDF browser port used) — if the
 * implementation drifts by a single bit, these fail.
 */
describe('node-crypto shim — sha256 known vectors', () => {
  it('hashes the empty string', () => {
    expect(createHash('sha256').update('').digest('hex'))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc" (single block)', () => {
    expect(createHash('sha256').update('abc').digest('hex'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes the two-block NIST vector', () => {
    expect(createHash('sha256').update('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq').digest('hex'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
});

describe('node-crypto shim — differential parity with real node:crypto', () => {
  const cases = [
    'café — multi-byte UTF-8 ✓',
    'pe-feedback:some-canonical-identity|category|project',
    'a'.repeat(55),   // exactly at the single-block padding boundary
    'a'.repeat(56),   // forces a second padding block
    'a'.repeat(64),   // exact block size
    'a'.repeat(1000), // many blocks
    'line one\nline two\ttabbed \u0000 null-byte',
    '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 surrogate pairs',
  ];

  for (const input of cases) {
    it(`matches node:crypto for ${JSON.stringify(input.slice(0, 24))}… (${input.length} chars)`, () => {
      const expected = nodeCreateHash('sha256').update(input, 'utf8').digest('hex');
      expect(createHash('sha256').update(input).digest('hex')).toBe(expected);
    });
  }

  it('accumulates across multiple update() calls exactly like one concatenated update', () => {
    const chunked = createHash('sha256').update('pe-feedback:').update('identity').digest('hex');
    const whole = nodeCreateHash('sha256').update('pe-feedback:identity', 'utf8').digest('hex');
    expect(chunked).toBe(whole);
  });

  it('matches the engine call shape used by guidance-fatigue (slice of the hex digest)', () => {
    const digest = createHash('sha256').update(['a', 'b'].join(' ')).digest('hex');
    expect(digest).toBe(nodeCreateHash('sha256').update('a b', 'utf8').digest('hex'));
    expect(digest.slice(0, 16)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('node-crypto shim — loud failure outside the supported surface', () => {
  it('rejects unsupported algorithms, encodings, and input types', () => {
    expect(() => createHash('md5')).toThrow(/only sha256/);
    expect(() => createHash('sha256').update('x').digest('base64')).toThrow(/only hex/);
    expect(() => createHash('sha256').update(123 as unknown as string)).toThrow(/only string/);
  });
});
