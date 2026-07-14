/**
 * The canonical stable reason set for {@link import('./release.js').verifyRelease}
 * (docs/SPEC.md §5, §7; FR-14) and the total, stable mapping from each leaf
 * verifier's reason enum into it.
 *
 * The verify library is composed of five leaf checks (hash, dual-signature, log
 * inclusion, revocation freshness, trust root), each with its own fine-grained
 * reason enum. `verifyRelease` orchestrates four of them, and a host must be able
 * to switch on **one** closed set of outcomes regardless of which leaf refused —
 * so this module collapses the ~35 leaf reasons into one exported
 * {@link VerifyReleaseReason} with a value per **failure class**.
 *
 * **The no-tag-echo rule (SPEC §7).** Every value here is a fixed, compile-time
 * string literal — it can never carry a gated-off or unknown widget's tag,
 * artifact id, issuer, or any other input-derived identifier. The mappings are
 * total (a `Record` keyed by the leaf union, so the compiler rejects an
 * unmapped reason) and stable across versions: hosts render consistent error
 * boundaries and telemetry aggregates cleanly. A reason is opaque and non-leaky
 * by construction.
 */

import type { SignatureVerdictReason } from '../signature/index.js';
import type { LogVerdictReason } from '../log/index.js';
import type { TrustRootParseCode, TrustRootVerdictCode } from '../trust/index.js';

/**
 * Why {@link import('./release.js').verifyRelease} refused a release. One value
 * per failure class, stable across versions, never input-derived (SPEC §7):
 *
 * - `trust-root-malformed`             — the trust-root document did not parse
 *                                        (not an object, malformed/again field,
 *                                        unsupported version, empty roots, bad window).
 * - `trust-root-untrusted`             — no operator pin covers the document's roots
 *                                        (wrong registry, or an unpinned/rotated-past root).
 * - `trust-root-expired`               — a pin matched but `now` is outside the
 *                                        document's `[notBefore, notAfter]` window.
 * - `trust-root-rotation-invalid`      — a rotation-overlap document's `crossSig` is
 *                                        absent or not a valid outgoing-root signature.
 * - `release-malformed`                — the release document could not be canonicalized.
 * - `content-hash-mismatch`            — the release bytes do not hash to the signed subject.
 * - `unsupported-format`               — an envelope format major or signature `alg` this build does not speak.
 * - `publisher-signature-invalid`      — the publisher signature (or its certificate) did not verify.
 * - `publisher-untrusted`              — the publisher certificate was not issued by a pinned CA root.
 * - `publisher-identity-invalid`       — the certificate's OIDC issuer / SAN identity did not bind.
 * - `issuer-not-allowlisted`           — the attested issuer is not on the trust root's allowlist.
 * - `registry-countersignature-missing`— the release is not yet registry-approved (no countersignature).
 * - `registry-countersignature-invalid`— the registry countersignature (or its certificate) did not verify.
 * - `log-inclusion-mismatch`           — the supplied log entry is not the one the envelope names.
 * - `log-inclusion-invalid`            — the inclusion proof did not verify against the pinned checkpoint.
 * - `log-forked`                       — a consistency proof showed the log was not append-only.
 */
export type VerifyReleaseReason =
  | 'trust-root-malformed'
  | 'trust-root-untrusted'
  | 'trust-root-expired'
  | 'trust-root-rotation-invalid'
  | 'release-malformed'
  | 'content-hash-mismatch'
  | 'unsupported-format'
  | 'publisher-signature-invalid'
  | 'publisher-untrusted'
  | 'publisher-identity-invalid'
  | 'issuer-not-allowlisted'
  | 'registry-countersignature-missing'
  | 'registry-countersignature-invalid'
  | 'log-inclusion-mismatch'
  | 'log-inclusion-invalid'
  | 'log-forked';

/**
 * The closed set of every {@link VerifyReleaseReason}, frozen. Exported so hosts,
 * telemetry, and the no-tag-echo conformance test can assert a returned reason is
 * a member of this set (and therefore carries no input-derived identifier).
 */
export const VERIFY_RELEASE_REASONS: readonly VerifyReleaseReason[] = Object.freeze([
  'trust-root-malformed',
  'trust-root-untrusted',
  'trust-root-expired',
  'trust-root-rotation-invalid',
  'release-malformed',
  'content-hash-mismatch',
  'unsupported-format',
  'publisher-signature-invalid',
  'publisher-untrusted',
  'publisher-identity-invalid',
  'issuer-not-allowlisted',
  'registry-countersignature-missing',
  'registry-countersignature-invalid',
  'log-inclusion-mismatch',
  'log-inclusion-invalid',
  'log-forked',
]);

