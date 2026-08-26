/**
 * Browser build shim for `node:crypto` — ONLY the surface the prompt-enhancement
 * engine actually uses: `createHash('sha256').update(<string>).digest('hex')`
 * (guidance-fatigue.ts:85, feedback-sink.ts:94). Wired in by the
 * `nexpath-node-shims` esbuild plugin (scripts/build-ext.mjs); never imported
 * directly by application code, and never used by the CLI (which gets the real
 * node:crypto).
 *
 * Anything outside that surface throws loudly instead of degrading silently —
 * a future engine change that needs more of node:crypto must FAIL the build/run
 * visibly so the shim is extended deliberately, not papered over.
 *
 * The SHA-256 implementation is the standard FIPS 180-4 algorithm over UTF-8
 * bytes; correctness is pinned by known-vector tests (empty string, "abc", the
 * two-block NIST vector) in node-crypto.test.ts.
 */

/* eslint-disable no-bitwise */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(bytes: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Pad: message + 0x80 + zeros + 64-bit big-endian bit length, to a 64-byte multiple.
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // Bit length as two 32-bit words (message sizes here are far below 2^53 bits).
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }

  let hex = '';
  for (let i = 0; i < 8; i++) hex += h[i]!.toString(16).padStart(8, '0');
  return hex;
}

class Sha256Hash {
  private readonly chunks: Uint8Array[] = [];
  private consumed = false;

  update(data: string): this {
    if (this.consumed) throw new Error('nexpath node-crypto shim: update() after digest() is not supported');
    if (typeof data !== 'string') {
      // The engine only ever hashes strings; widen deliberately if that changes.
      throw new Error('nexpath node-crypto shim: only string input is supported');
    }
    this.chunks.push(new TextEncoder().encode(data));
    return this;
  }

  digest(encoding: string): string {
    if (encoding !== 'hex') throw new Error(`nexpath node-crypto shim: only hex digests are supported (got ${encoding})`);
    this.consumed = true;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const joined = new Uint8Array(total);
    let at = 0;
    for (const c of this.chunks) { joined.set(c, at); at += c.length; }
    return sha256Hex(joined);
  }
}

export function createHash(algorithm: string): Sha256Hash {
  if (algorithm !== 'sha256') {
    throw new Error(`nexpath node-crypto shim: only sha256 is supported (got ${algorithm})`);
  }
  return new Sha256Hash();
}
