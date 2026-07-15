/**
 * Signed revocation-feed authentication (docs/SPEC.md §4.3, §5): verify the
 * detached registry signature over a served feed against the pinned countersign
 * roots — the same trust leg as the release countersignature — before the feed is
 * handed to `evaluateFreshness`. Pure, isomorphic, WebCrypto-only, zero runtime
 * dependencies. Part of the security core: held at 100% coverage (GW-D20 gate).
 */
export {
  verifyRevocationFeed,
  type RevocationFeedVerdict,
  type RevocationFeedVerdictReason,
  type RevocationTrustInputs,
} from './revocation.js';
