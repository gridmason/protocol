/**
 * The public verify orchestration (docs/SPEC.md §5; FR-14) — `verifyRelease` /
 * `verifyChunk` and the canonical stable reason set. The other two members of the
 * §5 API live elsewhere: `evaluateFreshness` (FR-11) in `../freshness`, and
 * `negotiate` (§6) in `../../negotiate` (reserved until its epic lands). Part of
 * the security core: held at 100% coverage (GW-D20 gate).
 */
export {
  verifyRelease,
  verifyChunk,
  type ReleaseDoc,
  type VerifyReleaseInput,
  type VerifyReleaseResult,
} from './release.js';
export { VERIFY_RELEASE_REASONS, type VerifyReleaseReason } from './reason.js';
