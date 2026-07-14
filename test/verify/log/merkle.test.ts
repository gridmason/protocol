import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  bytesEqual,
  inclusionProofSize,
  leafHash,
  rootFromInclusionProof,
  verifyConsistencyProof,
} from '../../../src/verify/log/merkle.js';

// RFC 6962 Merkle math (docs/SPEC.md §4.3). An independent, in-test *honest*
// prover (builds proofs by constructing the tree, the way a log does) is the
// oracle; the lib under test verifies them the way a client does. Sweeping every
// (size, index) up to nine leaves exercises every audit-path shape — both
// sibling orders, multi-level inner folds, and multiple border nodes — meeting
// the security-core 100% line/branch gate on merkle.ts.

// --- oracle: node:crypto SHA-256, bottom-up tree construction --------------
const sha = (buf: Uint8Array): Uint8Array => new Uint8Array(createHash('sha256').update(buf).digest());
const leaf = (data: Uint8Array): Uint8Array => sha(concat(Uint8Array.of(0x00), data));
const node = (l: Uint8Array, r: Uint8Array): Uint8Array => sha(concat(Uint8Array.of(0x01), l, r));

function concat(...chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Largest power of two strictly less than n (n > 1). */
function splitPoint(n: number): number {
  let k = 1;
  while (k << 1 < n) k <<= 1;
  return k;
}
function mth(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 1) return leaves[0]!;
  const k = splitPoint(leaves.length);
  return node(mth(leaves.slice(0, k)), mth(leaves.slice(k)));
}
function inclusionPath(m: number, leaves: Uint8Array[]): Uint8Array[] {
  if (leaves.length === 1) return [];
  const k = splitPoint(leaves.length);
  return m < k
    ? [...inclusionPath(m, leaves.slice(0, k)), mth(leaves.slice(k))]
    : [...inclusionPath(m - k, leaves.slice(k)), mth(leaves.slice(0, k))];
}
function consistencyProof(m: number, leaves: Uint8Array[]): Uint8Array[] {
  const sub = (m: number, leaves: Uint8Array[], b: boolean): Uint8Array[] => {
    if (m === leaves.length) return b ? [] : [mth(leaves)];
    const k = splitPoint(leaves.length);
    return m <= k
      ? [...sub(m, leaves.slice(0, k), b), mth(leaves.slice(k))]
      : [...sub(m - k, leaves.slice(k), false), mth(leaves.slice(0, k))];
  };
  return sub(m, leaves, true);
}

const treeLeaves = (n: number): Uint8Array[] =>
  Array.from({ length: n }, (_, i) => leaf(new TextEncoder().encode(`leaf ${i}`)));

const MAX = 9;

describe('leafHash', () => {
  it('is SHA-256(0x00 || data)', async () => {
    const data = new TextEncoder().encode('leaf 0');
    expect(bytesEqual(await leafHash(data), leaf(data))).toBe(true);
  });
});

describe('rootFromInclusionProof', () => {
  it('recomputes the signed root for every leaf of every tree up to nine leaves', async () => {
    for (let n = 1; n <= MAX; n++) {
      const leaves = treeLeaves(n);
      const root = mth(leaves);
      for (let m = 0; m < n; m++) {
        const proof = inclusionPath(m, leaves);
        expect(inclusionProofSize(BigInt(m), BigInt(n))).toBe(proof.length);
        const got = await rootFromInclusionProof(BigInt(m), BigInt(n), leaves[m]!, proof);
        expect(bytesEqual(got, root)).toBe(true);
      }
    }
  });

  it('a flipped audit-path node yields a different root', async () => {
    const leaves = treeLeaves(8);
    const proof = inclusionPath(3, leaves);
    const tampered = proof.map((p) => new Uint8Array(p));
    const first = tampered[0]!;
    first[31] = first[31]! ^ 0x01;
    const got = await rootFromInclusionProof(3n, 8n, leaves[3]!, tampered);
    expect(bytesEqual(got, mth(leaves))).toBe(false);
  });
});

