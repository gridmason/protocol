# Contributing to `@gridmason/protocol`

Thanks for your interest in contributing. This package is the **M0 contract +
verification core** of Gridmason: it defines the wire formats (widget manifest,
page contexts, `LayoutDoc`, signature envelope, transparency-log entry,
revocation feed, trust root, `.gmb` bundle) and ships the pure library every
host, CLI, and registry uses to compute identity and verify releases. Everything
else in the platform pins it. Because a change here ripples to every consumer,
the contribution process is deliberately strict about **contracts** and
**correctness**.

Please also read our [Code of Conduct](./CODE_OF_CONDUCT.md) and
[Security Policy](./SECURITY.md). Never file a suspected vulnerability as a
public issue or PR — follow [SECURITY.md](./SECURITY.md) instead.

## Contributor License Agreement (required)

Gridmason is released under [AGPL-3.0](./LICENSE), and Sniper7Kills LLC offers it
under separate commercial terms as well. To keep dual licensing possible, **every
contributor must sign the [Contributor License Agreement](./.github/CLA.md)**
before their pull request can be merged.

You do not need to do anything up front. When you open your first pull request, a
bot comments with the CLA text and a one-line instruction; you sign by replying
with the exact sentence it gives you. The signature is recorded once and applies
to all your future contributions. PRs from unsigned contributors are blocked from
merging until the CLA is signed.

## Development setup

Requirements: **Node.js >= 22** (the package targets modern ESM; see `engines`
in `package.json`) and npm.

```bash
git clone https://github.com/gridmason/protocol.git
cd protocol
npm ci          # install exact, locked dependencies
```

Local checks — these are exactly what CI runs, and all four must be green before
you open a PR:

```bash
npm run build        # tsc -> dist/ (ESM + type declarations)
npm test             # vitest run
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
```

Useful during development:

```bash
npm run test:watch   # vitest in watch mode
npm run coverage     # enforces the 100% coverage gate on src/verify + src/canon
npm run lint:fix     # auto-fix lint issues
```

### The coverage gate is not negotiable

`src/verify` and `src/canon` are the security hot path, so they carry a **100%
unit-coverage gate** (GW-D20), enforced by `npm run coverage` in CI. Any change
touching those paths must land with tests — including **negative** vectors
(tampered hash, wrong issuer, expired root, forked log, stale-past-TTL feed). A
consumer that "passes" a tampered vector is a failure, so we test that rejection
explicitly. There is no path to merge that lowers coverage on these directories.

## The contract-first change process

The formats in this package are contracts that other repos build against. That
constrains *how* changes are allowed to happen:

- **Wire formats change only through versioned releases — never in place.** Every
  format carries an explicit `formatVersion: major.minor`.
  - **Minor** = additive and backward-compatible (new optional field, new enum
    value that older readers can ignore).
  - **Major** = breaking. A new major ships *alongside* the old one for a
    dual-running window of at least one host release cycle; `verify/` and
    `negotiate/` declare which majors a build speaks and **refuse unknown majors
    rather than guessing.**
- **Conformance vectors are part of the contract.** Vectors in `test/vectors`
  are versioned by format major and are run by `core`, `cli`, `registry`, and
  `dashboard` in their own CI. If you change a format, add or update the vectors
  in the same PR so a divergent implementation fails a shared test instead of
  production.
- **Cross-repo needs are contract-first, not atomic.** We do not do coordinated
  cross-repo merges. If a consumer needs a contract change, land it here, cut a
  release, and let dependents bump on their own cadence. If you are a Gridmason
  maintainer and a change requires work in another repo, file an issue in that
  repo — do not couple the merges.
- **Keep the core minimal and auditable.** No network, no filesystem, no
  private-key handling, no dynamic code, and no dependency on any other Gridmason
  package. New dependencies on the verify path must be minimal, pinned, and
  justified in the PR.

## Changesets (required on user-facing changes)

This package publishes to npm via [changesets](https://github.com/changesets/changesets)
with SemVer. **Any change that affects consumers — a format, an exported type or
function, runtime behavior, or the public API — must include a changeset** so the
release notes and version bump are generated correctly:

```bash
npx changeset
```

Pick the bump that matches the impact:

- **patch** — bug fix with no API or format change.
- **minor** — additive, backward-compatible change (including a new format
  *minor*).
- **major** — a breaking change (including a new format *major*). Pre-1.0, breaking
  changes bump the `0.x` minor per SemVer's 0.x rules; call them out clearly in
  the changeset regardless.

Changesets are **not** required for changes with no consumer impact (internal
refactors with identical behavior, tests, CI, or documentation). If in doubt,
add one — an extra patch note is cheaper than a missed release.

## Pull request checklist

Before you open a PR:

- [ ] `npm run build && npm test && npm run lint && npm run typecheck` all pass.
- [ ] `npm run coverage` passes if you touched `src/verify` or `src/canon`.
- [ ] Tests added/updated, including negative cases for verification changes.
- [ ] Conformance vectors added/updated if you changed a wire format.
- [ ] A changeset is included if the change is user-facing.
- [ ] The CLA is signed (the bot will guide you on your first PR).
- [ ] The PR description explains the *contract* impact — is this additive
      (minor) or breaking (major), and which format(s) or exports are affected?

Small, focused PRs review faster. For a significant change, opening an issue to
discuss the approach first is welcome — especially for anything that touches a
wire format or the verification logic.

## License

By contributing, you agree that your contributions are licensed under the
project's [AGPL-3.0](./LICENSE) license and are covered by the terms of the
[CLA](./.github/CLA.md) you signed.
