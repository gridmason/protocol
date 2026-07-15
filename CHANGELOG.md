# @gridmason/protocol

## 0.4.0

### Minor Changes

- fc7c4f5: Add a public `verifyRevocationFeed(signed, { countersignRoots })` primitive and
  the `SignedRevocationFeed` wire type (`@gridmason/protocol` +
  `@gridmason/protocol/verify` + `@gridmason/protocol/types`; issue #70, dashboard
  D-E3.3). Hosts fetch a registry's revocation & kill feed wrapped in a detached
  signature; `verifyRevocationFeed` authenticates that ES256 signature over
  `canonicalize(feed)` against the pinned countersign roots — the same trust leg as
  the registry countersignature in `verifySignatureEnvelope` — and returns the
  authenticated `feed` for `evaluateFreshness`. Pure, isomorphic, WebCrypto-only,
  zero runtime dependencies. Adds a generated JSON Schema at
  `@gridmason/protocol/schemas/signed-revocation-feed.json` with a byte-identical
  drift guard, and the shared ECDSA/cert primitives are factored into
  `src/verify/signature/ecdsa.ts` so both verifiers compose one audited surface.

## 0.3.0

### Minor Changes

- 335ae51: Promote the registry Resolution API wire contract into `@gridmason/protocol`
  (`@gridmason/protocol` + `@gridmason/protocol/types`) — the gate-snapshot request
  and import-map-fragment response of `POST /v1/resolve` (registry FR-7, FR-10;
  GW-D22; cross-repo promotion, issue #66). Adds `GateSnapshot`, `GateModule`,
  `SharedOffer`, `ImportMapFragment`, `ResolvedModule`, `SignatureBundle`,
  `ExcludedModule`, and the `ExclusionReason` enum, plus generated JSON Schemas at
  `@gridmason/protocol/schemas/gate-snapshot.json` and
  `.../import-map-fragment.json`.

  These shapes were owned by gridmason/registry (`src/resolution/types.ts`, shipped
  in registry#13). Now that a second consumer — the Gridmason Dashboard's Phase-B
  remote loader (dashboard D-E3.1) — depends on them, they move to the shared
  contract; registry and dashboard pin this type and drop their local copies on
  their own cadence. Field names, optionality, and semantics match what registry
  shipped (a faithful promotion, not a redesign).

## 0.2.0

### Minor Changes

- bf67543: P-E4 `.gmb` offline bundle format + offline verification (FR-13, issue #22, SPEC
  §4.5). Adds the `GmbBundle` wire type (`@gridmason/protocol` +
  `@gridmason/protocol/types`) — a signed, self-verifying archive for air-gapped
  hosts packing the manifest, servable file bytes (entry + chunks + schemas +
  docs), the signature envelope with embedded log-inclusion proof, the embedded
  trust-root document, a bundle-level content hash, and a `producedBy` registry id
  — plus its generated JSON Schema (`@gridmason/protocol/schemas/gmb-bundle.json`).

  Adds `verifyOfflineBundle(input)` under `@gridmason/protocol` and
  `@gridmason/protocol/verify`: it seals the archive by recomputing the bundle-level
  content hash over the canonical payload, then composes the **identical**
  `verifyRelease` chain (dual signature, embedded inclusion proof, content hashes)
  sourced entirely from the bundle and checked against **pinned roots only** — no
  network of any kind. It returns the same `url → hash` verdict shape as the online
  path and every stable `VerifyReleaseReason` unchanged (a bundle whose embedded
  root is not pinned refuses with the same `trust-root-untrusted` as the online
  unpinned case), adding two archive-integrity classes: `bundle-malformed` and
  `bundle-hash-tampered`. Held at the 100% verify-core coverage gate.

- 5df9378: P-E4 negative-vector completion sweep + verify/canon coverage audit (FR-15, issue
  #24, SPEC §7/§8) — the milestone-M-B exit for the verify library. Completes the
  SPEC §7 negative set as **published** conformance vectors runnable by any consumer
  (core / cli / registry / dashboard) in one import through the shared vector-runner,
  so a divergent implementation that "passes" a tampered vector fails its own CI
  rather than production.

  Four negatives graduate from test-only fixtures into `@gridmason/protocol/vectors`,
  joining the already-published tampered-hash (`hash-wire`) negative to close the
  full SPEC §7 list — **wrong issuer**, **expired root**, **forked log**, and
  **stale-past-TTL feed**:

  - `signatureVectors` (`signature` group) — a frozen, recorded ECDSA-P256
    dual-signed envelope plus the two wrong-issuer refusals
    (`publisher-issuer-not-allowlisted`, `publisher-issuer-mismatch`).
  - `trustRootVectors` (`trust-root` group) — pinned-valid / rotation-overlap
    positives and the `expired` root refusal.
  - `logConsistencyVectors` (`log-consistency` group) — an honest 5→8 growth proof
    and the forked-log `consistency-proof-invalid` refusal.
  - `freshnessVectors` (`freshness` group) — fresh / multi-registry-scoping
    positives and the `stale` past-TTL refusal.

  `ConformanceSurface` gains the matching injectable members (`verifySignatureEnvelope`,
  `evaluateTrustRoot`, `verifyLogConsistency`, `evaluateFreshness`); the sync
  `runConformanceVectors` now also runs the trust-root and freshness groups, and
  `runConformanceVectorsAsync` appends the WebCrypto signature and log-consistency
  groups. The report shape is unchanged. The new vector types (`SignatureVector`,
  `TrustRootVector`, `LogConsistencyVector`, `FreshnessVector`) are exported.

  The verify/canon security core is audited at 100% lines **and** branches (all 24
  files), and a `test/coverage-gate.test.ts` meta-test pins the `vitest.config.ts`
  threshold to both directories on every metric so the gate cannot be silently
  weakened.

- eb179ae: P-E4 format-version negotiation + deprecation/dual-running policy (FR-16, issue
  #23, SPEC §5/§6). Adds `negotiate(local, remote)` under `@gridmason/protocol` and
  `@gridmason/protocol/negotiate`: given the format majors a build speaks
  (`FormatSupport`) and a remote artifact's `major.minor` `formatVersion`, it
  returns a stable `'ok' | 'upgrade' | 'refuse'` verdict — `ok` for the current
  major (any minor is additive/back-compatible), `upgrade` for an older major still
  inside its dual-running window (readable, but the peer should migrate), and
  `refuse` for a major newer than any spoken, a major no longer spoken, or a
  malformed version. It never guesses: an unparseable version refuses.

  Exports the `FormatSupport` / `FormatVersion` / `NegotiationOutcome` types and
  `PROTOCOL_FORMAT_SUPPORT` (the majors this build speaks — `1`, matching the
  `verify/` hot path). Pure and isomorphic (no I/O, no clock, no key handling). The
  handshake joins the shared conformance corpus as `negotiateVectors` (run through
  `runConformanceVectors`, so a divergent implementation fails a shared test) and
  is mirrored as JSON fixtures under `test/vectors/negotiate/`, versioned by format
  major. The README documents the deprecation / dual-running policy: a new major
  ships alongside the old for at least one host release cycle, the transparency log
  records format-major usage, `protocol` defines only when a build stops speaking a
  major, and _serving_ retirement is a per-registry decision (out of scope).

### Patch Changes

- 8e1f42d: Ratify the rotation `crossSig` contract in the SPEC and wire docs (issue #57,
  follow-up to #20). SPEC §4.4 now pins the exact contract the `verifyCrossSig`
  check implemented: the signed **preimage** is the RFC-8785 canonical bytes of
  the trust-root document with its own `crossSig` field removed, and the base64
  ECDSA P-256 / SHA-256 signature is accepted when it verifies (WebCrypto) under
  any of the operator's pinned countersign root keys — every failure mapping to
  the single `trust-root-rotation-invalid` reason. The `TrustRootDoc.crossSig` doc
  comment carries the same ratification, so the generated
  `trust-root.schema.json` description is updated (the only shipped-artifact
  change). SPEC §5 records the shape shipped in P-E3: `verifyRelease` /
  `verifyChunk` are async (WebCrypto-only), `VerifyReleaseInput` carries concrete
  leaf inputs against a hard-pinned log checkpoint key (GW-D17), and `ReleaseDoc`
  lives in the verify module hash-bound to the signed subject rather than
  schema-validated. Adds the frozen `test/vectors/trust/crosssig-preimage.json`
  conformance vector (valid document + single-byte-mutated negative). Docs and one
  vector only — no behavior change.

## 0.1.0

### Minor Changes

- 36e71c1: Add the dual-signature envelope wire format and its pure verification library
  (SPEC §4.2, FR-9).

  - New `SignatureEnvelope` contract type under `@gridmason/protocol/types` (a
    COSE/JWS-style detached envelope over the canonicalized release document:
    `subject`, `publisherSig`, `registrySig`, `logInclusion`), with its JSON Schema
    generated from the TypeScript source (`schemas/signature-envelope.schema.json`,
    exported at `@gridmason/protocol/schemas/signature-envelope.json`).
  - New `verifySignatureEnvelope` in `@gridmason/protocol/verify`: verifies the
    publisher signature (Sigstore keyless — leaf certificate issued by a pinned CA
    root, attested OIDC issuer enforced against the trust-root allowlist, SAN
    identity bound) and the registry countersignature (against pinned countersign
    roots), plus the subject/content-hash binding. Every failure is a stable
    `SignatureVerdictReason`.

  Signature math is WebCrypto only (ECDSA P-256 / `ES256`); the package keeps zero
  runtime dependencies. Log-inclusion, trust-root parsing, and the `verifyRelease`
  orchestrator land in later P-E3/P-E4 issues.

### Patch Changes

- 684c629: P-E3 revocation & kill feed + freshness (FR-11, issue #18): the signed
  per-registry `RevocationFeed` wire type (`revoked`/`killed` entries with
  severity, monotonic `seq`, TTL) with its generated JSON Schema
  (`@gridmason/protocol/schemas/revocation-feed.json`) and `Cursor` type, plus the
  pure `evaluateFreshness(feed, cursor, now)` load gate (security core, 100%
  covered). It encodes the fail-closed-scoped-to-that-registry rule — a stale feed
  blocks only its own registry's remotes while others stay fail-open — rejects a
  rolled-back feed (lower `seq`) and a mismatched cursor, and blocks the named
  revoked/killed artifacts on a fresh verdict. Every outcome is a stable enum; the
  caller supplies `now` (no internal clock). Feed-signature verification is out of
  scope here — it composes via #16/#17 in the #20 `verifyRelease` orchestrator.
- 93a34a7: P-E3 trust-root document + pinning + overlap rotation (FR-12, issue #19): the
  signed per-registry `TrustRootDoc` wire type (countersign roots, publisher CA
  roots, OIDC issuer allowlist, log public keys, epoch-ms validity window,
  rotation `crossSig`) with its generated JSON Schema
  (`@gridmason/protocol/schemas/trust-root.json`), plus two pure functions in the
  security core (100% covered): `parseTrustRoot(input)` narrows an untrusted
  `unknown` into the document shape with stable reason enums, and
  `evaluateTrustRoot(doc, pins, now)` decides trust against the operator's
  out-of-band pins. It never trusts a network-supplied root without a matching
  pin (`registry-mismatch` / `unpinned`), enforces the validity window
  (`not-yet-valid` / `expired`), and accepts an overlap-window rotation document
  for a host pinned to **either** the outgoing or the incoming root — refusing a
  host still pinned to a root the registry has dropped. Every outcome is a stable
  enum; the caller supplies `now` and the pins (no internal clock, no I/O, no key
  handling). Cryptographic verification of `crossSig` (that the outgoing root
  authorized the incoming one) needs a signature primitive and composes via #16 in
  the #20 `verifyRelease` orchestrator; this issue carries `crossSig` through
  structurally.
- 4fc4372: P-E3 verify orchestration: `verifyRelease` / `verifyChunk` + canonical stable
  reason set (FR-14, issue #20, epic #15 capstone). Composes the four leaf
  verifiers into the single decision a host runs before it loads a release —
  `verifyRelease(input)` parses and pins the (untrusted) trust-root document
  against the operator's out-of-band pins and clock (including cryptographic
  `crossSig` verification of a rotation-overlap document, the check the trust-root
  leaf deferred), canonicalizes and hash-binds the release document, verifies the
  dual-signature envelope (publisher authorship + registry approval), and verifies
  transparency-log inclusion against the pinned checkpoint — returning the signed
  `url → hash` map (plus issuer and subject) on success, or a single stable reason
  on the first failure. `verifyChunk(bytes, expectedHash)` is the Service-Worker
  per-fetch hash gate.

  Every failure maps into one exported closed set, `VerifyReleaseReason`, with a
  value per failure class (`VERIFY_RELEASE_REASONS`); the mapping from each leaf's
  reason enum is total and stable, and enforces the **no-tag-echo rule** (SPEC §7)
  by construction — a reason is always a fixed literal, never a gated-off or
  unknown widget's tag, artifact id, or issuer. `evaluateFreshness` (FR-11) is
  re-exported as part of the same public verify surface; `negotiate` (§6) stays
  reserved in `src/negotiate`. Pure and isomorphic (no I/O, no key handling; the
  caller supplies bytes, pinned roots/keys, the log entry, and `now`), and the
  whole `src/verify` tree holds the 100% line/branch security-core gate across the
  happy path and every negative reason.

- 01532d1: P-E3 transparency-log entry + proof validation (FR-10, issue #17): the
  Sigstore/Rekor-compatible `TransparencyLogEntry` wire type (`logId`, `index`,
  `integratedTime`, `canonicalBody`, `inclusionProof`, `checkpoint`) with its
  generated JSON Schema (`@gridmason/protocol/schemas/log-entry.json`), plus two
  pure functions in the security core (100% covered): `verifyLogInclusion(entry,
logPublicKey)` recomputes the RFC 6962 Merkle root from the audit path and
  checks it against the root a **pinned**-key-signed checkpoint commits to, and
  `verifyLogConsistency({ oldCheckpoint, newCheckpoint, proof, logPublicKey })`
  proves the log grew append-only (fork detection). Both verify the
  c2sp.org/tlog-checkpoint signed note against a caller-supplied pinned Ed25519
  log key (GW-D17) via WebCrypto — never a key fetched at runtime — and return a
  distinct stable `LogVerdictReason` for every failure (tampered inclusion proof,
  forked log, bad checkpoint signature, malformed input, …). Isomorphic and
  I/O-free; validated against recorded Rekor-shaped fixtures, never live network.

## 0.0.5

### Patch Changes

- f566256: P-E2 canonicalization + hashing layer (epic #11): RFC-8785/JCS `canonicalize`
  (zero-dep, security core, 100% covered), SHA-256 content hash with
  multihash-tagged strings (`hashBytes`/`verifyHash`, stable reason enums,
  unknown prefix refused), the release `{path → hash}` map type, and published
  canon-wire/hash-wire conformance vectors (positive + tampered negatives)
  through the one-import runner at `@gridmason/protocol/vectors`.

## 0.0.4

### Patch Changes

- 1b10796: Pin the **dev-proxy SDK wire format** (issue #42) — the forward-leg contract the
  CLI's `gridmason dev --proxy` speaks to a target host, so the CLI's forward leg
  and a host's future receive endpoint meet on one type instead of drifting. Adds
  `DEV_PROXY_SDK_PATH`, the `DevProxySdkRequest` (`{ method: string; args }`) and
  `DevProxySdkResponse` (`{ ok: true; value } | { ok: false; error }`) types, and
  the pure guards `isDevProxySdkRequest` / `isDevProxySdkResponse`. `method` stays a
  plain `string` — the SDK method vocabulary is `@gridmason/sdk`'s, and the protocol
  must not depend on it.

  Also promotes the scope-prefix **grant rule** as `grantsCapability(declared,
required)` next to the capability grammar: a declared capability grants a required
  one iff the apis match and the declared scope path is a prefix of the required
  one. This is the one definition of the `min(user, widget)` containment the host
  SDK gate, the CLI `--proxy` enforcement, and the SDK fixture handle all apply.

  Ships positive and negative `capability-grant`, `dev-proxy-request`, and
  `dev-proxy-response` conformance vectors under `@gridmason/protocol/vectors`.

## 0.0.3

### Patch Changes

- a134158: Add the runtime page-context **value** side to the typed-context contract
  (issue #37, needed by the sdk's `HostSDK.context`): `ContextValue` (with
  `RecordRefValue` and `ObjectValue`) mirroring the `ContextType` grammar,
  `PageContext` as the value-side counterpart of `ContextMap`, and the pure
  conformance helpers `matchesContextType` / `matchesContextMap`. Ships positive
  and negative `context-match` conformance vectors under
  `@gridmason/protocol/vectors`, and documents `WidgetID` (capital `ID`) as the
  canonical spelling.

## 0.0.2

### Patch Changes

- c975763: Contract types (M0a): widget/plugin manifest schema with generated JSON Schemas,
  tag lint rules, and the capability grammar; typed page-context primitives +
  composites with the pure subset check; LayoutDoc with the migrator chain,
  read-only-on-newer semantics, and source-qualified widget identity; the
  s7k-widgets-core POC importer; and the type conformance vector runner at
  `@gridmason/protocol/vectors`.

## 0.0.1

### Patch Changes

- Initial `0.0.x` release. Publishes the package scaffold (ESM output + type declarations) and stands up the changesets + npm Trusted Publishing (OIDC) release pipeline. Contract types, wire formats, and the verify core land in later releases.
