---
"@gridmason/protocol": minor
---

P-E4 `.gmb` offline bundle format + offline verification (FR-13, issue #22, SPEC
§4.5). Adds the `GmbBundle` wire type (`@gridmason/protocol` +
`@gridmason/protocol/types`) — a signed, self-verifying archive for air-gapped
hosts packing the manifest, servable file bytes (entry + chunks + schemas +
docs), the signature envelope with embedded log-inclusion proof, the embedded
trust-root document, a bundle-level content hash, and a `producedBy` registry id
— plus its generated JSON Schema (`@gridmason/protocol/schemas/gmb-bundle.json`).

Adds `verifyOfflineBundle(input)` under `@gridmason/protocol` and
`@gridmason/protocol/verify`: it seals the archive by recomputing the bundle-level
content hash over the canonical payload, then composes the **identical**
`verifyRelease` chain (dual signature, embedded inclusion proof, content hashes)
sourced entirely from the bundle and checked against **pinned roots only** — no
network of any kind. It returns the same `url → hash` verdict shape as the online
path and every stable `VerifyReleaseReason` unchanged (a bundle whose embedded
root is not pinned refuses with the same `trust-root-untrusted` as the online
unpinned case), adding two archive-integrity classes: `bundle-malformed` and
`bundle-hash-tampered`. Held at the 100% verify-core coverage gate.
