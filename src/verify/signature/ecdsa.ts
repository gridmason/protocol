/**
 * The shared ECDSA-P256 / certificate primitives the verify path is built on
 * (docs/SPEC.md §4.2, §7). Both {@link import('./signature.js').verifySignatureEnvelope}
 * (the dual-signature envelope) and
 * {@link import('../revocation/revocation.js').verifyRevocationFeed} (the signed
 * revocation feed) authenticate a detached ES256 signature made by a leaf
 * certificate a pinned root issued — so the cert decode, key import, root-issuance
 * check, and fixed-width signature decode live here once, audited once, rather
 * than duplicated per caller.
 *
 * Signature math is WebCrypto (`globalThis.crypto.subtle`) — ECDSA P-256 /
 * SHA-256, the only algorithm the wire formats declare. No third-party
 * Sigstore/COSE/JWS dependency is pulled: each primitive is one `subtle` call,
 * keeping this — the most-pinned package — at **zero runtime dependencies**
 * (SPEC §7, §8). DER decoding is the in-house minimal decoder in `der.ts`.
 *
 * Pure and isomorphic: no network, no fs, no private keys, no clock. Every
 * structural failure is absorbed into an `undefined`/`false` so the caller maps
 * it to a stable refusal reason and never leaks a parser or crypto error.
 */

import type { LeafCertificate } from './der.js';
import { decodeBase64, parseLeafCertificate } from './der.js';

/** Fixed IEEE-P1363 length of an ECDSA P-256 signature (`r || s`). */
const P256_SIGNATURE_BYTES = 64;

/**
 * The runtime key type WebCrypto's `importKey` yields, derived from the API so
 * this module needs neither the DOM lib nor a `node:crypto` import (it stays
 * isomorphic — see `hash.ts`).
 */
export type PublicKey = Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;

/** Import an ECDSA P-256 public key from SPKI DER, or `undefined` if unusable. */
export async function importPublicKey(spki: Uint8Array): Promise<PublicKey | undefined> {
  try {
    return await globalThis.crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    return undefined;
  }
}

/** Verify an ECDSA-P256/SHA-256 signature (`r || s`) over `message`. */
export async function verifyEcdsa(key: PublicKey, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  return globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, message);
}

/** Whether `cert`'s outer signature was produced by one of the pinned root keys. */
export async function isIssuedByPinnedRoot(cert: LeafCertificate, roots: readonly Uint8Array[]): Promise<boolean> {
  for (const rootSpki of roots) {
    const rootKey = await importPublicKey(rootSpki);
    if (rootKey === undefined) continue;
    if (await verifyEcdsa(rootKey, cert.signature, cert.tbs)) return true;
  }
  return false;
}

/**
 * Decode a base64 DER certificate, or `undefined` on any structural failure.
 * `decodeBase64` and `parseLeafCertificate` throw only {@link import('./der.js').DerError}
 * on malformed input, so absorbing every throw into a stable reason is safe and
 * fail-closed — a certificate we cannot decode is never trusted.
 */
export function parseCert(certBase64: string): LeafCertificate | undefined {
  try {
    return parseLeafCertificate(decodeBase64(certBase64));
  } catch {
    return undefined;
  }
}

/** Decode a base64 P-256 signature, or `undefined` if it is not exactly 64 bytes. */
export function decodeSignature(sigBase64: string): Uint8Array | undefined {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(sigBase64);
  } catch {
    return undefined;
  }
  return bytes.length === P256_SIGNATURE_BYTES ? bytes : undefined;
}
