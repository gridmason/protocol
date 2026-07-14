---
"@gridmason/protocol": patch
---

Ratify the rotation `crossSig` contract in the SPEC and wire docs (issue #57,
follow-up to #20). SPEC §4.4 now pins the exact contract the `verifyCrossSig`
check implemented: the signed **preimage** is the RFC-8785 canonical bytes of
the trust-root document with its own `crossSig` field removed, and the base64
ECDSA P-256 / SHA-256 signature is accepted when it verifies (WebCrypto) under
any of the operator's pinned countersign root keys — every failure mapping to
the single `trust-root-rotation-invalid` reason. The `TrustRootDoc.crossSig` doc
comment carries the same ratification, so the generated
`trust-root.schema.json` description is updated (the only shipped-artifact
change). SPEC §5 records the shape shipped in P-E3: `verifyRelease` /
`verifyChunk` are async (WebCrypto-only), `VerifyReleaseInput` carries concrete
leaf inputs against a hard-pinned log checkpoint key (GW-D17), and `ReleaseDoc`
lives in the verify module hash-bound to the signed subject rather than
schema-validated. Adds the frozen `test/vectors/trust/crosssig-preimage.json`
conformance vector (valid document + single-byte-mutated negative). Docs and one
vector only — no behavior change.
