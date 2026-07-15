---
"@gridmason/protocol": minor
---

Add a public `verifyRevocationFeed(signed, { countersignRoots })` primitive and
the `SignedRevocationFeed` wire type (`@gridmason/protocol` +
`@gridmason/protocol/verify` + `@gridmason/protocol/types`; issue #70, dashboard
D-E3.3). Hosts fetch a registry's revocation & kill feed wrapped in a detached
signature; `verifyRevocationFeed` authenticates that ES256 signature over
`canonicalize(feed)` against the pinned countersign roots — the same trust leg as
the registry countersignature in `verifySignatureEnvelope` — and returns the
authenticated `feed` for `evaluateFreshness`. Pure, isomorphic, WebCrypto-only,
zero runtime dependencies. Adds a generated JSON Schema at
`@gridmason/protocol/schemas/signed-revocation-feed.json` with a byte-identical
drift guard, and the shared ECDSA/cert primitives are factored into
`src/verify/signature/ecdsa.ts` so both verifiers compose one audited surface.
