/**
 * The verification library (docs/SPEC.md §5): signature-chain, content-hash,
 * log-inclusion, trust-root, and revocation-freshness checks. Pure and
 * isomorphic — takes bytes + pinned roots + a clock, decides load/no-load, does
 * no I/O. The security core of the platform: held at 100% coverage (GW-D20 gate,
 * see vitest.config.ts).
 *
 * Content hashing (§4.1) and dual-signature envelope verification (§4.2) have
 * landed; log/trust-root/freshness checks are populated by the rest of P-E3/P-E4.
 */
export * from './hash/index.js';
export * from './signature/index.js';
