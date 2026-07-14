---
"@gridmason/protocol": minor
---

P-E4 format-version negotiation + deprecation/dual-running policy (FR-16, issue
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
major, and *serving* retirement is a per-registry decision (out of scope).
