/**
 * Revocation-feed cursor + TTL freshness evaluation (docs/SPEC.md §4.3, §5) — the
 * pure, per-registry load gate with its fail-closed-scoped-to-that-registry rule.
 */
export { evaluateFreshness } from './freshness.js';
export type {
  BlockedArtifact,
  FreshnessVerdict,
  FreshnessVerdictCode,
} from './freshness.js';
