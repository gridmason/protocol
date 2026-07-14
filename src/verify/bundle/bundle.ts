/**
 * Offline bundle verification (docs/SPEC.md §4.5; FR-13) — the air-gapped
 * counterpart to {@link import('../release/index.js').verifyRelease}. Given a
 * `.gmb` ({@link GmbBundle}) and the operator's out-of-band pinned roots, decide
 * whether the release it carries may load, using **no network whatsoever**:
 * every input the online path fetches piecemeal is sourced from the bundle.
 *
 * The decision is exactly the online chain with one archive-integrity gate in
 * front:
 *
 * 1. **Archive integrity** — recompute the bundle-level content hash over the
 *    canonicalized payload and require it to equal the declared
 *    {@link GmbBundle.contentHash}. This seals the whole archive: any mutation of
 *    a packed byte, the embedded proof, the release map, or the trust root breaks
 *    it. A hash that is not a well-formed `sha2-256:` string — or a payload that
 *    cannot be canonicalized — is `bundle-malformed`; a well-formed hash that
 *    disagrees is `bundle-hash-tampered`.
 * 2. **The identical online chain** — compose {@link
 *    import('../release/index.js').verifyRelease} with the bundle's release,
 *    envelope, embedded log entry, and embedded trust root, checked against the
 *    caller's **pinned** roots (a bundle whose embedded root is not pinned is
 *    refused with the same `trust-root-untrusted` as the online unpinned case) and
 *    caller `now`. Its verdict and every stable reason pass through unchanged.
 *
 * The content-hash gate and the signed chain are defence in depth: a producer who
 * honestly recomputes the content hash over tampered material passes step 1 but is
 * still caught by the cryptographic chain in step 2 (e.g. `log-inclusion-invalid`).
 *
 * Pure and isomorphic like the rest of `src/verify`: no I/O, no key handling; the
 * caller supplies the bundle bytes-as-structure, the pinned roots/keys, and the
 * clock. Held at 100% line/branch coverage (GW-D20 gate).
 */

import { canonicalize } from '../../canon/index.js';
import type { GmbBundle, SignatureSubject } from '../../types/wire/index.js';
import type { MultihashString } from '../hash/index.js';
import { verifyHash } from '../hash/index.js';
import type { LogPublicKey } from '../log/index.js';
import type { TrustRootPin } from '../trust/index.js';
import { verifyRelease } from '../release/index.js';
import type { VerifyBundleReason } from './reason.js';

/**
 * Everything {@link verifyOfflineBundle} needs, all caller-supplied — the lib
 * fetches nothing. The **bundle** is untrusted input (its embedded trust root is
 * believed only when it matches a pin); the **pins**, root **keys**, pinned log
 * checkpoint key, and `now` are the operator's out-of-band trusted material,
 * exactly as {@link import('../release/index.js').VerifyReleaseInput}. The bundle
 * carries the release, envelope, log entry, and trust-root *document*; the pinned
 * key material stays out of band so a bundle can never vouch for itself.
 */
export interface VerifyBundleInput {
  /** The `.gmb` bundle to verify, supplied as parsed structure (no fs, no unarchiving here). */
  readonly bundle: GmbBundle;
  /** The operator's out-of-band pins that authorize the embedded trust-root document. */
  readonly pins: readonly TrustRootPin[];
  /** Pinned publisher CA root public keys (SPKI DER) that may issue publisher leaf certs. */
  readonly publisherCARoots: readonly Uint8Array[];
  /** Pinned registry countersign root public keys (SPKI DER); also the rotation cross-signers. */
  readonly countersignRoots: readonly Uint8Array[];
  /** The pinned transparency-log checkpoint key the embedded inclusion proof is checked against. */
  readonly logPublicKey: LogPublicKey;
  /** Caller-supplied clock, epoch milliseconds (keeps the lib pure). */
  readonly now: number;
}

/**
 * The verdict of {@link verifyOfflineBundle}. The **same shape** as the online
 * {@link import('../release/index.js').VerifyReleaseResult}: on success the
 * `url → hash` map (which a host pairs with the bundle's packed bytes for the
 * per-fetch `verifyChunk` check) plus the verified `issuer` and `subject`; on
 * failure a single stable {@link VerifyBundleReason} (never input-derived, §7).
 */
export type VerifyBundleResult =
  | {
      readonly ok: true;
      /** Every servable URL mapped to its verified content hash — the Service Worker's enforcement table. */
      readonly urlHashes: Map<string, MultihashString>;
      /** The verified OIDC issuer of the publisher. */
      readonly issuer: string;
      /** The signed subject (artifact id + release hash) the signatures cover. */
      readonly subject: SignatureSubject;
    }
  | { readonly ok: false; readonly reason: VerifyBundleReason };

/** Assemble a stable-reason refusal. */
function refuse(reason: VerifyBundleReason): VerifyBundleResult {
  return { ok: false, reason };
}

/**
 * Decide whether an offline `.gmb` bundle may load. Checks the bundle-level
 * content hash, then composes the exact online {@link
 * import('../release/index.js').verifyRelease} chain against the bundle's
 * contents and the caller's pinned roots — no network. Returns the enforceable
 * `url → hash` map on success or a single stable reason on the first failure.
 * Never throws.
 */
export async function verifyOfflineBundle(input: VerifyBundleInput): Promise<VerifyBundleResult> {
  const { bundle } = input;

  // 1. Archive integrity: recompute the seal over the canonicalized payload.
  let payloadBytes: Uint8Array;
  try {
    payloadBytes = canonicalize(bundle.payload);
  } catch {
    return refuse('bundle-malformed');
  }
  const integrity = await verifyHash(payloadBytes, bundle.contentHash);
  if (integrity.reason === 'malformed-hash-string' || integrity.reason === 'unknown-hash-prefix') {
    return refuse('bundle-malformed');
  }
  if (!integrity.ok) return refuse('bundle-hash-tampered');

  // 2. The identical online chain, sourced entirely from the bundle, pinned roots
  //    only, no network. Its verdict and stable reasons pass through unchanged.
  const p = bundle.payload;
  return verifyRelease({
    release: p.release,
    envelope: p.envelope,
    trustRoot: p.trustRoot,
    pins: input.pins,
    publisherCARoots: input.publisherCARoots,
    countersignRoots: input.countersignRoots,
    logEntry: p.logEntry,
    logPublicKey: input.logPublicKey,
    now: input.now,
  });
}
