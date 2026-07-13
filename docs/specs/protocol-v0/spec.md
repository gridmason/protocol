---
name: Gridmason Protocol v0
slug: protocol-v0
status: approved
created: 2026-07-13
approved: 2026-07-13
---

# Gridmason Protocol v0

## Overview

`@gridmason/protocol` is the single source of truth for every contract two Gridmason parts meet on: the types (widget manifest, page contexts, LayoutDoc), the wire formats (signature envelope, transparency-log entry, revocation feed, trust root, `.gmb` bundle), and the pure verification library every host runs before loading a remote. It sits at the root of the dependency DAG — `core`, `sdk`, `cli`, `registry`, and `dashboard` all pin it; it depends on none of them.

Full engineering spec: [`docs/SPEC.md`](../../SPEC.md). This package cuts it into buildable epics: **Phase A** ships the contract types (unblocks every other repo); **Phase B** ships canonicalization, wire formats, and the verify lib (unblocks the registry and dashboard hardening).

## Goals

- Every other repo builds against a published `@gridmason/protocol` 0.x from npm (contract-first, GW-D22 loading model).
- One implementation of identity, subset-check, and verification shared by CLI, registry, and hosts — divergence is a CI failure, not a field incident.
- 100% unit coverage on `verify/` + `canon/` (the GW-D20 hard gate).

## Non-goals

- No I/O of any kind (no network, no fs) — callers supply bytes, roots, and the clock.
- No signing, no key handling — the lib verifies only (signing = CLI/registry via Sigstore).
- No UI, no Storybook.
- Format *retirement serving* decisions (per-registry, registry spec §7).

## Users & personas

- **Repo maintainers** of core/sdk/cli/registry/dashboard — consume types + verify lib.
- **Widget authors** — indirectly, via manifest schema errors from `gridmason lint`.
- **Registry operators / auditors** — verify what a registry shipped using the same lib.

## Functional requirements

- **FR-1** Widget/plugin manifest schema (SPEC §3.1): TS types + generated JSON Schema; `entry` ES-module field; tag lint rules (publisher prefix, lowercase, ≥1 hyphen); capability grammar `<api>[:<scope>]` with v1 apis `records.read`, `records.write`, `net`, `events`.
- **FR-2** Typed page-context primitives + composites (SPEC §3.2) and the pure subset check `requiresContext ⊆ pageContext`.
- **FR-3** `LayoutDoc` schema with `schemaVersion`, per-step migrator registry, migrate-on-read chain; unknown-newer version returns `{readOnly, reason}` — never throws, never rewrites (SPEC §3.3).
- **FR-4** Source-qualified widget identity `(source, tag)` comparison functions.
- **FR-5** JSON Schemas are generated from TS source at build; hand-edited emitted schema fails CI (SPEC §2).
- **FR-6** `s7k-widgets-core` POC importer (localStorage layout → LayoutDoc v1) as a declared migrator.
- **FR-7** Deterministic canonicalization (JCS/RFC-8785) — bytes signed = bytes verified (SPEC §4, §7). *(Phase B)*
- **FR-8** Content hash: SHA-256, multihash-tagged strings, per-file `{path → hash}` release maps (SPEC §4.1). *(B)*
- **FR-9** Dual-signature envelope verification: publisher (Sigstore keyless, OIDC issuer allowlist) + registry countersign (SPEC §4.2). *(B)*
- **FR-10** Transparency-log entry validation: Rekor-compatible inclusion + consistency proofs against pinned log keys (GW-D17) (SPEC §4.3). *(B)*
- **FR-11** Revocation & kill feed: cursor + TTL evaluation, fail-closed scoped to the stale registry only (SPEC §4.3). *(B)*
- **FR-12** Trust-root document: parse, pin validation, overlap-window rotation; never trust an unpinned network-supplied root (SPEC §4.4). *(B)*
- **FR-13** `.gmb` offline bundle format + offline verification with embedded inclusion proofs (SPEC §4.5). *(B)*
- **FR-14** Public verify API: `verifyRelease`, `verifyChunk`, `evaluateFreshness`, `negotiate`; every failure reason is a stable enum (SPEC §5). *(B)*
- **FR-15** Conformance vectors, including negative cases (tampered hash, wrong issuer, expired root, forked log, stale feed); consumed by core/cli/registry/dashboard CI (SPEC §6, §7). Type vectors in A, wire vectors in B.
- **FR-16** Format-version negotiation + deprecation/dual-running policy (SPEC §6). *(B)*
- **FR-17** Publishes to npm as `@gridmason/protocol` 0.x via changesets from day 1 (ESM + types + emitted schemas).

## Architecture & stack

Node + TypeScript, ESM-only, zero runtime deps beyond audited crypto/canonicalization primitives (WebCrypto wrapper, RFC-8785 canonicalizer, COSE/JWS verifier — pinned + reviewed). Pure & isomorphic (browser/Node/edge). Layout per SPEC §2: `src/types`, `src/canon`, `src/verify`, `src/negotiate`, `test/vectors`. Schema generation: typebox-style, TS is the authoring surface.

## Data model

The package *is* the data model — see SPEC §3–§4 for every schema. No storage.

## Screens & UX

None (library).

## Epics & issues

Cross-repo protocol: workers may file issues in other `gridmason` org repos when a contract change is needed — never outside repos we control.

### Epic: P-E0 Bootstrap
Goal: a releasable empty package — CI, changesets, npm publish path, community files.
Depends on: none

- [ ] Repo scaffold: TS ESM package, tsconfig, vitest, lint, CI workflow (build+test+coverage gate)
      FRs: FR-17
      Acceptance: CI green on empty lib; coverage gate wired (100% enforced on `src/verify`+`src/canon` paths when they exist)
      Depends on: none
