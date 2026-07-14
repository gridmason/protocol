/**
 * Canonicalization **wire-format** conformance vectors (docs/SPEC.md §4, §7;
 * FR-15 — wire portion, P-E2). These pin the exact canonical byte sequence a
 * conforming {@link import('../canon/canonicalize.js').canonicalize} must emit —
 * the bytes a publisher signs and a verifier reconstructs.
 *
 * Two kinds, both driven through `canonicalize` in the runner:
 *
 * - {@link canonWireVectors} — a JSON value paired with its exact canonical bytes
 *   (hex-encoded so the fixture pins the wire form byte-for-byte, independent of
 *   any string round-trip). Covers key sorting, RFC-8785 number formatting, and
 *   literal non-ASCII UTF-8.
 * - {@link canonMalleabilityVectors} — several source JSON *texts* (key-order and
 *   insignificant-whitespace variants, escape spellings) that must all parse and
 *   canonicalize to one identical byte sequence. This is the malleability guard:
 *   inputs that differ only in presentation collapse to the same signed bytes, so
 *   a signature cannot be replayed against a re-spelled payload.
 *
 * Byte-hex fixtures were generated from the canonical string (UTF-8) and are
 * re-derived by `canonicalize` in the test, so a divergent implementation fails.
 */

import type { CanonMalleabilityVector, CanonWireVector } from './types.js';

/**
 * Positive value → exact canonical bytes. `canonicalHex` is the lowercase-hex
 * UTF-8 encoding of the RFC-8785 canonical form of `value`.
 */
export const canonWireVectors: readonly CanonWireVector[] = [
  {
    name: 'unsorted keys + literal non-ASCII UTF-8',
    value: { z: true, a: 1, m: 'café' },
    // {"a":1,"m":"café","z":true} — keys UTF-16 sorted, é emitted as UTF-8 c3 a9
    canonicalHex: '7b2261223a312c226d223a22636166c3a9222c227a223a747275657d',
  },
  {
    name: 'RFC-8785 number formatting (1e30, 0.002, -0, 4.50)',
    value: { nums: [1e30, 0.002, -0, 4.5] },
    // {"nums":[1e+30,0.002,0,4.5]} — Number::toString: -0 → 0, 4.50 → 4.5
    canonicalHex: '7b226e756d73223a5b31652b33302c302e3030322c302c342e355d7d',
  },
  {
    name: 'nested object + array with sorted keys',
    value: { outer: { b: [3, 2, 1], a: null }, id: 'x' },
    // {"id":"x","outer":{"a":null,"b":[3,2,1]}} — array order preserved, keys sorted
    canonicalHex: '7b226964223a2278222c226f75746572223a7b2261223a6e756c6c2c2262223a5b332c322c315d7d7d',
  },
];

/**
 * Malleability guards: every `jsonVariants` entry, once `JSON.parse`d and
 * canonicalized, must produce the single byte sequence `canonicalHex`.
 */
export const canonMalleabilityVectors: readonly CanonMalleabilityVector[] = [
  {
    name: 'key order and insignificant whitespace collapse to one form',
    jsonVariants: ['{"b":2,"a":1}', '{ "a": 1, "b": 2 }', '{\n  "b": 2,\n  "a": 1\n}', '{"a":1,"b":2}'],
    // {"a":1,"b":2}
    canonicalHex: '7b2261223a312c2262223a327d',
  },
  {
    name: 'unicode escape spelling normalizes to one form',
    jsonVariants: ['{"k":"\\u0041"}', '{"k":"A"}', '{ "k" : "A" }'],
    // {"k":"A"}
    canonicalHex: '7b226b223a2241227d',
  },
];
