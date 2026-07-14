/**
 * RFC 6962 Merkle-tree proof verification (docs/SPEC.md §4.3) — the pure math
 * behind transparency-log inclusion and consistency proofs. Node hashing is
 * `SHA-256`; interior nodes are `HASH(0x01 || left || right)` and leaves are
 * `HASH(0x00 || data)` (RFC 6962 §2.1). This module does the tree arithmetic
 * only — it takes leaf/node hashes and returns a root or a structural verdict;
 * checkpoint signatures and encodings live in `./checkpoint`, orchestration in
 * `./log`.
 *
 * The algorithms are a direct port of the reference RFC 6962 client verifier
 * (the same decomposition Trillian/`transparency-dev/merkle` uses): decompose an
 * index into its inner (audit) and border (right-edge) portions and fold the
 * proof accordingly. Tree sizes and indices are `bigint` so a log larger than
 * 2^32 leaves stays correct — JavaScript's `>>`/`&` are 32-bit, which would
 * silently corrupt the math on a real-world log.
 *
 * Pure and isomorphic: WebCrypto SHA-256, no I/O, no key handling, no clock.
 * Held at 100% line/branch coverage (GW-D20 gate).
 */

/** SHA-256 of `bytes`, via WebCrypto (`globalThis.crypto.subtle`) — isomorphic. */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

/** The RFC 6962 leaf hash `SHA-256(0x00 || data)`. */
export async function leafHash(data: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(LEAF_PREFIX, data));
}

/** The RFC 6962 interior node hash `SHA-256(0x01 || left || right)`. */
async function hashChildren(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(NODE_PREFIX, left, right));
}

const LEAF_PREFIX = Uint8Array.of(0x00);
const NODE_PREFIX = Uint8Array.of(0x01);

