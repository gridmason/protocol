/**
 * Offline bundle verification (docs/SPEC.md §4.5; FR-13) — `verifyOfflineBundle`,
 * the air-gapped path that runs the identical `verifyRelease` chain against a
 * self-contained `.gmb`, against pinned roots only, with no network. Reuses the
 * full online reason set plus two bundle-only archive-integrity classes. Part of
 * the security core: held at 100% coverage (GW-D20 gate).
 */
export {
  verifyOfflineBundle,
  type VerifyBundleInput,
  type VerifyBundleResult,
} from './bundle.js';
export { VERIFY_BUNDLE_REASONS, type VerifyBundleReason } from './reason.js';
