---
'@gridmason/protocol': minor
---

Add the dual-signature envelope wire format and its pure verification library
(SPEC §4.2, FR-9).

- New `SignatureEnvelope` contract type under `@gridmason/protocol/types` (a
  COSE/JWS-style detached envelope over the canonicalized release document:
  `subject`, `publisherSig`, `registrySig`, `logInclusion`), with its JSON Schema
  generated from the TypeScript source (`schemas/signature-envelope.schema.json`,
  exported at `@gridmason/protocol/schemas/signature-envelope.json`).
- New `verifySignatureEnvelope` in `@gridmason/protocol/verify`: verifies the
  publisher signature (Sigstore keyless — leaf certificate issued by a pinned CA
  root, attested OIDC issuer enforced against the trust-root allowlist, SAN
  identity bound) and the registry countersignature (against pinned countersign
  roots), plus the subject/content-hash binding. Every failure is a stable
  `SignatureVerdictReason`.

Signature math is WebCrypto only (ECDSA P-256 / `ES256`); the package keeps zero
runtime dependencies. Log-inclusion, trust-root parsing, and the `verifyRelease`
orchestrator land in later P-E3/P-E4 issues.
