# Signature-envelope wire vectors

Vectors for dual-signature envelope verification (`src/verify/signature`,
docs/SPEC.md §4.2, FR-9): a publisher signature (Sigstore keyless — a short-lived
certificate bound to an OIDC identity) plus a registry countersignature, over the
canonicalized release document.

## Files

- `build.ts` — the fixture builder. Mints real ECDSA-P256 key pairs, DER X.509
  leaf certificates (with the Fulcio-style OIDC-issuer + SAN extensions), and
  signatures with WebCrypto, and assembles a fully valid `SignatureEnvelope` +
  its pinned trust inputs (`buildScenario`). It carries a tiny DER **encoder** —
  the mirror of the lib's minimal decoder — and is the production/sign side the
  pure verify lib deliberately omits (signing lives outside `@gridmason/protocol`,
  SPEC §5). It lives under `test/` and is never shipped.
- `wire.test.ts` — the vector table: the canonical positive plus the headline
  negatives (subject/hash mismatch, wrong issuer, off-allowlist, tampered
  publisher signature, missing countersignature, tampered countersignature), each
  pinned to its stable `SignatureVerdictReason`.

## Why these are generated, not a frozen blob

The content-hash KATs next door (`../hash/sha256-kat.json`) pin a deterministic
digest and can be a static file. Signature vectors cannot: ECDSA signing is
randomized, so a committed byte blob is not reproducible, and freshly-minted
genuine certificates exercise the real DER parse + WebCrypto verify path on every
run. The exhaustive per-reason unit coverage lives in
`test/verify/signature/{signature,der}.test.ts`; this table is the consumer-shaped
acceptance corpus.

The shared cross-repo conformance corpus (`src/vectors`) gains its signature and
log negatives in P-E4 (see `src/vectors/types.ts`).
