/**
 * Dual-signature envelope verification (docs/SPEC.md §4.2, §5; FR-9). Given a
 * signature envelope, the exact canonical release bytes it covers, and the pinned
 * trust inputs (issuer allowlist + root public keys), decide whether both the
 * publisher (Sigstore keyless) and registry (countersign) signatures hold and the
 * subject binds the actual release bytes.
 *
 * The publisher trust chain is: a pinned Fulcio-style **CA root** issues the
 * short-lived leaf certificate → the leaf attests an **OIDC issuer + identity**
 * in its extensions → the leaf's key signs the release subject. The verifier
 * checks every link — a valid signature under a certificate that no pinned root
 * issued, or that attests an issuer off the allowlist, is refused. The OIDC
 * issuer is the trust anchor for the publisher side (SPEC §4.2). The registry
 * countersignature is verified against separately-pinned countersign roots and is
 * bound to the exact publisher signature it approved.
 *
 * Signature math is WebCrypto (`globalThis.crypto.subtle`) — ECDSA P-256 /
 * SHA-256 (`ES256`), the algorithm the envelope declares. No third-party
 * Sigstore/COSE/JWS dependency is pulled: the primitive is one `subtle.verify`
 * call, exactly the reasoning the in-house SHA-256 hasher (#13) used, and it keeps
 * this — the most-pinned package — at **zero runtime dependencies** (SPEC §7, §8).
 *
 * Pure and isomorphic: no network, no fs, no private keys, no clock. Every
 * refusal is a stable {@link SignatureVerdictReason} — never a free-form string,
 * never a leak of the underlying parser or crypto error (SPEC §7).
 */

import { canonicalize } from '../../canon/index.js';
import type { CertIdentity } from './der.js';
import { decodeSignature, importPublicKey, isIssuedByPinnedRoot, parseCert, verifyEcdsa } from './ecdsa.js';
import { verifyHash } from '../hash/index.js';
import type { SignatureEnvelope, SignatureSubject } from '../../types/wire/signature.js';

/** The format major this module speaks; a differing major is refused. */
export const SIGNATURE_FORMAT_MAJOR = 1;

/**
 * Why {@link verifySignatureEnvelope} reached its conclusion. Stable across
 * versions — hosts and telemetry switch on these. Every non-`ok` value is a
 * refusal; the publisher and registry classes are kept distinct so a not-yet-
 * approved release (`registry-signature-missing`) never looks like a tampered one.
 *
 * - `ok`                              — both signatures + subject/hash verified.
 * - `unsupported-format-version`      — envelope major this build does not speak.
 * - `unsupported-signature-alg`       — a signature `alg` other than `ES256`.
 * - `subject-hash-mismatch`           — `subject.releaseHash` ≠ hash(releaseBytes).
 * - `publisher-cert-malformed`        — publisher cert not decodable / not a P-256 key.
 * - `publisher-cert-untrusted`        — leaf not issued by any pinned publisher CA root.
 * - `publisher-cert-missing-identity` — leaf carries no OIDC issuer or no SAN identity.
 * - `publisher-issuer-mismatch`       — envelope `issuer` ≠ the issuer the cert attests.
 * - `publisher-issuer-not-allowlisted`— attested issuer not on the trust-root allowlist.
 * - `publisher-identity-mismatch`     — envelope `subjectClaims` ≠ the cert's SAN identity.
 * - `publisher-signature-invalid`     — publisher signature does not verify.
 * - `registry-signature-missing`      — no countersignature (not yet approved).
 * - `registry-cert-malformed`         — countersign cert not decodable / not a P-256 key.
 * - `registry-cert-untrusted`         — countersign cert not issued by any countersign root.
 * - `registry-signature-invalid`      — countersignature does not verify.
 */
export type SignatureVerdictReason =
  | 'ok'
  | 'unsupported-format-version'
  | 'unsupported-signature-alg'
  | 'subject-hash-mismatch'
  | 'publisher-cert-malformed'
  | 'publisher-cert-untrusted'
  | 'publisher-cert-missing-identity'
  | 'publisher-issuer-mismatch'
  | 'publisher-issuer-not-allowlisted'
  | 'publisher-identity-mismatch'
  | 'publisher-signature-invalid'
  | 'registry-signature-missing'
  | 'registry-cert-malformed'
  | 'registry-cert-untrusted'
  | 'registry-signature-invalid';

/**
 * Pinned trust material for one registry, supplied by the trust-root layer
 * (FR-12). Root entries are **public keys** (`SubjectPublicKeyInfo` DER) — this
 * module verifies that a leaf certificate's signature was produced by one of
 * them, so it never parses root certificates itself.
 */
export interface SignatureTrustInputs {
  /** OIDC issuers the registry accepts for publisher identity (§4.4). */
  readonly issuerAllowlist: readonly string[];
  /** Public keys (SPKI DER) of the roots that may issue publisher leaf certs. */
  readonly publisherCARoots: readonly Uint8Array[];
  /** Public keys (SPKI DER) of the roots that may issue registry countersign certs. */
  readonly countersignRoots: readonly Uint8Array[];
}