describe('verifyConsistencyProof', () => {
  it('accepts an honest proof for every prefix of every tree up to nine leaves', async () => {
    for (let n = 2; n <= MAX; n++) {
      const leaves = treeLeaves(n);
      const root2 = mth(leaves);
      for (let m = 1; m < n; m++) {
        const root1 = mth(leaves.slice(0, m));
        const proof = consistencyProof(m, leaves);
        expect(await verifyConsistencyProof(BigInt(m), BigInt(n), root1, root2, proof)).toBe('ok');
      }
    }
  });

  it('rejects a proof between divergent histories as inconsistent', async () => {
    const honest = treeLeaves(8);
    const forked = Array.from({ length: 8 }, (_, i) => leaf(new TextEncoder().encode(`evil ${i}`)));
    const root1 = mth(honest.slice(0, 5));
    const proof = consistencyProof(5, honest);
    // Honest old root + proof, but a forged size-8 head from the divergent log.
    expect(await verifyConsistencyProof(5n, 8n, root1, mth(forked), proof)).toBe('inconsistent');
  });

  it('rejects a byte-flipped consistency proof as inconsistent', async () => {
    const leaves = treeLeaves(8);
    const proof = consistencyProof(5, leaves).map((p) => new Uint8Array(p));
    const firstNode = proof[0]!;
    firstNode[0] = firstNode[0]! ^ 0x01;
    expect(await verifyConsistencyProof(5n, 8n, mth(leaves.slice(0, 5)), mth(leaves), proof)).toBe(
      'inconsistent',
    );
  });

  it('verifies the power-of-two prefix path (seed taken from the proof)', async () => {
    const leaves = treeLeaves(8);
    // size1 = 4 is an exact power of two: the fold seeds from proof[0], not root1.
    expect(await verifyConsistencyProof(4n, 8n, mth(leaves.slice(0, 4)), mth(leaves), consistencyProof(4, leaves))).toBe(
      'ok',
    );
  });

  describe('edge cases', () => {
    const leaves = treeLeaves(8);
    const root8 = mth(leaves);

    it('a larger old tree than new is a rollback → inconsistent', async () => {
      expect(await verifyConsistencyProof(8n, 5n, root8, mth(leaves.slice(0, 5)), [])).toBe('inconsistent');
    });

    it('equal sizes with equal roots and an empty proof → ok', async () => {
      expect(await verifyConsistencyProof(8n, 8n, root8, root8, [])).toBe('ok');
    });

    it('equal sizes with differing roots → inconsistent (a fork)', async () => {
      const other = mth(Array.from({ length: 8 }, (_, i) => leaf(new TextEncoder().encode(`other ${i}`))));
      expect(await verifyConsistencyProof(8n, 8n, root8, other, [])).toBe('inconsistent');
    });

    it('equal sizes with a non-empty proof → malformed', async () => {
      expect(await verifyConsistencyProof(8n, 8n, root8, root8, [root8])).toBe('malformed');
    });

    it('an empty old tree is consistent with anything, given an empty proof', async () => {
      expect(await verifyConsistencyProof(0n, 8n, new Uint8Array(32), root8, [])).toBe('ok');
    });

    it('an empty old tree with a non-empty proof → malformed', async () => {
      expect(await verifyConsistencyProof(0n, 8n, new Uint8Array(32), root8, [root8])).toBe('malformed');
    });

    it('a wrong-length proof → malformed', async () => {
      const proof = consistencyProof(5, leaves);
      expect(await verifyConsistencyProof(5n, 8n, mth(leaves.slice(0, 5)), root8, proof.slice(1))).toBe(
        'malformed',
      );
    });

    it('a power-of-two prefix with an empty proof → malformed (no seed)', async () => {
      expect(await verifyConsistencyProof(4n, 8n, mth(leaves.slice(0, 4)), root8, [])).toBe('malformed');
    });
  });
});

describe('bytesEqual', () => {
  it('is false for differing lengths and differing content, true for equal', () => {
    expect(bytesEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(false);
    expect(bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 4))).toBe(false);
    expect(bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(true);
  });
});
