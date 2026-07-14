/**
 * Content-hash **wire-format** conformance vectors (docs/SPEC.md §4.1, §7; FR-15
 * — wire portion, P-E2). These exercise the verdict path
 * ({@link import('../verify/hash/hash.js').verifyHash}, and
 * {@link import('../verify/hash/hash.js').hashBytes} for the positive digest)
 * against an untrusted `expected` string, pinning the four stable
 * {@link import('../verify/hash/hash.js').HashVerdictReason} outcomes.
 *
 * The load-bearing negative is `hash-mismatch`: the positive canonical bytes
 * with a **single byte flipped** carry the *original* (untampered) hash as
 * `expected`, so a conforming implementation MUST refuse them. A consumer whose
 * runner "passes" that tampered vector fails its build (SPEC §6, §7).
 *
 * The positive input is the canonical bytes of a document, so this vector set
 * also exercises the canonicalize → hash composition end to end (the two halves
 * of the signed byte path). All digests were generated with WebCrypto SHA-256
 * and are re-derived by the implementation under test.
 */

import type { HashWireVector } from './types.js';

// Canonical bytes of {"deps":["a","b"],"version":"1.2.0","widget":"clock"} — the
// canonicalize → hash composition input. `goodDigest` is its SHA-256.
const canonBytesHex =
  '7b2264657073223a5b2261222c2262225d2c2276657273696f6e223a22312e322e30222c22776964676574223a22636c6f636b227d';
const goodDigest = 'sha2-256:ad7facfb65e054ce6429934100cfe3e080970f4cb4820a9d10fe45903f2f3dbb';
// The same bytes with the final `}` (0x7d) flipped to `|` (0x7c).
const tamperedHex =
  '7b2264657073223a5b2261222c2262225d2c2276657273696f6e223a22312e322e30222c22776964676574223a22636c6f636b227c';

/**
 * bytes → expected-hash → required verdict reason. `inputHex` decodes to the
 * bytes hashed; `expected` is the untrusted hash string checked against them.
 */
export const hashWireVectors: readonly HashWireVector[] = [
  // --- positives: correct sha2-256 for the given bytes -> ok ---
  {
    name: 'canonical document bytes hash to their sha2-256 digest',
    inputHex: canonBytesHex,
    expected: goodDigest,
    reason: 'ok',
    note: 'canonicalize → hash composition; hashBytes must equal expected',
  },
  {
    name: 'raw non-UTF-8 bytes hash to their sha2-256 digest',
    inputHex: 'deadbeef',
    expected: 'sha2-256:5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953',
    reason: 'ok',
  },
  // --- tampered: one byte flipped, but expected is the ORIGINAL hash -> mismatch ---
  {
    name: 'byte-flipped payload against the original hash is refused',
    inputHex: tamperedHex,
    expected: goodDigest,
    reason: 'hash-mismatch',
    note: 'the load-bearing negative — a passing consumer fails its build',
  },
  // --- unknown prefix: a tagged algorithm we do not implement -> refuse, never guess ---
  {
    name: 'a sha3-256 tagged hash is refused, not guessed',
    inputHex: canonBytesHex,
    expected: 'sha3-256:ad7facfb65e054ce6429934100cfe3e080970f4cb4820a9d10fe45903f2f3dbb',
    reason: 'unknown-hash-prefix',
  },
  // --- malformed: not <algo>:<hex>, or sha2-256 with a bad digest ---
  {
    name: 'a bare digest with no algorithm tag is malformed',
    inputHex: canonBytesHex,
    expected: 'ad7facfb65e054ce6429934100cfe3e080970f4cb4820a9d10fe45903f2f3dbb',
    reason: 'malformed-hash-string',
  },
  {
    name: 'a sha2-256 tag with a too-short digest is malformed',
    inputHex: canonBytesHex,
    expected: 'sha2-256:ad7facfb',
    reason: 'malformed-hash-string',
  },
  {
    name: 'a sha2-256 tag with uppercase (non-lowercase) hex is malformed',
    inputHex: canonBytesHex,
    expected: 'sha2-256:AD7FACFB65E054CE6429934100CFE3E080970F4CB4820A9D10FE45903F2F3DBB',
    reason: 'malformed-hash-string',
  },
];