/** Input to {@link verifySignatureEnvelope}. */
export interface VerifySignatureInput {
  /** The detached dual-signature envelope. */
  readonly envelope: SignatureEnvelope;
  /**
   * The exact canonical bytes of the release document the envelope covers (the
   * caller produces these with `src/canon`; the lib re-derives the hash and
   * compares to `subject.releaseHash`, never fetching or re-canonicalizing).
   */
  readonly releaseBytes: Uint8Array;
  /** Pinned trust material for the issuing registry. */
  readonly trust: SignatureTrustInputs;
}

/** The verdict of {@link verifySignatureEnvelope}. */
export interface SignatureVerdict {
  /** Machine-readable outcome. */
  readonly reason: SignatureVerdictReason;
  /** Convenience gate: `true` iff `reason === 'ok'`. */
  readonly ok: boolean;
  /** The subject the signatures cover; present only when `ok`. */
  readonly subject?: SignatureSubject;
  /** The verified OIDC issuer; present only when `ok`. */
  readonly issuer?: string;
  /** The verified publisher identity from the certificate SAN; present only when `ok`. */
  readonly identity?: CertIdentity;
}

function refuse(reason: Exclude<SignatureVerdictReason, 'ok'>): SignatureVerdict {
  return { reason, ok: false };
}

/** Major component of a `major.minor` version string, or `undefined` if malformed. */
function parseMajor(formatVersion: string): number | undefined {
  const match = /^(\d+)\.\d+$/.exec(formatVersion);
  return match ? Number(match[1]) : undefined;
}

/**
 * Verify a dual-signature envelope. Checks, in order and each with its own stable
 * reason: format version, algorithm, subject/hash binding, the publisher
 * certificate chain + attested issuer (allowlist) + identity + signature, then
 * the registry countersignature chain + signature. Returns `{ ok: true, subject,
 * issuer, identity }` only when every link holds.
 */
export async function verifySignatureEnvelope(input: VerifySignatureInput): Promise<SignatureVerdict> {
  const { envelope, releaseBytes, trust } = input;

  if (parseMajor(envelope.formatVersion) !== SIGNATURE_FORMAT_MAJOR) {
    return refuse('unsupported-format-version');
  }
  if (envelope.publisherSig.alg !== 'ES256') {
    return refuse('unsupported-signature-alg');
  }

  const hashVerdict = await verifyHash(releaseBytes, envelope.subject.releaseHash);
  if (!hashVerdict.ok) {
    return refuse('subject-hash-mismatch');
  }

  // --- publisher (authorship): Sigstore keyless ---
  const leaf = parseCert(envelope.publisherSig.cert);
  if (leaf === undefined) {
    return refuse('publisher-cert-malformed');
  }
  const leafKey = await importPublicKey(leaf.spki);
  if (leafKey === undefined) {
    return refuse('publisher-cert-malformed');
  }
  if (!(await isIssuedByPinnedRoot(leaf, trust.publisherCARoots))) {
    return refuse('publisher-cert-untrusted');
  }
  if (leaf.issuer === undefined || leaf.identity === undefined) {
    return refuse('publisher-cert-missing-identity');
  }
  if (leaf.issuer !== envelope.publisherSig.issuer) {
    return refuse('publisher-issuer-mismatch');
  }
  if (!trust.issuerAllowlist.includes(leaf.issuer)) {
    return refuse('publisher-issuer-not-allowlisted');
  }
  if (envelope.publisherSig.subjectClaims[leaf.identity.kind] !== leaf.identity.value) {
    return refuse('publisher-identity-mismatch');
  }
  const publisherSig = decodeSignature(envelope.publisherSig.sig);
  const subjectBytes = canonicalize(envelope.subject);
  if (publisherSig === undefined || !(await verifyEcdsa(leafKey, publisherSig, subjectBytes))) {
    return refuse('publisher-signature-invalid');
  }

  // --- registry (approval): countersignature over the publisher signature ---
  const registrySig = envelope.registrySig;
  if (registrySig === undefined) {
    return refuse('registry-signature-missing');
  }
  if (registrySig.alg !== 'ES256') {
    return refuse('unsupported-signature-alg');
  }
  const registryLeaf = parseCert(registrySig.cert);
  if (registryLeaf === undefined) {
    return refuse('registry-cert-malformed');
  }
  const registryKey = await importPublicKey(registryLeaf.spki);
  if (registryKey === undefined) {
    return refuse('registry-cert-malformed');
  }
  if (!(await isIssuedByPinnedRoot(registryLeaf, trust.countersignRoots))) {
    return refuse('registry-cert-untrusted');
  }
  const countersig = decodeSignature(registrySig.sig);
  if (countersig === undefined || !(await verifyEcdsa(registryKey, countersig, publisherSig))) {
    return refuse('registry-signature-invalid');
  }

  return {
    reason: 'ok',
    ok: true,
    subject: envelope.subject,
    issuer: leaf.issuer,
    identity: leaf.identity,
  };
}
