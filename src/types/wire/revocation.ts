/**
 * Revocation & kill feed (docs/SPEC.md §4.3) — a signed, monotonically-versioned
 * document a registry publishes to withdraw or kill artifacts it has already
 * distributed. TypeScript is the single authoring surface; the JSON Schema under
 * `schemas/revocation-feed.schema.json` is generated from this type at build
 * (FR-5) and must never be hand-edited.
 *
 * One feed per registry. A host keeps **one cursor + one TTL clock per registry**
 * ({@link Cursor}) and runs {@link import('../../verify/freshness/index.js').evaluateFreshness}
 * to decide, per registry, whether that registry's remotes may load. The feed is
 * signed; **this module models the document shape only** — verifying the feed's
 * signature is the signature/log primitives' job (issues #16/#17), composed in
 * the `verifyRelease` orchestrator (#20). `evaluateFreshness` operates on an
 * already-authenticated feed.
 *
 * Timestamps: `issuedAt` is **epoch milliseconds**, the same clock the caller
 * passes as `now` (SPEC §5 — the lib takes the clock, never reads one). `seq` is
 * an integer that increases with every feed a registry publishes; a feed whose
 * `seq` is below the host's cursor is a rollback (an old feed replayed) and is
 * rejected regardless of its TTL.
 *
 * The feed is served wrapped in a detached registry signature ({@link
 * SignedRevocationFeed}); a host authenticates that wrapper with
 * {@link import('../../verify/revocation/index.js').verifyRevocationFeed} before
 * handing the `feed` to `evaluateFreshness`.
 */

import type { SignatureAlg } from './signature.js';

/**
 * What a registry has done to an artifact.
 *
 * - `revoked` — withdraw the artifact: block **new** loads. Instances already
 *   running are left alone.
 * - `killed`  — kill switch: block new loads **and** force-unload any running
 *   instance. Strictly more severe than `revoked`.
 *
 * Both states block loading, so both appear in a fresh verdict's blocked list;
 * the state is carried through so a host can additionally unload the `killed`
 * ones.
 */
export type ArtifactState = 'revoked' | 'killed';

/**
 * Operator-facing severity of a revocation/kill entry, low to high. Advisory
 * triage metadata (how a host prioritizes surfacing the event) — it does **not**
 * change the load decision: any listed artifact is blocked whatever its severity.
 */
export type RevocationSeverity = 'low' | 'medium' | 'high' | 'critical';

/** One artifact a registry has revoked or killed. */
export interface RevocationEntry {
  /**
   * The artifact this entry acts on: a publisher-prefixed tag, optionally
   * version-qualified (e.g. `"acme-chart@1.2.3"`), matched verbatim against the
   * artifact ids a host is about to load. Matching is exact-string; this module
   * does not interpret ranges.
   */
  artifact: string;
  /** Whether the artifact is revoked (block new loads) or killed (also unload). */
  state: ArtifactState;
  /** Advisory severity for host triage; does not affect the load decision. */
  severity: RevocationSeverity;
  /** Human-readable justification (advisory, not a stable enum). */
  reason: string;
}

/**
 * A signed revocation & kill feed for one registry (docs/SPEC.md §4.3). Every
 * field is authored here and schema-generated (FR-5); a host receives this
 * document already signature-verified and passes it to `evaluateFreshness`.
 */
export interface RevocationFeed {
  /**
   * Wire-format version of this feed as `major.minor`.
   * @pattern ^\d+\.\d+$
   */
  formatVersion: string;
  /** Identity of the registry that issued this feed (e.g. `"registry.gridmason.dev"`). */
  registryId: string;
  /**
   * Monotonic feed version. Increases with every feed the registry publishes; a
   * host rejects a feed whose `seq` is below its stored cursor as a rollback.
   * @asType integer
   */
  seq: number;
  /**
   * When this feed was issued, in **epoch milliseconds** (same clock as `now`).
   * The registry's TTL window is `issuedAt + ttlSeconds * 1000`.
   * @asType integer
   */
  issuedAt: number;
  /**
   * Freshness window in **seconds** from `issuedAt`. Once `now` is past
   * `issuedAt + ttlSeconds * 1000` the feed is stale and the host must re-check
   * before loading this registry's remotes (fail-closed, scoped to this
   * registry only).
   * @asType integer
   */
  ttlSeconds: number;
  /** The revoked/killed artifacts. An empty list is a valid "nothing revoked" feed. */
  entries: RevocationEntry[];
}

/**
 * A host's last-seen state for **one** registry: the highest feed `seq` it has
 * accepted. Held per registry (SPEC §4.3) and supplied to `evaluateFreshness`
 * alongside that registry's feed so a replayed older feed (lower `seq`) is
 * caught as a rollback.
 *
 * A host that has never seen a feed for a registry initializes the cursor with a
 * `seq` below any real feed — feeds start at `0`, so `-1` means "no feed yet" and
 * accepts the first feed of any `seq`.
 */
export interface Cursor {
  /** The registry this cursor tracks; must match the feed's `registryId`. */
  registryId: string;
  /**
   * Highest feed `seq` accepted so far, or `-1` for a registry never seen.
   * @asType integer
   */
  seq: number;
}

/**
 * The detached registry signature that wraps a served feed (docs/SPEC.md §4.3).
 * ECDSA P-256 / SHA-256 (`ES256`, IEEE-P1363 form) over `canonicalize(feed)`,
 * produced with the **same countersign key** the registry uses to approve
 * releases — so a host pins one countersign root and authenticates both the
 * release countersignature and this feed against it. Field conventions match the
 * registry countersignature in {@link import('./signature.js').RegistryCountersignature}.
 */
export interface RevocationFeedSignature {
  /** Signature algorithm; `ES256` at format `1.x`. */
  alg: SignatureAlg;
  /** Base64 (standard alphabet) of the DER-encoded X.509 countersign certificate. */
  cert: string;
  /**
   * Base64 (standard alphabet) of the raw ECDSA signature in IEEE-P1363 form
   * (`r || s`, 64 bytes for P-256) over the canonical bytes of {@link RevocationFeed}.
   */
  sig: string;
}

/**
 * A served revocation & kill feed plus its detached registry signature (docs/SPEC.md
 * §4.3). This is the document a host fetches from a registry; every field is
 * untrusted input until
 * {@link import('../../verify/revocation/index.js').verifyRevocationFeed}
 * authenticates the signature against the pinned countersign roots. Only then is
 * `feed` passed to
 * {@link import('../../verify/freshness/index.js').evaluateFreshness}.
 */
export interface SignedRevocationFeed {
  /** The revocation & kill feed the signature covers. */
  feed: RevocationFeed;
  /** Detached registry signature over `canonicalize(feed)`. */
  signature: RevocationFeedSignature;
}
