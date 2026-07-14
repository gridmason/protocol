---
"@gridmason/protocol": patch
---

P-E2 canonicalization + hashing layer (epic #11): RFC-8785/JCS `canonicalize`
(zero-dep, security core, 100% covered), SHA-256 content hash with
multihash-tagged strings (`hashBytes`/`verifyHash`, stable reason enums,
unknown prefix refused), the release `{path → hash}` map type, and published
canon-wire/hash-wire conformance vectors (positive + tampered negatives)
through the one-import runner at `@gridmason/protocol/vectors`.
