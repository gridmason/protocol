/**
 * The verification library (docs/SPEC.md §5): signature-chain, content-hash,
 * log-inclusion, trust-root, and revocation-freshness checks. Pure and
 * isomorphic — takes bytes + pinned roots + a clock, decides load/no-load, does
 * no I/O. The security core of the platform: held at 100% coverage (GW-D20 gate,
 * see vitest.config.ts).
 *
 * Content hashing (§4.1), revocation-feed freshness (§4.3), transparency-log
 * proofs (§4.3), and trust-root parsing/pinning/rotation (§4.4) have landed; the
 * signature checks are populated by the rest of the P-E3 epic.
 */
export * from './hash/index.js';
export * from './freshness/index.js';
export * from './log/index.js';
export * from './trust/index.js';
