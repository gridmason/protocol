---
"@gridmason/protocol": patch
---

P-E3 trust-root document + pinning + overlap rotation (FR-12, issue #19): the
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
