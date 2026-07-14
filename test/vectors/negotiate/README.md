# Format-version negotiation vectors

Conformance vectors for `negotiate(local, remote)` (`src/negotiate`,
docs/SPEC.md §5, §6): the format-version handshake that decides whether a remote
artifact's `formatVersion` may be read as-is (`ok`), is a still-readable older
major the peer should migrate off (`upgrade`), or is refused (`refuse`).

Grouped by expected outcome:

- `ok.json` — the remote is on the current major this build speaks.
- `upgrade.json` — the remote is on an older major still inside its dual-running
  window (the build still speaks it, but a newer major exists).
- `refuse.json` — a major newer than any spoken, a major no longer spoken, or a
  malformed version. `negotiate` never guesses.

Each vector has:

- `name` — stable id.
- `note` — optional; what it exercises.
- `speaks` — the format majors the negotiating build speaks (SPEC §6). The newest
  value is that build's *current* major.
- `remote` — the remote artifact's `major.minor` `formatVersion` (or a
  deliberately malformed string).
- `outcome` — the required verdict: `ok` | `upgrade` | `refuse`.

## Versioning by format major

Vectors are **versioned by format major** (SPEC §6): the `speaks` set names the
majors under test, so introducing a new format major adds vectors here without
disturbing the ones already pinned. The same corpus is exported programmatically
as `negotiateVectors` from `@gridmason/protocol/vectors` and run through
`runConformanceVectors`, so `core` / `cli` / `registry` / `dashboard` exercise
an identical handshake in their own CI.

## Policy

`protocol` defines only when a build **stops speaking** a major — that is, when a
major leaves `speaks`. *Serving* retirement of a retired major is a per-registry
distribution decision, out of scope here. See the repository README's
"Format lifecycle: deprecation & dual-running" section.
