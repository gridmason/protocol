/**
 * Signed revocation-feed authentication (docs/SPEC.md §4.3, §5). Given a feed a
 * registry served wrapped in a detached signature ({@link SignedRevocationFeed})
 * and the pinned countersign roots, decide whether the signature was made by a
 * leaf certificate one of those roots issued, over the canonical bytes of the
 * feed. This is the authentication step the freshness gate assumes has already
 * run: `evaluateFreshness` operates on an already-authenticated feed.
 *
 * Trust semantics are exactly the **countersignature leg** of
 * {@link import('../signature/signature.js').verifySignatureEnvelope}: the same
 * countersign key the registry uses to approve releases signs this feed, so a
 * host pins one countersign root and authenticates both. The cert-path, key
 * import, and signature math are the shared audited primitives in
 * `../signature/ecdsa.js` (WebCrypto ECDSA P-256 / SHA-256), the canonical bytes
 * come from `src/canon` (RFC-8785).
 *
 * Pure and isomorphic: no network, no fs, no private keys, no clock — freshness
 * (TTL / rollback, which take the caller's `now` and cursor) is a separate step
 * (`evaluateFreshness`), not this one. Every refusal is a stable
 * {@link RevocationFeedVerdictReason} — never a free-form string, never a leak of
 * the underlying parser or crypto error (SPEC §7). Held at 100% coverage (GW-D20).
 */

import { canonicalize } from '../../canon/index.js';
import { decodeSignature, importPublicKey, isIssuedByPinnedRoot, parseCert, verifyEcdsa } from '../signature/ecdsa.js';
import type { RevocationFeed, SignedRevocationFeed } from '../../types/wire/revocation.js';

/**
 * Why {@link verifyRevocationFeed} reached its conclusion. Stable across
 * versions — hosts and telemetry switch on these. Every non-`ok` value is a
 * refusal and carries no input-derived identifier (SPEC §7).
 *
 * - `ok`                         — the signature verifies against a pinned root.
 * - `unsupported-signature-alg`  — a signature `alg` other than `ES256`.
 * - `signature-cert-malformed`   — the signature cert is not decodable / not a P-256 key.
 * - `signature-cert-untrusted`   — the signature cert was not issued by any pinned countersign root.
 * - `signature-invalid`          — the signature does not verify over `canonicalize(feed)`.
 */
export type RevocationFeedVerdictReason =
  | 'ok'
  | 'unsupported-signature-alg'
  | 'signature-cert-malformed'
  | 'signature-cert-untrusted'
  | 'signature-invalid';

/**
 * Pinned trust material for authenticating a registry's feed (FR-12). Root entries
 * are **public keys** (`SubjectPublicKeyInfo` DER) — the same countersign roots
 * supplied to the dual-signature envelope check; this module verifies that the
 * signature's leaf certificate was issued by one of them.
 */
export interface RevocationTrustInputs {
  /** Public keys (SPKI DER) of the roots that may issue registry countersign certs. */
  readonly countersignRoots: readonly Uint8Array[];
}

/** The verdict of {@link verifyRevocationFeed}. */
export interface RevocationFeedVerdict {
  /** Machine-readable outcome. */
  readonly reason: RevocationFeedVerdictReason;
  /** Convenience gate: `true` iff `reason === 'ok'`. */
  readonly ok: boolean;
  /**
   * The authenticated feed the caller may now pass to `evaluateFreshness`;
   * present only when `ok`.
   */
  readonly feed?: RevocationFeed;
}

function refuse(reason: Exclude<RevocationFeedVerdictReason, 'ok'>): RevocationFeedVerdict {
  return { reason, ok: false };
}

/**
 * Authenticate a signed revocation feed against the pinned countersign roots.
 * Checks, in order and each with its own stable reason: signature algorithm, the
 * countersign certificate (decodable + P-256 key), that a pinned root issued it,
 * then the signature over `canonicalize(feed)`. Returns `{ ok: true, feed }` only
 * when every link holds; the caller then runs freshness (`evaluateFreshness`).
 */
export async function verifyRevocationFeed(
  signed: SignedRevocationFeed,
  trust: RevocationTrustInputs,
): Promise<RevocationFeedVerdict> {
  const { feed, signature } = signed;

  if (signature.alg !== 'ES256') {
    return refuse('unsupported-signature-alg');
  }

  const cert = parseCert(signature.cert);
  if (cert === undefined) {
    return refuse('signature-cert-malformed');
  }
  const key = await importPublicKey(cert.spki);
  if (key === undefined) {
    return refuse('signature-cert-malformed');
  }
  if (!(await isIssuedByPinnedRoot(cert, trust.countersignRoots))) {
    return refuse('signature-cert-untrusted');
  }

  const sig = decodeSignature(signature.sig);
  const feedBytes = canonicalize(feed);
  if (sig === undefined || !(await verifyEcdsa(key, sig, feedBytes))) {
    return refuse('signature-invalid');
  }

  return { reason: 'ok', ok: true, feed };
}