/** Concatenate byte chunks into one buffer. */
function concat(...chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Constant-time-ish equality of two byte arrays (length then value). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Position of the highest set bit, i.e. `⌊log2(x)⌋ + 1`; `bitLength(0) === 0`. */
function bitLength(x: bigint): number {
  let n = 0;
  while (x > 0n) {
    x >>= 1n;
    n++;
  }
  return n;
}

/** Count of set bits (population count) of a non-negative bigint. */
function popCount(x: bigint): number {
  let n = 0;
  while (x > 0n) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** Count of trailing zero bits; only called for `x > 0`. */
function trailingZeros(x: bigint): number {
  let n = 0;
  while ((x & 1n) === 0n) {
    x >>= 1n;
    n++;
  }
  return n;
}

/**
 * The exact number of node hashes an inclusion proof for leaf `index` in a tree
 * of `size` leaves must contain (RFC 6962). `index < size` is assumed — the
 * caller range-checks first. Splitting this out lets the caller reject a
 * wrong-length proof as *malformed* before any hashing.
 */
export function inclusionProofSize(index: bigint, size: bigint): number {
  const { inner, border } = decompInclProof(index, size);
  return inner + border;
}

/** The inner (audit-path) and border (right-edge) hash counts for an index. */
function decompInclProof(index: bigint, size: bigint): { inner: number; border: number } {
  const inner = bitLength(index ^ (size - 1n));
  const border = popCount(index >> BigInt(inner));
  return { inner, border };
}

/**
 * Fold the inner portion of a proof into `seed`, choosing sibling order by the
 * bit of `index` at each level (left child when the bit is 0, right when 1).
 */
async function chainInner(
  seed: Uint8Array,
  proof: readonly Uint8Array[],
  index: bigint,
): Promise<Uint8Array> {
  let acc = seed;
  for (let i = 0; i < proof.length; i++) {
    acc =
      ((index >> BigInt(i)) & 1n) === 0n
        ? await hashChildren(acc, proof[i]!)
        : await hashChildren(proof[i]!, acc);
  }
  return acc;
}

/**
 * Like {@link chainInner} but folds only the levels where `index`'s bit is set,
 * always as the right child — the smaller tree's view during a consistency
 * proof (its root sits on the left edge of the corresponding subtrees).
 */
async function chainInnerRight(
  seed: Uint8Array,
  proof: readonly Uint8Array[],
  index: bigint,
): Promise<Uint8Array> {
  let acc = seed;
  for (let i = 0; i < proof.length; i++) {
    if (((index >> BigInt(i)) & 1n) === 1n) acc = await hashChildren(proof[i]!, acc);
  }
  return acc;
}

/** Fold the border portion: each remaining node is a left sibling. */
async function chainBorderRight(seed: Uint8Array, proof: readonly Uint8Array[]): Promise<Uint8Array> {
  let acc = seed;
  for (const p of proof) acc = await hashChildren(p, acc);
  return acc;
}

/**
 * Recompute the Merkle root implied by an inclusion proof. `proof.length` MUST
 * equal {@link inclusionProofSize}`(index, size)` and `index < size` — both are
 * the caller's precondition; this function does the hashing only. The caller
 * compares the returned root against the signed checkpoint root.
 */
export async function rootFromInclusionProof(
  index: bigint,
  size: bigint,
  leaf: Uint8Array,
  proof: readonly Uint8Array[],
): Promise<Uint8Array> {
  const { inner } = decompInclProof(index, size);
  const res = await chainInner(leaf, proof.slice(0, inner), index);
  return chainBorderRight(res, proof.slice(inner));
}

/** Structural outcome of {@link verifyConsistencyProof}. */
export type ConsistencyOutcome = 'ok' | 'malformed' | 'inconsistent';

/**
 * Verify an RFC 6962 consistency proof: that the tree of `size2` leaves (root
 * `root2`) is an append-only extension of the tree of `size1` leaves (root
 * `root1`). A log that forked — presenting two signed heads that cannot both
 * derive from one history — fails here with `'inconsistent'`; a proof of the
 * wrong length or with a mis-sized node hash is `'malformed'`.
 *
 * All node hashes in `proof` MUST be the digest length (32 bytes) — the caller
 * validates that before calling, so a bad-sized hash never reaches the hasher.
 */
export async function verifyConsistencyProof(
  size1: bigint,
  size2: bigint,
  root1: Uint8Array,
  root2: Uint8Array,
  proof: readonly Uint8Array[],
): Promise<ConsistencyOutcome> {
  // A larger "old" tree than "new" is a rollback — never consistent.
  if (size1 > size2) return 'inconsistent';
  // Equal sizes carry no proof; the two heads must then be byte-identical, and a
  // pair that differs is a fork, not a malformed input.
  if (size1 === size2) {
    if (proof.length !== 0) return 'malformed';
    return bytesEqual(root1, root2) ? 'ok' : 'inconsistent';
  }
  // The empty tree is a prefix of every tree; the proof must be empty.
  if (size1 === 0n) return proof.length === 0 ? 'ok' : 'malformed';

  // 0 < size1 < size2.
  const { inner: fullInner, border } = decompInclProof(size1 - 1n, size2);
  const shift = trailingZeros(size1);
  const inner = fullInner - shift;

  // When size1 is an exact power of two its root IS a whole subtree, so it seeds
  // the fold directly and is not repeated in the proof. Otherwise root1 is a
  // compound hash and the shared subtree seed is the proof's first node instead.
  const size1IsPow2 = size1 === 1n << BigInt(shift);
  const seed = size1IsPow2 ? root1 : proof[0];
  const start = size1IsPow2 ? 0 : 1;
  if (seed === undefined || proof.length !== start + inner + border) return 'malformed';

  const rest = proof.slice(start);
  const innerNodes = rest.slice(0, inner);
  const borderNodes = rest.slice(inner);
  const mask = (size1 - 1n) >> BigInt(shift);

  // Rebuild the old root (right-edge fold) and the new root (full fold) from the
  // one shared seed; both must match the signed heads.
  const rebuilt1 = await chainBorderRight(await chainInnerRight(seed, innerNodes, mask), borderNodes);
  if (!bytesEqual(rebuilt1, root1)) return 'inconsistent';
  const rebuilt2 = await chainBorderRight(await chainInner(seed, innerNodes, mask), borderNodes);
  if (!bytesEqual(rebuilt2, root2)) return 'inconsistent';
  return 'ok';
}