/**
 * Dual-signature reasons → canonical classes. Certificate-malformed folds into the
 * matching signature-invalid class (an undecodable cert is a signature that cannot
 * verify); issuer/identity binding failures share one identity class; the
 * publisher and registry classes stay distinct so a not-yet-approved release never
 * looks like a tampered one.
 */
const SIGNATURE_REASON: Record<Exclude<SignatureVerdictReason, 'ok'>, VerifyReleaseReason> = {
  'unsupported-format-version': 'unsupported-format',
  'unsupported-signature-alg': 'unsupported-format',
  'subject-hash-mismatch': 'content-hash-mismatch',
  'publisher-cert-malformed': 'publisher-signature-invalid',
  'publisher-cert-untrusted': 'publisher-untrusted',
  'publisher-cert-missing-identity': 'publisher-identity-invalid',
  'publisher-issuer-mismatch': 'publisher-identity-invalid',
  'publisher-issuer-not-allowlisted': 'issuer-not-allowlisted',
  'publisher-identity-mismatch': 'publisher-identity-invalid',
  'publisher-signature-invalid': 'publisher-signature-invalid',
  'registry-signature-missing': 'registry-countersignature-missing',
  'registry-cert-malformed': 'registry-countersignature-invalid',
  'registry-cert-untrusted': 'registry-countersignature-invalid',
  'registry-signature-invalid': 'registry-countersignature-invalid',
};

/**
 * Log reasons → canonical classes. Every inclusion / checkpoint failure is a
 * single `log-inclusion-invalid` class (a host reacts the same way to any of
 * them); the three consistency-proof failures form the distinct `log-forked`
 * class. Consistency reasons are unreachable from `verifyRelease` (which checks
 * inclusion only) but are mapped for completeness so any conforming consumer of a
 * {@link LogVerdictReason} lands in this closed set.
 */
const LOG_REASON: Record<Exclude<LogVerdictReason, 'ok'>, VerifyReleaseReason> = {
  'malformed-checkpoint': 'log-inclusion-invalid',
  'unsupported-key-algorithm': 'log-inclusion-invalid',
  'checkpoint-key-mismatch': 'log-inclusion-invalid',
  'checkpoint-signature-invalid': 'log-inclusion-invalid',
  'checkpoint-mismatch': 'log-inclusion-invalid',
  'malformed-entry': 'log-inclusion-invalid',
  'index-out-of-range': 'log-inclusion-invalid',
  'malformed-inclusion-proof': 'log-inclusion-invalid',
  'inclusion-proof-invalid': 'log-inclusion-invalid',
  'checkpoint-origin-mismatch': 'log-forked',
  'malformed-consistency-proof': 'log-forked',
  'consistency-proof-invalid': 'log-forked',
};

/** Trust-root parse failures → the single `trust-root-malformed` class. */
const TRUST_PARSE_REASON: Record<TrustRootParseCode, VerifyReleaseReason> = {
  'not-an-object': 'trust-root-malformed',
  'malformed-field': 'trust-root-malformed',
  'unsupported-format-version': 'trust-root-malformed',
  'empty-countersign-roots': 'trust-root-malformed',
  'invalid-validity-window': 'trust-root-malformed',
};

/**
 * Trust-root verdict failures → canonical classes: pinning failures collapse to
 * `trust-root-untrusted`, validity-window failures to `trust-root-expired`.
 */
const TRUST_VERDICT_REASON: Record<Exclude<TrustRootVerdictCode, 'trusted'>, VerifyReleaseReason> = {
  'registry-mismatch': 'trust-root-untrusted',
  unpinned: 'trust-root-untrusted',
  'not-yet-valid': 'trust-root-expired',
  expired: 'trust-root-expired',
};

/** Map a dual-signature refusal to its canonical class. */
export function signatureReason(reason: Exclude<SignatureVerdictReason, 'ok'>): VerifyReleaseReason {
  return SIGNATURE_REASON[reason];
}

/** Map a transparency-log refusal to its canonical class. */
export function logReason(reason: Exclude<LogVerdictReason, 'ok'>): VerifyReleaseReason {
  return LOG_REASON[reason];
}

/** Map a trust-root parse failure to its canonical class. */
export function trustParseReason(reason: TrustRootParseCode): VerifyReleaseReason {
  return TRUST_PARSE_REASON[reason];
}

/** Map a trust-root verdict failure to its canonical class. */
export function trustVerdictReason(reason: Exclude<TrustRootVerdictCode, 'trusted'>): VerifyReleaseReason {
  return TRUST_VERDICT_REASON[reason];
}
