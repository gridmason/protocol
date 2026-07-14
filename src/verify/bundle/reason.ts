/**
 * The stable reason set for {@link import('./bundle.js').verifyOfflineBundle}
 * (docs/SPEC.md §4.5, §7). The offline path runs the **identical** chain as the
 * online `verifyRelease` (FR-14), so it reuses every {@link VerifyReleaseReason}
 * verbatim — an unpinned embedded trust root refuses with the same
 * `trust-root-untrusted` a network-delivered unpinned root would, a bad log proof
 * with the same `log-inclusion-invalid`, and so on. Only two failure classes are
 * genuinely new to a bundle: they wrap the archive-integrity gate that runs
 * *before* the chain, and never leak an input-derived identifier (the no-tag-echo
 * rule, SPEC §7 — every value here is a fixed string literal).
 */

import { VERIFY_RELEASE_REASONS, type VerifyReleaseReason } from '../release/index.js';

/**
 * Why {@link import('./bundle.js').verifyOfflineBundle} refused a `.gmb`. The full
 * {@link VerifyReleaseReason} set (reached by composing the online chain against
 * the bundle's contents) plus two bundle-only archive-integrity classes:
 *
 * - `bundle-malformed`      — the bundle-level content hash is not a well-formed
 *                             `sha2-256:<hex>` string, or the payload could not be
 *                             canonicalized — the archive seal cannot even be
 *                             evaluated, so nothing inside is looked at.
 * - `bundle-hash-tampered`  — the payload canonicalizes and the declared content
 *                             hash is well-formed, but they disagree: the archive
 *                             was altered after it was sealed.
 */
export type VerifyBundleReason = VerifyReleaseReason | 'bundle-malformed' | 'bundle-hash-tampered';

/** The two archive-integrity classes unique to the offline bundle path. */
const BUNDLE_ONLY_REASONS = ['bundle-malformed', 'bundle-hash-tampered'] as const;

/**
 * The closed set of every {@link VerifyBundleReason}, frozen — the online release
 * reasons plus the two bundle-only classes. Exported so hosts, telemetry, and the
 * no-tag-echo conformance test can assert a returned reason is a member of this
 * set (and therefore carries no input-derived identifier).
 */
export const VERIFY_BUNDLE_REASONS: readonly VerifyBundleReason[] = Object.freeze([
  ...VERIFY_RELEASE_REASONS,
  ...BUNDLE_ONLY_REASONS,
]);
