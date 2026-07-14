/**
 * Transparency-log verification (docs/SPEC.md §4.3): RFC 6962 inclusion +
 * consistency proofs checked against a caller-pinned Ed25519 log key
 * (GW-D17). Part of the security core — held at 100% coverage (GW-D20 gate,
 * see vitest.config.ts).
 */
export {
  verifyLogInclusion,
  verifyLogConsistency,
  type LogVerdict,
  type LogVerdictReason,
  type LogConsistencyInput,
  type LogPublicKey,
  type Checkpoint,
} from './log.js';
