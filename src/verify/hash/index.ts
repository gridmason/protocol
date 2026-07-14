/**
 * Content hashing (docs/SPEC.md §4.1): SHA-256 over exact served bytes, encoded
 * as a multihash-tagged `sha2-256:<hex>` string, plus the signed release
 * `{path → hash}` map type. Part of the security core: held at 100% coverage
 * (GW-D20 gate, see vitest.config.ts).
 */
export {
  hashBytes,
  verifyHash,
  SHA256_MULTIHASH_PREFIX,
  type MultihashString,
  type ReleaseHashMap,
  type HashVerdict,
  type HashVerdictReason,
} from './hash.js';
