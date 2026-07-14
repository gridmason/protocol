/**
 * Offline bundle (`.gmb`) wire format (docs/SPEC.md §4.5) — a signed,
 * self-verifying archive that lets an **air-gapped** host verify and load a
 * release with **no network at all**. TypeScript is the single authoring surface;
 * the JSON Schema under `schemas/gmb-bundle.schema.json` is generated from these
 * types at build (FR-5) and must never be hand-edited.
 *
 * A `.gmb` carries everything the online path fetches piecemeal, packed into one
 * document: the widget {@link Manifest}, the servable file bytes (`entry` module +
 * `chunks` + `schemas` + `docs`), the {@link SignatureEnvelope} (whose embedded
 * `logInclusion` transport plus the bundled {@link TransparencyLogEntry} are the
 * **embedded inclusion proofs**), the release document listing every file's hash,
 * and the **trust-root document** the release anchors to. The offline verifier
 * ({@link import('../../verify/bundle/index.js').verifyOfflineBundle}) validates it
 * against the operator's **pinned** roots only — the *identical* chain as the
 * online `verifyRelease`, sourced entirely from the bundle, fetching nothing.
 *
 * **Nothing here is trusted by being in the bundle.** Every field is untrusted
 * input until the verifier decides: the embedded trust root is believed only when
 * it matches an out-of-band operator pin (a bundle whose embedded root is not
 * pinned is refused exactly as the online unpinned case), and the signature/log
 * chain is checked in full. The bundle producer cannot vouch for itself.
 *
 * Byte encodings follow the rest of the wire surface: content hashes are
 * multihash-tagged (`sha2-256:<hex>`, `src/verify/hash`); packed file bytes are
 * base64 (standard alphabet). Types describe structure, never validity.
 */

import type { MultihashString } from '../../verify/hash/index.js';
import type { ReleaseDoc } from '../../verify/release/index.js';
import type { Manifest } from '../manifest/index.js';
import type { SignatureEnvelope } from './signature.js';
import type { TransparencyLogEntry } from './log-entry.js';
import type { TrustRootDoc } from './trust-root.js';

/**
 * One servable file packed into a bundle: the exact bytes the host will serve for
 * `path`, base64-encoded. `path` is the served URL/path key — the same key the
 * release document's `files` map addresses, so a host pairs the verified
 * `url → hash` map (from the verifier) with these bytes and runs the per-fetch
 * `verifyChunk` check locally. The bytes are covered by the bundle-level
 * {@link GmbBundle.contentHash}; they are otherwise carried, not re-derived.
 */
export interface GmbFile {
  /** Served path/URL key, matching a key of the release document's `files` map. */
  readonly path: string;
  /**
   * Base64 (standard alphabet) of the exact bytes served for {@link path}.
   * @pattern ^[A-Za-z0-9+/]*={0,2}$
   */
  readonly bytes: string;
}

/**
 * The verifiable payload of a `.gmb` — everything the bundle-level content hash
 * covers. Split out from {@link GmbBundle} so the hash has one precise, canonical
 * subject: mutating **any** field here (a servable byte, the embedded proof, the
 * trust root, the release map) changes the canonical bytes of this object and so
 * breaks {@link GmbBundle.contentHash}. The signature/log chain then independently
 * re-binds the release, envelope, log entry, and trust root — defence in depth, so
 * even a producer who honestly recomputes the content hash over tampered material
 * is still caught by the signed chain.
 */
export interface GmbPayload {
  /** The widget/plugin manifest (§3.1) this bundle ships. */
  readonly manifest: Manifest;
  /**
   * The signed release document (§4.1): the artifact id plus the `{ path → hash }`
   * map the signature envelope's subject binds. The offline chain re-derives its
   * hash and matches it to the signed subject exactly as the online path does.
   */
  readonly release: ReleaseDoc;
  /**
   * The detached dual-signature envelope (§4.2) over the canonicalized release.
   * Its `logInclusion` names the bundled {@link logEntry} — together they are the
   * **embedded log-inclusion proof** the offline chain checks against a pinned
   * checkpoint key, with no call to any log.
   */
  readonly envelope: SignatureEnvelope;
  /**
   * The transparency-log entry (§4.3) proving the release was logged — the
   * inclusion proof, packed so the check runs offline. The verifier requires
   * {@link envelope}'s `logInclusion` to name this exact entry.
   */
  readonly logEntry: TransparencyLogEntry;
  /**
   * The trust-root document (§4.4) the release anchors to — packed so the chain
   * has its issuer allowlist and root identifiers offline. It is **not** trusted
   * for being here: the verifier believes it only when it matches an operator pin
   * (a rotation-overlap document carries both outgoing and incoming roots per
   * §4.4, so a single embedded document covers the relevant roots).
   */
  readonly trustRoot: TrustRootDoc;
  /** The ES-module entry that registers the custom element (`manifest.entry`). */
  readonly entry: GmbFile;
  /** The remaining servable module chunks. */
  readonly chunks: readonly GmbFile[];
  /** The JSON Schema documents (e.g. the widget's settings schema). */
  readonly schemas: readonly GmbFile[];
  /** The documentation / guide assets shipped with the widget. */
  readonly docs: readonly GmbFile[];
}

/**
 * A `.gmb` offline bundle (docs/SPEC.md §4.5). The signed, self-verifying archive
 * an air-gapped host loads: a {@link GmbPayload} plus the bundle-level content hash
 * that seals it and the id of the registry that produced it. Consumed by
 * {@link import('../../verify/bundle/index.js').verifyOfflineBundle}.
 */
export interface GmbBundle {
  /**
   * Wire-format version as `major.minor`. Minor is additive/back-compatible,
   * major is breaking; the verifier speaks major `1`.
   * @pattern ^\d+\.\d+$
   */
  readonly formatVersion: string;
  /**
   * Identity of the registry that produced this bundle (e.g.
   * `"registry.gridmason.dev"`). Provenance metadata carried for operators and
   * audit — **not** a trust anchor: trust flows from the pinned {@link
   * GmbPayload.trustRoot}, never from this field.
   */
  readonly producedBy: string;
  /**
   * The bundle-level content hash: the multihash-tagged (`sha2-256:<hex>`) digest
   * of the canonicalized {@link GmbPayload} (`src/canon`, RFC-8785). Seals the
   * whole archive — any tampering with the payload breaks this hash, which the
   * verifier checks before it will look at anything inside. It is an integrity
   * seal, not a signature: the cryptographic authorship/approval trust comes from
   * the signed chain inside {@link payload}.
   */
  readonly contentHash: MultihashString;
  /** The sealed, verifiable contents. */
  readonly payload: GmbPayload;
}
