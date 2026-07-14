# protocol

`@gridmason/protocol` — Gridmason contract types (widget manifest, page contexts, LayoutDoc) + signature / transparency-log / revocation-feed / trust-root formats + the public verification library. Everything else pins it (M0). Public OSS (AGPL-3.0). Engineering spec: `docs/SPEC.md` · Build plan: `docs/specs/protocol-v0/spec.md`.

## Conformance vectors

`@gridmason/protocol` ships the **type conformance vectors** for its Phase A
contracts (manifest schema + tag/capability grammar, page-context subset,
LayoutDoc migration) together with a runner, so every consumer — `core`, `cli`,
`registry`, `dashboard` — proves the same behaviour in its own CI. A divergent
implementation then fails a shared test rather than production (SPEC §6, §7).

Run them from a downstream repo with **one import and one call**:

```ts
import { runConformanceVectors } from '@gridmason/protocol/vectors';
import { expect, test } from 'vitest'; // or any test runner

test('conforms to @gridmason/protocol type vectors', () => {
  const report = runConformanceVectors();
  expect(report.ok, report.failures).toBe(true);
});
```

With no argument the runner tests `@gridmason/protocol`'s own exported functions.
To test **your** implementation, pass a `ConformanceSurface` — every member is
optional and falls back to the package's:

```ts
runConformanceVectors({
  isContextSubset: myContextSubset,
  lintTag: myLintTag,
  migrate: myMigrate,
});
```

The runner is framework-agnostic (it returns a report, it never calls a test
framework), so advanced consumers can instead import the raw vector arrays
(`manifestVectors`, `contextVectors`, `layoutVectors`, …) and drive one test case
per vector.

### The security wire-format negatives (async)

The full SPEC §7 negative set — **tampered hash, wrong issuer, expired root,
forked log, stale-past-TTL feed** — ships as published vectors too, so a consumer
that "passes" a tampered vector fails its own CI. The signature and log groups use
WebCrypto and are therefore async: use `runConformanceVectorsAsync`, which runs
the full corpus (the sync groups plus `hash-wire`, `signature`, and
`log-consistency`) in one import:

```ts
import { runConformanceVectorsAsync } from '@gridmason/protocol/vectors';

test('conforms to @gridmason/protocol conformance vectors', async () => {
  const report = await runConformanceVectorsAsync();
  expect(report.ok, report.failures).toBe(true);
});
```

Pass a `ConformanceSurface` to test your own verifiers (`verifySignatureEnvelope`,
`evaluateTrustRoot`, `verifyLogConsistency`, `evaluateFreshness`, `verifyHash`), or
import the raw arrays (`signatureVectors`, `trustRootVectors`,
`logConsistencyVectors`, `freshnessVectors`, `hashWireVectors`) to drive one case
per vector. All vectors are recorded fixtures — no network, no key handling — and
versioned by format major (SPEC §6).

### Manifest schema validation (injected validator)

The published package carries **zero runtime dependencies**, so it cannot bundle
a JSON-Schema validator. For full manifest-schema fidelity, inject one compiled
against the shipped schema — for example with `ajv`, which you already have as a
dev dependency:

```ts
import { Ajv } from 'ajv';
import manifestSchema from '@gridmason/protocol/schemas/manifest.json' with { type: 'json' };

const validate = new Ajv({ strict: false }).compile(manifestSchema);
runConformanceVectors({ validateManifest: (m) => validate(m) === true });
```

When `validateManifest` is omitted the runner uses `defaultValidateManifest`, a
minimal dependency-free structural check (required fields, the `formatVersion` /
`version` patterns, the `kind` enum, no unknown top-level keys) — enough to run
zero-config, but inject `ajv` for the authoritative schema.

> Phase A ships the **type** vectors; Phase B completes the security
> **wire-format** negatives (tampered hash, wrong issuer, expired root, forked
> log, stale feed) in the same corpus and runner (FR-15, P-E2 / P-E4). The whole
> set is now published — see the async runner above.

## Format lifecycle: negotiation & dual-running

