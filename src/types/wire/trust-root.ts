/**
 * Trust-root document (docs/SPEC.md §4.4) — the signed document a registry
 * publishes to declare the roots a host must pin it against: the countersign
 * root(s) that anchor registry approval signatures, the publisher CA roots and
 * OIDC issuer allowlist that anchor authorship, and the log keys that anchor
 * transparency-log inclusion. TypeScript is the single authoring surface; the
 * JSON Schema under `schemas/trust-root.schema.json` is generated from this type
 * at build (FR-5) and must never be hand-edited.
 *
 * **Never trusted blind.** A host trusts a trust-root document only when it
 * matches a root the operator **pinned** out of band — shipped in the host build
 * (build-time channel) or supplied as deploy config/secret (deploy-time channel),
 * both of SPEC §4.4's "never-fetch-blind-at-runtime" channels. A document fetched
 * from the network with no matching pin is refused. The pinning + rotation +
 * validity-window decision is {@link import('../../verify/trust/index.js').evaluateTrustRoot};
 * narrowing an untrusted `unknown` into this shape is
 * {@link import('../../verify/trust/index.js').parseTrustRoot}.
 *
 * **Rotation.** To rotate its countersign root without a flag-day re-pin, a
 * registry publishes an overlap document that lists **both** the outgoing and
 * incoming roots in {@link TrustRootDoc.countersignRoots} and carries
 * {@link TrustRootDoc.crossSig} — the outgoing root's signature over the new
 * document. During the overlap window a host pinned to either root still matches;
 * on the next release the registry drops the outgoing root, so a host still
 * pinned to it is refused until it re-pins. This module models the document shape
 * and the pin/overlap/validity decision only; **cryptographic** verification of
 * `crossSig` (that the outgoing root really authorized the incoming one) needs a
 * signature primitive and composes in the `verifyRelease` orchestrator (#20).
 *
 * Timestamps: {@link TrustRootDoc.notBefore} / {@link TrustRootDoc.notAfter} are
 * **epoch milliseconds** — the same clock the caller passes as `now` (SPEC §5;
 * the lib takes the clock, never reads one). This aligns the whole verify surface
 * on epoch-ms instants; SPEC §4.4's `"notBefore": "…"` placeholder is rendered
 * concretely as that numeric instant.
 */

/**
 * A signed trust-root document for one registry (docs/SPEC.md §4.4). Every field
 * is authored here and schema-generated (FR-5). A host receives this document
 * already signature-verified and matches it against its out-of-band pins.
 */
export interface TrustRootDoc {
  /**
   * Wire-format version of this document as `major.minor`.
   * @pattern ^\d+\.\d+$
   */
  formatVersion: string;
  /** Identity of the registry this document establishes roots for (e.g. `"registry.gridmason.dev"`). */
  registryId: string;
  /**
   * The registry's countersign root(s) — the roots that anchor its approval
   * (`registrySig`) signatures. Ordered; opaque identifiers (a key id / cert /
   * fingerprint) matched verbatim against the operator's pins. Normally one root;
   * during a rotation overlap it lists **both** the outgoing and incoming roots so
   * a host pinned to either still matches (see {@link crossSig}).
   */
  countersignRoots: string[];
  /**
   * Publisher CA roots for the issued-cert authorship path (SPEC §4.4, optional).
   * Absent when the registry only anchors authorship through the keyless OIDC
   * path ({@link issuerAllowlist}).
   */
  publisherCARoots?: string[];
  /**
   * The OIDC issuer origins the registry accepts as authorship trust anchors
   * (SPEC §4.2 — "the OIDC issuer is the trust anchor for the publisher side").
   * A publisher signature whose issuer is not on this list is not anchored. May
   * be empty for a registry that uses only the issued-cert path.
   */
  issuerAllowlist: string[];
  /**
   * The transparency-log public keys (opaque encoded strings) a host pins log
   * inclusion proofs against (SPEC §4.3). May be empty for a registry that does
   * not operate a log.
   */
  logPublicKeys: string[];
  /**
   * Start of the document's validity window, in **epoch milliseconds**. A host
   * whose `now` is before this instant refuses the document as not-yet-valid.
   * @asType integer
   */
  notBefore: number;
  /**
   * End of the document's validity window, in **epoch milliseconds**. A host whose
   * `now` is past this instant refuses the document as expired. Must be `>=`
   * {@link notBefore}.
   * @asType integer
   */
  notAfter: number;
  /**
   * The outgoing root's signature over this document, present only during a
   * rotation overlap to bind the incoming root to the one it succeeds (SPEC §4.4).
   * Absent outside a rotation. This module carries it through structurally;
   * verifying it cryptographically is the signature primitive's job, composed in
   * `verifyRelease` (#20).
   */
  crossSig?: string;
}
