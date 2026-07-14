# SPEC — `@gridmason/protocol` (the contracts + verification library)

**Repo:** `gridmason/protocol` · **Package:** `@gridmason/protocol` · **License:** AGPL-3.0 (CLA required) · **Status:** reviewed 2026-07-13 · **Project:** [Gridmason](https://github.com/gridmason/.github) · **Role:** M0 — everything pins it (GW-D6)

The single source of truth for every contract two Gridmason parts meet on: the **types** (widget manifest, page contexts, `LayoutDoc`), the **wire formats** (signature envelope, transparency-log entry, revocation & kill feed, trust-root document, offline bundle), and the **verification library** every host uses to decide whether a remote is safe to run. Zero runtime dependencies on any other Gridmason package — `protocol` sits at the root of the DAG and pins nothing above itself. `core`, `sdk`, `cli`, `registry`, and `dashboard` all depend on it; it depends on none of them.

**Why one package:** the security posture is *"the reviewed hash is the runnable artifact,"* and that claim is only real if the host, the CLI, and the registry all compute identity, verify signatures, and check log inclusion **the exact same way**. Co-locating the schemas with the code that enforces them makes divergence a compile error, not a field incident.

## 1. Scope

**In:** TypeScript type definitions + JSON Schemas for all contract objects; the canonical serialization rules (canonicalization for hashing/signing); the verification library (signature-chain, content-hash, log-inclusion, trust-root, revocation-freshness checks); format version negotiation; the migration/deprecation policy for formats; conformance test vectors.

**Out (explicit non-goals):** any I/O (no network, no fs — verification takes bytes and roots as inputs, callers supply them); key generation / signing (that is the CLI + registry using standard Sigstore/COSE tooling — `protocol` only *verifies*); storage; UI. The verification lib is **pure and isomorphic** (browser + Node + edge), so it can run inside the dashboard's Service Worker, the CLI, and the registry alike.

## 2. Package layout

```
@gridmason/protocol
├── types/            TypeScript types + JSON Schemas (generated 1:1 from each other)
│   ├── manifest      widget/plugin manifest, page-type descriptor, capability grammar
│   ├── context       typed page-context contracts (record-ref, primitives, composites)
│   ├── layout        LayoutDoc + LayoutPage/Tab/Grid/Widget, schemaVersion + migrators
│   └── wire          signature envelope, log entry, revocation feed, trust root, bundle
├── canon/            deterministic canonicalization (JCS/RFC-8785) → the bytes that get hashed/signed
├── verify/           the verification library (pure; the security core of the whole platform)
│   ├── signature     dual-signature chain (publisher + registry countersign)
│   ├── hash          content-hash computation + comparison (SHA-256, multihash-tagged)
│   ├── log           transparency-log inclusion + consistency proofs
│   ├── trust         trust-root parsing, pinning, overlap-window rotation
│   └── freshness     revocation-feed cursor + TTL evaluation (fail-closed rules)
├── negotiate/        format-version negotiation (which majors this build speaks)
└── vectors/          conformance test vectors (shared by core/cli/registry/dashboard CI)
```

Ships ESM + types; changesets; SemVer. **Every wire format carries an explicit `formatVersion` (major.minor)**; `verify/` declares which majors it speaks and refuses unknown majors rather than guessing (registry spec §7).

**Schema generation direction:** the TypeScript source is the single authoring surface; JSON Schemas are **generated from it** at build (typebox-style runtime-schema library, chosen at implementation). Hand-editing an emitted schema is a CI failure — the "generated 1:1" guarantee holds because only one side is ever written by hand.

## 3. Contract types (the shapes `core` builds on)

These formalize the YAML sketches in the core spec (§3–§5) as versioned schemas.

### 3.1 Widget/plugin manifest

```jsonc
{
  "formatVersion": "1.0",
  "tag": "acme-sales-chart",              // custom-element tag; MUST be publisher-prefixed
  "kind": "widget",                        // widget | plugin | page-type | layout
  "name": "Sales Chart",
  "publisher": "acme",                     // namespace prefix; unique within one registry
  "version": "2.3.1",                      // SemVer of this artifact
  "requiresContext": { "record": { "recordType": "customer" } },
  "supportsPages": ["crm.customer-detail", "dashboards.*"],
  "size": { "default": [4,3], "min": [2,2], "max": [12,8] },
  "capabilities": [                        // declared, min(user, widget) enforced by SDK
    { "api": "records.read", "scope": "recordType:customer" }
  ],
  "props": "schemas/sales-chart.json",     // JSON-schema'd user settings
  "requires": [                            // dependency DAG; registry rejects cycles
    { "tag": "acme-chart-kit", "range": "^1.4.0" }
  ],
  "sharedScope": { "react": "^18", "@gridmason/sdk": "^1" },   // import-map ranges, checked at resolve time; omit = self-contained
  "entry": "widget.js",                    // ES module entry (registers the element), content-hashed
  "thumbnail": "assets/sales-chart.png"
}
```

- **`capabilities`** use a stable grammar: `<api>[:<scope>]`, scope is a colon-delimited path (`recordType:customer`, `net:api.acme.com`, `events:acme.sales`). Defined `api` values in v1: `records.read`, `records.write`, `net`, `events` (typed-topic namespaces — sdk §3 gates bus subscriptions on them). The SDK enforces `min(user permissions, declared capabilities)`; a capability *increase* between versions re-triggers registry review (registry spec §4, capability diff).
- **`entry` is a plain ES module** that registers the custom element (GW-D22 — native ESM + import maps, no Module-Federation runtime). `sharedScope` declares the bare-specifier ranges the widget expects the host's import map to satisfy; the registry resolution API checks each range against what the host offers **at resolve time** and emits import-map `scopes` when two widgets need different majors. Omitted `sharedScope` = fully self-contained module graph.
- **Tag lint rules** are defined here (publisher-prefix required, lowercase, one hyphen minimum) so `cli lint` and registry review run the identical check.
- **`kind: page-type`** carries a **page-type descriptor** (context declaration, `default_layout`, `locks`, `allow_user_customization`) — core §3.

### 3.2 Typed page contexts

```jsonc
{ "record": { "type": "record-ref", "recordType": "customer" },
  "team":   { "type": "record-ref", "recordType": "team" } }
```

Context **type** primitives are defined here (`record-ref`, `string`, `number`, `bool`, `id`, plus composites `list<T>`, `object<…>`). Hosts register their own context types by declaring `recordType` values; `protocol` owns the *shape*, not the domain vocabulary. The **subset check** (`requiresContext ⊆ page context`, core §6) is a pure function exported from here so picker-gating and layout-resolution use one implementation.

### 3.3 `LayoutDoc`

The versioned layout JSON from core §5, with `schemaVersion` and the per-step **migrator registry**:

```
LayoutPage { schemaVersion, page, name, default, grid, hasTabs, tabs[] }
  → LayoutTab   { name, grid }
  → LayoutGrid  { items[] }
  → LayoutWidget { widgetID:{source,tag}, i, x, y, w, h, props, slot? }
```

- **`widgetID` is source-qualified** — `{source, tag}` where `source` is a registry id, `sideload:<origin>`, or `local` (core §4). Identity comparison lives here.
- **Migrators:** one pure `migrate(vN → vN+1)` per `schemaVersion` step; `protocol` exports the chain. Unknown *newer* version → the lib returns `{ readOnly: true, reason }` rather than throwing, so hosts render read-only with a warning (never a destructive rewrite, core §5).
- Ships the **`s7k-widgets-core` POC importer** signature (localStorage layout → `LayoutDoc v1`) as a declared migrator (core M3 depends on it).

## 4. Wire formats (the security-critical contracts)

Each has a JSON Schema, a canonicalization rule, a version field, and conformance vectors. These formalize the registry spec (§2, §3, §6) and dashboard spec (§2) claims.

### 4.1 Content hash

- Algorithm: **SHA-256**, encoded as a **multihash-tagged** string (`sha2-256:<hex>`) so a future algorithm swap is a version bump, not an ambiguity.
- Hash is computed over the **exact served bytes** of each artifact file (the `entry` module, each chunk, each schema/asset). A signed release document lists `{path → hash}` for every file the runtime may load; the dashboard Service Worker verifies **by exact URL + expected hash** (dashboard §2) — trust bound per URL, never per origin.

### 4.2 Signature envelope (dual signature)

COSE/JWS-style detached envelope over the canonicalized release document:

```jsonc
{
  "formatVersion": "1.0",
  "subject": { "artifact": "acme-sales-chart@2.3.1", "releaseHash": "sha2-256:…" },
  "publisherSig": {                        // authorship
    "alg": "ES256",
    "cert": "<Sigstore short-lived cert>", // keyless default; bound to OIDC identity
    "issuer": "https://accounts.google.com",
    "subjectClaims": { "email": "dev@acme.com" },
    "sig": "…"
  },
  "registrySig": {                         // approval — applied only after review passes
    "alg": "ES256",
    "cert": "<registry countersign cert>", // key held separately from review staff
    "sig": "…"
  },
  "logInclusion": { "logId": "…", "index": 88421, "proof": [ "…" ] }
}
```

The verify lib checks **both signatures + content hash + log inclusion** before a host may load (registry §2). The **OIDC issuer is the trust anchor** for the publisher side; each registry configures an issuer allowlist, recorded in the trust root (§4.4).

### 4.3 Transparency-log entry + revocation & kill feed

- **Log entry:** Sigstore-style (Rekor-compatible shape) — `{ logId, index, integratedTime, canonicalBody, inclusionProof, checkpoint }`. The verify lib validates **inclusion proofs** and **consistency proofs** (log didn't fork) against the pinned log public key.
- **Revocation & kill feed:** signed, monotonically-versioned document per registry: `{ formatVersion, registryId, seq, issuedAt, ttlSeconds, entries:[{ artifact, state: revoked|killed, severity, reason }] }`. Hosts keep **one cursor + one TTL clock per registry** (registry §6). `freshness/` implements the **fail-closed-scoped-to-that-registry** rule: past a registry's TTL the host MUST re-check *that* feed before loading *its* remotes; other registries and everything else stay fail-open.

### 4.4 Trust-root document

```jsonc
{
  "formatVersion": "1.0",
  "registryId": "registry.gridmason.dev",
  "countersignRoots": [ "<root cert>", "<overlap next root>" ],
  "publisherCARoots": [ "<root>" ],        // for issued-cert publishers (optional path)
  "issuerAllowlist": [ "https://accounts.google.com", "https://github.com/login/oauth" ],
  "logPublicKeys": [ "<ed25519 pub>" ],
  "notBefore": "…", "notAfter": "…",
  "crossSig": "<outgoing root's signature over this doc>"   // rotation overlap
}
```

- **Two pinning channels**, both never-fetch-blind-at-runtime (registry §2): **build-time** (shipped in the host build) and **deploy-time** (operator-supplied config/secret). `trust/` parses + validates a pinned root and evaluates **overlap-window rotation** (accept old-or-new during overlap, drop old on next release). The lib refuses to trust a root supplied over the network without a pin.
- **Rotation `crossSig` (ratified from #20).** The overlap document's `crossSig` is the outgoing root's cryptographic authorization of the incoming one. `trust/` carries the field through structurally (it holds no signature primitive); `verify/release` composes the check in the `verifyRelease` orchestrator. The contract is exact:
  - **Preimage** — the **RFC-8785 (JCS, `canon/`) canonical bytes of the trust-root document with its own `crossSig` field removed** (a signature can never cover itself). The preimage is derived from the *raw received* document, not a narrowed view, so it is byte-identical to what the registry signed regardless of any additional wire fields present.
  - **Signer resolution** — `crossSig` is a base64 **ECDSA P-256 / SHA-256** signature in IEEE-P1363 (`r || s`, 64 bytes) form. It is accepted when it verifies (WebCrypto) under **any one of the operator's pinned countersign root keys** (the same SPKI-DER material the dual-signature approval check pins) — the "issued by a pinned root" rule applied to rotation.
  - **Fail-closed** — a missing `crossSig` on an overlap document, a non-base64 or wrong-length signature, a document that will not canonicalize, or no pinned key that verifies each map to the single `trust-root-rotation-invalid` reason; no throw, no partial trust. The frozen conformance vector is `test/vectors/trust/crosssig-preimage.json` (valid document + single-byte-mutated negative).

### 4.5 Offline bundle (`.gmb`)

Signed, self-verifying archive for air-gapped hosts: manifest + `entry` module + chunks + schemas + docs + the signature envelope **with embedded log-inclusion proofs** + the relevant trust-root documents (registry §3). The verify lib validates a `.gmb` against **pinned** roots only — identical chain to the online path, no network. Format includes a bundle-level content hash and a `producedBy` registry id.

## 5. The verification library (public API)

The one piece of executable code every host runs on the security hot path. **Pure, isomorphic, no I/O** — the caller fetches bytes; the lib decides.

```ts
// Given a release document + its signature envelope + pinned trust anchors,
// decide whether every listed artifact may load, and return the URL→hash map
// the Service Worker enforces. Async: WebCrypto's verify primitives are async.
verifyRelease(input: {
  release: ReleaseDoc,               // artifact id + { url → content-hash } map
  envelope: SignatureEnvelope,       // detached dual signature over the release
  trustRoot: unknown,                // untrusted, network-delivered; gated by `pins`
  pins: TrustRootPin[],              // operator's out-of-band pins (build-/deploy-time)
  publisherCARoots: Uint8Array[],    // pinned publisher CA roots (SPKI DER)
  countersignRoots: Uint8Array[],    // pinned registry roots (SPKI DER); also cross-signers
  logEntry: TransparencyLogEntry,    // Rekor-shaped inclusion evidence
  logPublicKey: LogPublicKey,        // hard-pinned checkpoint key (GW-D17)
  now: number,                       // caller supplies clock — keeps the lib pure
}): Promise<VerifyResult>   // { ok, urlHashes: Map<url,hash>, issuer, subject } | { ok:false, reason }

verifyChunk(bytes: Uint8Array, expectedHash: Hash): Promise<boolean>   // SW per-fetch check (async: WebCrypto)
evaluateFreshness(feed: RevocationFeed, cursor: Cursor, now): FreshnessVerdict  // fail-closed rule
negotiate(local: FormatSupport, remote: FormatVersion): 'ok'|'upgrade'|'refuse'
```

- Every `reason` is a **stable enum** (not a free-form string) so hosts render consistent, non-leaky error boundaries and telemetry aggregates cleanly.
- The lib **never** takes a URL and fetches it; **never** takes a private key. Signing lives in the CLI/registry; the lib is the verify half only. This keeps the attack surface of the most-pinned package minimal.
- **Shipped shape (P-E3, #20).** `verifyRelease` and `verifyChunk` are **async** — the verify core is WebCrypto-only (no Node `crypto`), so every signature/hash primitive returns a `Promise`, keeping the package isomorphic. `VerifyReleaseInput` carries **concrete leaf inputs** rather than an abstract `roots` bag: the untrusted `trustRoot` document plus its authorizing `pins`, the two pinned root-key sets (`publisherCARoots`, `countersignRoots`), and the transparency-log evidence as a full `logEntry` checked against a **hard-pinned `logPublicKey` checkpoint key (GW-D17)** — no in-band key discovery. `ReleaseDoc` is defined in the `verify` module and, unlike the other wire formats, ships **without a JSON Schema**: its integrity is hash-binding, not schema validation — its canonical bytes must hash to the signature envelope's `subject.releaseHash`, so a tampered document breaks the signature rather than a schema check.

## 6. Format lifecycle & negotiation

- Every format carries `formatVersion: major.minor`. **Minor = additive/back-compatible**; **major = breaking**. `verify/` and `negotiate/` declare the majors a build speaks.
- **Deprecation:** a new major ships alongside the old for a **dual-running window ≥ one host release cycle**; the transparency log records format-major usage so operators see migration progress. *Serving* retirement of a retired major is a per-registry distribution-state decision (registry §7); `protocol` only defines when a build *stops speaking* a major.
- Conformance vectors in `vectors/` are versioned by format major; `core`/`cli`/`registry`/`dashboard` all run them in CI — a divergent implementation fails a shared test, not production.

## 7. Security posture

- The package that everything pins must itself be minimal and auditable: **no network, no fs, no crypto private-key handling, no dynamic code.** Verification is deterministic given (bytes, roots, clock).
- Canonicalization (`canon/`, JCS/RFC-8785) removes signature-malleability: the bytes signed and the bytes verified are byte-identical regardless of JSON key order or whitespace.
- Reason enums and the no-tag-echo rule (core §8) are defined here so *no* consumer accidentally leaks a gated-off/unknown widget's identity.
- Test vectors include **negative** cases (tampered hash, wrong issuer, expired root, forked log, stale-past-TTL feed) — a consumer that "passes" a tampered vector fails CI.

## 8. Package + repo

- Publishes `@gridmason/protocol` (ESM + types; JSON Schemas emitted as artifacts for non-JS consumers; changesets; SemVer with deprecation windows). **License: AGPL-3.0 (GW-D8); all contributions require the CLA.**
- Repo: `src/types`, `src/canon`, `src/verify`, `src/negotiate`, `test/vectors`. 100% unit coverage on `verify/` and `canon/` (this is the security core). No Storybook (no UI). No dependency on any other Gridmason package.
- Depends on: minimal, audited crypto/canonicalization primitives only (e.g. a WebCrypto wrapper, an RFC-8785 canonicalizer, a COSE/JWS verifier). Every dependency on the verify path is pinned and reviewed.

## 9. Milestones

0. **M0a — types**: manifest, page-context, and `LayoutDoc` schemas + migrator framework + the subset/identity pure functions. **Unblocks `core` M1** (core pins these).
1. **M0b — wire formats + verify lib**: signature envelope, log entry, revocation feed, trust-root, `.gmb` bundle + `verifyRelease`/`verifyChunk`/`evaluateFreshness`/`negotiate` + conformance vectors. **Unblocks `registry` M1 and `dashboard` M2/M3.**
2. **M1 — format lifecycle**: version negotiation + deprecation/dual-running policy + POC importer migrator.
3. Exit: `core`, `cli`, `registry`, and `dashboard` all build against a single published `@gridmason/protocol` and pass the shared conformance vectors.