Every gridmason wire format carries a `formatVersion: major.minor` string.
**Minor is additive / back-compatible; major is breaking.** A build declares the
set of majors it can read — a `FormatSupport` — and `negotiate` decides how to
treat a remote artifact's version:

```ts
import { negotiate, PROTOCOL_FORMAT_SUPPORT } from '@gridmason/protocol/negotiate';

negotiate(PROTOCOL_FORMAT_SUPPORT, manifest.formatVersion);
// 'ok'      → the current major this build speaks; read it as-is.
// 'upgrade' → an older major still spoken (dual-running); readable now, but the
//             peer should migrate to the current major.
// 'refuse'  → a major newer than any spoken, a major no longer spoken, or a
//             malformed version. Never guessed — do not load the artifact.
```

`PROTOCOL_FORMAT_SUPPORT` is the majors *this* package speaks (currently `1`,
matching the `verify/` hot path); a host with its own dual-running policy passes
its own `{ speaks: [...] }`. The newest value in `speaks` is the **current**
major that new artifacts should target; every older entry is a major still inside
its dual-running window.

### Deprecation & dual-running policy

- **A new major ships alongside the old.** When a breaking major `N+1` lands, the
  build keeps speaking major `N` for a **dual-running window of at least one host
  release cycle**, so a fleet can migrate without a flag day. During the window a
  remote on `N` negotiates to `upgrade` (still read, but flagged for migration)
  while `N+1` is `ok`.
- **The transparency log records format-major usage,** so operators can watch
  migration progress across the window and know when a major has drained.
- **`protocol` defines only when a build _stops speaking_ a major.** A major is
  retired from a build exactly when it leaves that build's `speaks` set; after
  that, a remote on the dropped major negotiates to `refuse`, not `upgrade`.
- ***Serving* retirement is out of scope here.** Whether a registry still
  *distributes* artifacts on a retired major is a per-registry distribution-state
  decision (registry spec §7), independent of whether a build will *read* one.

Conformance vectors for the handshake are exported as `negotiateVectors` (run via
`runConformanceVectors`) and mirrored as JSON fixtures under
`test/vectors/negotiate/`, versioned by format major (SPEC §6).

## Releasing

Versioning and publishing are driven by [changesets](https://github.com/changesets/changesets). The package ships ESM + type declarations under SemVer 0.x, publishing to npm as `@gridmason/protocol`.

**Add a changeset with every change that should ship.** After making a change, run:

```bash
npm run changeset
```

Pick the bump (patch/minor/major — we are pre-1.0, so breaking changes are `minor` and everything else is `patch`) and write a one-line summary. This drops a markdown file in `.changeset/`; commit it with your PR.

**How a changeset becomes a publish:**

1. PRs land on `main` carrying their `.changeset/*.md` files.
2. The [`release`](.github/workflows/release.yml) workflow runs on every push to `main`. When unreleased changesets are present it opens (or updates) a **"Version Packages"** PR that consumes the changesets, bumps `package.json`, and updates `CHANGELOG.md`.
3. Merging that PR pushes the version bump to `main`, which re-runs the workflow — this time with no pending changesets, so it runs `changeset publish` and pushes the release to npm.

Publishing authenticates with **npm Trusted Publishing (OIDC)** — there is no `NPM_TOKEN` secret. The workflow requests `id-token: write` and npm exchanges the GitHub OIDC token at publish time; [build provenance](https://docs.npmjs.com/generating-provenance-statements) is attached automatically (`NPM_CONFIG_PROVENANCE`).

### Maintainer one-time setup (npmjs.com trusted publisher)

Trusted Publishing must be enabled once on npmjs.com before CI can publish. The `@gridmason` scope must already exist (`npm org create gridmason`) and the first `0.0.x` version must already be published (bootstrapped locally). Then, on npmjs.com:

**Package `@gridmason/protocol` → Settings → Trusted Publisher → GitHub Actions**, with:

| Field | Value |
|---|---|
| Organization / user | `gridmason` |
| Repository | `protocol` |
| Workflow filename | `release.yml` |
| Environment | *(leave blank)* |

After this is saved, the CI `release` workflow publishes without any token.
