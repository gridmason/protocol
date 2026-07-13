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

> Phase A ships the **type** vectors above. The security **wire-format**
> negatives (tampered hash, wrong issuer, expired root, forked log, stale feed)
> are added in Phase B (FR-15, P-E2 / P-E4) to the same corpus and runner.

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
