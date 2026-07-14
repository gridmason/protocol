/**
 * The dual-signature envelope wire format (docs/SPEC.md §4.2). TypeScript is the
 * single authoring surface for this shape; the JSON Schema under `schemas/` is
 * generated from these types at build (FR-5) and must never be hand-edited.
 *
 * The envelope is a COSE/JWS-style **detached** credential over the
 * *canonicalized* release document (`src/canon`, RFC-8785): it carries no release
 * bytes itself, only the release's content hash (`subject.releaseHash`, from
 * `src/verify/hash`) plus two signatures — the **publisher** signature (Sigstore
 * keyless: a short-lived certificate bound to an OIDC identity) and the
 * **registry** countersignature (applied only after registry review passes). The
 * verify lib (`src/verify/signature`) checks both signatures, the subject/hash
 * binding, and the issuer allowlist before a host may load; log inclusion
 * (`logInclusion`) is verified separately (FR-13) and the fields here are the
 * transport for that check, not verified by this module.
 *
 * This file defines the wire *shape* only — every field is untrusted input until
 * {@link import('../../verify/signature/index.js').verifySignatureEnvelope}
 * decides. Types describe structure, never validity.
 */

import type { MultihashString } from '../../verify/hash/index.js';

/**
 * Signature algorithm identifier. Only `ES256` (ECDSA over NIST P-256 with
 * SHA-256) is produced and accepted at format `1.x`; it is a string union rather
 * than a bare `string` so the schema pins the accepted set and an unknown
 * algorithm is a typed refusal, not a silent pass. Additional algorithms (e.g.
 * `EdDSA`) are a future additive (minor) format bump.
 */
export type SignatureAlg = 'ES256';

/**
 * What the envelope is *about*: the exact artifact and the content hash of its
 * canonicalized release document. The signatures cover this object (see
 * {@link SignatureEnvelope}); the verifier additionally re-derives the hash from
 * the supplied release bytes so a matching signature over a lying `subject` is
 * still refused.
 */
export interface SignatureSubject {
  /** Publisher-prefixed, version-qualified artifact id, e.g. `acme-chart@2.3.1`. */
  readonly artifact: string;
  /**
   * Multihash-tagged content hash of the canonicalized release document
   * (`sha2-256:<hex>`), the same encoding `src/verify/hash` produces.
   */
  readonly releaseHash: MultihashString;
}

/**
 * The publisher (authorship) signature — Sigstore keyless. `cert` is a
 * short-lived certificate binding a public key to an OIDC identity; the
 * verifier extracts the issuer and identity **from the certificate**, so the
 * `issuer`/`subjectClaims` mirrored here are convenience transport that must
 * *match* the certificate — a mismatch is refused, never trusted.
 */
export interface PublisherSignature {
  /** Signature algorithm; `ES256` at format `1.x`. */
  readonly alg: SignatureAlg;
  /** Base64 (standard alphabet) of the DER-encoded X.509 short-lived certificate. */
  readonly cert: string;
  /**
   * OIDC issuer the publisher authenticated to (e.g.
   * `https://accounts.google.com`). The trust anchor for the publisher side; the
   * verifier requires it to equal the issuer the certificate attests and to be on
   * the registry's issuer allowlist (recorded in the trust root, §4.4).
   */
  readonly issuer: string;
  /**
   * Identity claims the OIDC issuer asserted (e.g. `{ email: "dev@acme.com" }`),
   * bound into the certificate's subject-alternative name. The verifier requires
   * these to match the certificate.
   */
  readonly subjectClaims: Readonly<Record<string, string>>;
  /**
   * Base64 (standard alphabet) of the raw ECDSA signature in IEEE-P1363 form
   * (`r || s`, 64 bytes for P-256) over the canonical bytes of {@link SignatureSubject}.
   */
  readonly sig: string;
}

/**
 * The registry (approval) countersignature — applied only after registry review
 * passes, with the countersign key held separately from review staff. It signs
 * the publisher signature it approved, so approval is bound to that exact
 * publisher signature. Optional on the wire: a published-but-not-yet-approved
 * release has a `publisherSig` and no `registrySig`; the verifier refuses that
 * with a distinct reason.
 */
export interface RegistryCountersignature {
  /** Signature algorithm; `ES256` at format `1.x`. */
  readonly alg: SignatureAlg;
  /** Base64 (standard alphabet) of the DER-encoded X.509 countersign certificate. */
  readonly cert: string;
  /**
   * Base64 (standard alphabet) of the raw ECDSA signature in IEEE-P1363 form over
   * the publisher signature's raw bytes (the countersigned value).
   */
  readonly sig: string;
}

/**
 * Transparency-log inclusion transport (§4.3). Carried in the envelope so the
 * log-inclusion check (FR-13) has its inputs; **not** verified by
 * `src/verify/signature`. Typed here to pin the wire shape.
 */
export interface LogInclusion {
  /** Identifier of the transparency log the entry lives in. */
  readonly logId: string;
  /** Zero-based leaf index of the entry. */
  readonly index: number;
  /** Merkle inclusion-proof hashes (base64), audited by the log-inclusion check. */
  readonly proof: readonly string[];
}

/**
 * The detached dual-signature envelope over a canonicalized release document
 * (docs/SPEC.md §4.2). Consumed by
 * {@link import('../../verify/signature/index.js').verifySignatureEnvelope} and,
 * above it, by the `verifyRelease` orchestrator (FR-14).
 */
export interface SignatureEnvelope {
  /**
   * Wire-format version as `major.minor`. Minor is additive/back-compatible,
   * major is breaking. This module speaks major `1`.
   * @pattern ^\d+\.\d+$
   */
  readonly formatVersion: string;
  /** The artifact and release-hash the signatures cover. */
  readonly subject: SignatureSubject;
  /** Publisher (authorship) signature — Sigstore keyless. */
  readonly publisherSig: PublisherSignature;
  /** Registry (approval) countersignature — present once review has passed. */
  readonly registrySig?: RegistryCountersignature;
  /** Transparency-log inclusion transport (verified elsewhere, FR-13). */
  readonly logInclusion: LogInclusion;
}
