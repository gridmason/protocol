/**
 * Deterministic canonicalization (JCS / RFC-8785) — the exact bytes that get
 * hashed and signed (docs/SPEC.md §4, §7). Part of the security core: held at
 * 100% coverage (GW-D20 gate, see vitest.config.ts).
 */
export {
  canonicalize,
  canonicalizeToString,
  CanonicalizationError,
  type CanonicalizationErrorCode,
} from './canonicalize.js';
