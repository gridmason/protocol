# @gridmason/protocol

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
