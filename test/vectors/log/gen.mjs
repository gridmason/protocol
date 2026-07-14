// Regenerate the recorded transparency-log fixtures (docs/SPEC.md §4.3). Run with
// `node test/vectors/log/gen.mjs`. Deterministic: a fixed Ed25519 seed and an
// *honest* RFC 6962 prover (tree construction, not the client verifier under
// test) produce Rekor-shaped entries + c2sp signed-note checkpoints. Committing
// the output — not fetching live Rekor — keeps the verify lib pure and its tests
// offline (spec Risks). The private seed lives here only so the fixtures are
// reproducible; it protects nothing (throwaway test key).
//
// The prover here builds proofs bottom-up the way a log does; the lib in
// src/verify/log verifies them the way a client does — genuinely independent
// code paths, so their agreement is real signal.
import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'gridmason.test/log';

// --- deterministic Ed25519 key from a fixed 32-byte seed -------------------
const SEED = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
// PKCS#8 wrapper for a raw Ed25519 seed (RFC 8410): fixed 16-byte prefix + seed.
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const privateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, SEED]),
  format: 'der',
  type: 'pkcs8',
});
// Raw 32-byte public key = last 32 bytes of the SPKI DER encoding.
const PUBLIC_KEY = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);

// --- RFC 6962 honest prover -------------------------------------------------
const sha256 = (buf) => createHash('sha256').update(buf).digest();
const leafHash = (data) => sha256(Buffer.concat([Buffer.from([0x00]), data]));
const nodeHash = (l, r) => sha256(Buffer.concat([Buffer.from([0x01]), l, r]));

/** Largest power of two strictly less than n (n > 1). */
function splitPoint(n) {
  let k = 1;
  while (k << 1 < n) k <<= 1;
  return k;
}

/** Merkle Tree Hash of leaf-hash array D (RFC 6962 §2.1). */
function mth(leaves) {
  if (leaves.length === 1) return leaves[0];
  const k = splitPoint(leaves.length);
  return nodeHash(mth(leaves.slice(0, k)), mth(leaves.slice(k)));
}

/** Inclusion audit path PATH(m, D) for leaf m in tree D. */
function inclusionPath(m, leaves) {
  if (leaves.length === 1) return [];
  const k = splitPoint(leaves.length);
  return m < k
    ? [...inclusionPath(m, leaves.slice(0, k)), mth(leaves.slice(k))]
    : [...inclusionPath(m - k, leaves.slice(k)), mth(leaves.slice(0, k))];
}

/** Consistency proof PROOF(m, D) between the size-m prefix and D (RFC 6962 §2.1.2). */
function consistencyProof(m, leaves) {
  return subproof(m, leaves, true);
}
function subproof(m, leaves, b) {
  if (m === leaves.length) return b ? [] : [mth(leaves)];
  const k = splitPoint(leaves.length);
  return m <= k
    ? [...subproof(m, leaves.slice(0, k), b), mth(leaves.slice(k))]
    : [...subproof(m - k, leaves.slice(k), false), mth(leaves.slice(0, k))];
}

// --- checkpoint (c2sp signed note) ------------------------------------------
function keyId(name, publicKey) {
  return sha256(Buffer.concat([Buffer.from(name, 'utf8'), Buffer.from([0x0a, 0x01]), publicKey])).subarray(0, 4);
}
/**
 * A signed checkpoint note over `origin`, `size`, base64(root). The signature
 * line's key name (which the key id is derived from) is always the pinned
 * `ORIGIN`; `bodyOrigin` overrides only the origin *inside the signed body*, so a
 * validly-signed checkpoint can still name a different log (the origin-mismatch
 * fixture).
 */
function checkpoint(size, root, bodyOrigin = ORIGIN) {
  const body = `${bodyOrigin}\n${size}\n${root.toString('base64')}\n`;
  const signature = sign(null, Buffer.from(body, 'utf8'), privateKey);
  const blob = Buffer.concat([keyId(ORIGIN, PUBLIC_KEY), signature]).toString('base64');
  return `${body}\n— ${ORIGIN} ${blob}\n`;
}

// --- build two logs: an honest one, and a divergent (forked) one ------------
const honest = Array.from({ length: 8 }, (_, i) => leafHash(Buffer.from(`gridmason entry ${i}`, 'utf8')));
const forked = Array.from({ length: 8 }, (_, i) => leafHash(Buffer.from(`evil entry ${i}`, 'utf8')));

const write = (name, value) => {
  writeFileSync(path.join(HERE, name), `${JSON.stringify(value, null, 2)}\n`);
};
const hex = (buf) => Buffer.from(buf).toString('hex');

write('pinned-key.json', { name: ORIGIN, publicKeyHex: hex(PUBLIC_KEY) });

// Inclusion of leaf 3 in the honest tree of size 8.
const INDEX = 3;
const root8 = mth(honest);
const path3 = inclusionPath(INDEX, honest);
const entry = {
  logId: hex(sha256(PUBLIC_KEY)),
  index: INDEX,
  integratedTime: 1_700_000_000,
  canonicalBody: Buffer.from('gridmason entry 3', 'utf8').toString('base64'),
  inclusionProof: {
    treeSize: honest.length,
    rootHash: hex(root8),
    hashes: path3.map(hex),
  },
  checkpoint: checkpoint(honest.length, root8),
};
write('inclusion-valid.json', entry);

// Same entry with the first audit-path node's last byte flipped: a tampered
// inclusion proof whose recomputed root no longer matches the signed root.
const tampered = JSON.parse(JSON.stringify(entry));
const bad = Buffer.from(path3[0]);
bad[bad.length - 1] ^= 0x01;
tampered.inclusionProof.hashes[0] = hex(bad);
write('inclusion-tampered-proof.json', tampered);

// Valid consistency: honest tree grows 5 -> 8.
const root5 = mth(honest.slice(0, 5));
write('consistency-valid.json', {
  oldCheckpoint: checkpoint(5, root5),
  newCheckpoint: checkpoint(8, root8),
  proof: consistencyProof(5, honest).map(hex),
});

// Forked log: two size-8 heads signed by the same key with different roots — the
// unambiguous fork. A same-size consistency proof is empty; the differing roots
// make the two histories provably irreconcilable.
write('consistency-forked.json', {
  oldCheckpoint: checkpoint(8, root8),
  newCheckpoint: checkpoint(8, mth(forked)),
  proof: [],
});

// Two validly-signed checkpoints that name different logs: a consistency proof
// across log boundaries is meaningless and must be refused before any Merkle math.
write('consistency-origin-mismatch.json', {
  oldCheckpoint: checkpoint(5, root5),
  newCheckpoint: checkpoint(8, root8, 'gridmason.test/other'),
  proof: consistencyProof(5, honest).map(hex),
});
