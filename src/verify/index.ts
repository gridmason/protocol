/**
 * The verification library (docs/SPEC.md §5): signature-chain, content-hash,
 * log-inclusion, trust-root, and revocation-freshness checks. Pure and
 * isomorphic — takes bytes + pinned roots + a clock, decides load/no-load, does
 * no I/O. The security core of the platform: held at 100% coverage (GW-D20 gate,
 * see vitest.config.ts).
 *
 * Content hashing (§4.1), dual-signature envelope verification (§4.2),
 * revocation-feed freshness (§4.3), transparency-log proofs (§4.3), trust-root
 * parsing/pinning/rotation (§4.4), the `verifyRelease`/`verifyChunk` orchestration
 * (§5), and offline `.gmb` bundle verification (§4.5) have landed; `negotiate`
 * (§6) is reserved and arrives in P-E4.
 */
export * from './hash/index.js';
export * from './signature/index.js';
export * from './freshness/index.js';
export * from './log/index.js';
export * from './trust/index.js';
export * from './release/index.js';
export * from './bundle/index.js';