- [ ] Release pipeline: changesets + npm publish (0.0.x) + provenance; verify `@gridmason` scope availability and publish first stub
      FRs: FR-17
      Acceptance: `npm i @gridmason/protocol@0.0.x` resolves; publish runs from CI on tagged changeset
      Depends on: Repo scaffold
- [ ] Community files: CONTRIBUTING, SECURITY.md (disclosure), CoC, CLA-assistant config, AGPL-3.0 LICENSE
      FRs: —
      Acceptance: CLA check blocks an un-signed external PR (verified with a test PR)
      Depends on: Repo scaffold

### Epic: P-E1 Contract types (Phase A — unblocks core/sdk/cli/dashboard)
Goal: manifest, context, and LayoutDoc types published with generated schemas and shared pure functions.
Depends on: P-E0

- [ ] Manifest types + generated JSON Schema + tag lint rules + capability grammar
      FRs: FR-1, FR-5
      Acceptance: schema round-trips SPEC §3.1 example; tag rules reject bad tags in unit tests; CI fails on hand-edited emitted schema (guard test)
      Depends on: none
- [ ] Page-context types + subset check
      FRs: FR-2
      Acceptance: subset check passes/fails per SPEC §3.2 examples incl. composites; exported as pure function
      Depends on: none
- [ ] LayoutDoc types + migrator framework + source-qualified identity
      FRs: FR-3, FR-4
      Acceptance: v-chain migration test; unknown-newer returns `{readOnly, reason}`; identity comparison covers registry/sideload/local sources
      Depends on: none
- [ ] POC importer migrator
      FRs: FR-6
      Acceptance: sample s7k-widgets-core localStorage fixture converts to valid LayoutDoc v1
      Depends on: LayoutDoc types + migrator framework
- [ ] Type conformance vectors + vector-runner package export
      FRs: FR-15
      Acceptance: vectors published in the package; a consumer repo can run them with one import (documented)
      Depends on: Manifest types, Page-context types, LayoutDoc types

### Epic: P-E2 Canonicalization + hashing (Phase B)
Goal: the byte-level foundations every signature rests on.
Depends on: P-E1

- [ ] RFC-8785 canonicalization module
      FRs: FR-7
      Acceptance: JCS test suite passes; key-order/whitespace variants produce identical bytes
- [ ] Content hash + multihash tagging + release `{path→hash}` map type
      FRs: FR-8
      Acceptance: known-vector hashes match; unknown multihash prefix refused with stable enum
      Depends on: RFC-8785 canonicalization module
- [ ] Wire-format vector harness (positive + tampered negatives for canon/hash)
      FRs: FR-15
      Acceptance: tampered-byte vector fails verification in CI
      Depends on: Content hash

### Epic: P-E3 Wire formats + verify lib (Phase B)
Goal: `verifyRelease` end to end — dual signature, log inclusion, freshness, trust roots.
Depends on: P-E2

- [ ] Signature-envelope types + dual-signature verification (Sigstore keyless publisher + registry countersign)
      FRs: FR-9
      Acceptance: valid envelope verifies; wrong issuer / missing countersign rejected with distinct reason enums
- [ ] Transparency-log entry types + inclusion/consistency proof validation (Rekor-compatible)
      FRs: FR-10
      Acceptance: real Rekor-shaped fixture verifies; forked-log vector rejected
- [ ] Revocation & kill feed types + `evaluateFreshness` (fail-closed scoped per registry)
      FRs: FR-11
      Acceptance: stale-past-TTL blocks only that registry's remotes in unit scenarios
- [ ] Trust-root document parsing + pinning + overlap rotation
      FRs: FR-12
      Acceptance: overlap window accepts old+new; unpinned root refused; expired root vector rejected
- [ ] `verifyRelease`/`verifyChunk` orchestration + stable reason enums + no-tag-echo rule
      FRs: FR-14
      Acceptance: full happy-path vector returns url→hash map; every negative vector maps to a documented enum
      Depends on: all four above

### Epic: P-E4 Bundles + negotiation (Phase B)
Goal: offline path + format lifecycle.
Depends on: P-E3

- [ ] `.gmb` bundle format + offline verification (embedded proofs, pinned roots only)
      FRs: FR-13
      Acceptance: bundle vector verifies with network mocked away entirely
- [ ] `negotiate()` + deprecation/dual-running policy doc
      FRs: FR-16
      Acceptance: unknown major → `refuse`; minor bump → `ok`; policy documented in README
- [ ] Negative-vector completion sweep (SPEC §7 list) + coverage audit to 100% on verify/canon
      FRs: FR-15
      Acceptance: coverage report 100% lines/branches on `src/verify` + `src/canon`

## Milestones

1. **M-A (Phase A exit for this repo):** P-E0 + P-E1 merged, `@gridmason/protocol@0.x` on npm with types + type vectors. Unblocks every other repo's Phase A.
2. **M-B:** P-E2→P-E4 merged; verify lib + wire vectors published. Unblocks registry E1 and dashboard E4.

## Risks & open questions

- `@gridmason` npm scope must be claimed before P-E0 issue 2 (user action: `npm org create gridmason`).
- COSE/JWS + Sigstore verification lib choice (sigstore-js?) — decide in P-E3 issue 1; pin + audit whatever is chosen.
- Rekor public-instance rate limits for CI fixtures — use recorded fixtures, never live network in tests (lib is pure anyway).

## Changelog

- 2026-07-13 — initial draft from the approved engineering spec set (Phase A+B per user direction).
