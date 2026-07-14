/**
 * The verification library (docs/SPEC.md §5): signature-chain, content-hash,
 * log-inclusion, trust-root, and revocation-freshness checks. Pure and
 * isomorphic — takes bytes + pinned roots + a clock, decides load/no-load, does
 * no I/O. The security core of the platform: held at 100% coverage (GW-D20 gate,
 * see vitest.config.ts).
 *
 * Content hashing (§4.1) has landed; signature/log/trust-root/freshness checks
 * are populated by the P-E3 epic.
 */
export * from './hash/index.js';
