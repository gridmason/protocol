---
"@gridmason/protocol": patch
---

P-E3 transparency-log entry + proof validation (FR-10, issue #17): the
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
