/**
 * Rotation cross-signature verification (docs/SPEC.md §4.4; FR-12/FR-14) — the one
 * cryptographic check the trust-root leaf deliberately deferred to the
 * orchestrator. During a countersign-root rotation the registry publishes an
 * **overlap** document listing both the outgoing and incoming roots plus a
 * `crossSig`: the outgoing root's signature over the document, binding the
 * incoming root to the one it succeeds. `src/verify/trust` carries `crossSig`
 * through structurally (it has no signature primitive); {@link verifyCrossSig}
 * composes the primitive here so an overlap document is trusted only when the
 * outgoing root actually authorized it.
 *
 * **Signed preimage.** `crossSig` covers the canonical bytes (JCS / RFC-8785,
 * `src/canon`) of the trust-root document **with its own `crossSig` field
 * removed** — a signature can never cover itself. The preimage is derived from the
 * *raw* received document (not the leaf's narrowed view) so it is byte-identical
 * to what the registry signed, regardless of any additional wire fields.
 *
 * **Signer key.** The outgoing root's public key is one of the operator's pinned
 * countersign root keys (supplied out of band as SPKI DER, the same material the
 * dual-signature check uses); `crossSig` is accepted when it verifies under any of
 * them — exactly the "issued by a pinned root" reasoning of `src/verify/signature`.
 *
 * Pure and isomorphic: WebCrypto ECDSA P-256 / SHA-256 only, no I/O, no key
 * handling beyond the caller-supplied pins. Fail-closed — any decode, canonicalize,
 * or verification failure yields `false`, never a throw.
 */

import { canonicalize } from '../../canon/index.js';
import { base64ToBytes } from '../log/encoding.js';

/** Fixed IEEE-P1363 length of an ECDSA P-256 signature (`r || s`). */
const P256_SIGNATURE_BYTES = 64;

/** The runtime key type WebCrypto's `importKey` yields (keeps this module isomorphic). */
type PublicKey = Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;

/**
 * Verify a rotation `crossSig` against the operator's pinned countersign root
 * keys. Returns `true` only when `crossSig` decodes to a P-256 signature and
 * verifies, under at least one pinned root key, over the canonical bytes of
 * `rawTrustRoot` with `crossSig` removed. Any failure — a non-base64 or
 * wrong-length signature, a document that will not canonicalize, or no key that
 * verifies — is a fail-closed `false`.
 */
export async function verifyCrossSig(
  rawTrustRoot: Record<string, unknown>,
  crossSig: string,
  countersignRootKeys: readonly Uint8Array[],
): Promise<boolean> {
  const signature = decodeSignature(crossSig);
  if (signature === undefined) return false;

  const preimage = preimageBytes(rawTrustRoot);
  if (preimage === undefined) return false;

  for (const spki of countersignRootKeys) {
    const key = await importPublicKey(spki);
    if (key !== undefined && (await verifyEcdsa(key, signature, preimage))) return true;
  }
  return false;
}

/** Canonical bytes of the document without its `crossSig` field, or `undefined` if it will not canonicalize. */
function preimageBytes(rawTrustRoot: Record<string, unknown>): Uint8Array | undefined {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawTrustRoot)) {
    if (key !== 'crossSig') rest[key] = value;
  }
  try {
    return canonicalize(rest);
  } catch {
    return undefined;
  }
}

/** Decode a base64 P-256 signature, or `undefined` if it is not exactly 64 bytes. */
function decodeSignature(crossSig: string): Uint8Array | undefined {
  const bytes = base64ToBytes(crossSig);
  if (bytes === undefined || bytes.length !== P256_SIGNATURE_BYTES) return undefined;
  return bytes;
}

/** Import an ECDSA P-256 public key from SPKI DER, or `undefined` if unusable. */
async function importPublicKey(spki: Uint8Array): Promise<PublicKey | undefined> {
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
async function verifyEcdsa(key: PublicKey, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  return globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, message);
}
