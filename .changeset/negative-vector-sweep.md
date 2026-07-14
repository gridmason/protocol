---
"@gridmason/protocol": minor
---

P-E4 negative-vector completion sweep + verify/canon coverage audit (FR-15, issue
#24, SPEC §7/§8) — the milestone-M-B exit for the verify library. Completes the
SPEC §7 negative set as **published** conformance vectors runnable by any consumer
(core / cli / registry / dashboard) in one import through the shared vector-runner,
so a divergent implementation that "passes" a tampered vector fails its own CI
rather than production.

Four negatives graduate from test-only fixtures into `@gridmason/protocol/vectors`,
joining the already-published tampered-hash (`hash-wire`) negative to close the
full SPEC §7 list — **wrong issuer**, **expired root**, **forked log**, and
**stale-past-TTL feed**:

- `signatureVectors` (`signature` group) — a frozen, recorded ECDSA-P256
  dual-signed envelope plus the two wrong-issuer refusals
  (`publisher-issuer-not-allowlisted`, `publisher-issuer-mismatch`).
- `trustRootVectors` (`trust-root` group) — pinned-valid / rotation-overlap
  positives and the `expired` root refusal.
- `logConsistencyVectors` (`log-consistency` group) — an honest 5→8 growth proof
  and the forked-log `consistency-proof-invalid` refusal.
- `freshnessVectors` (`freshness` group) — fresh / multi-registry-scoping
  positives and the `stale` past-TTL refusal.

`ConformanceSurface` gains the matching injectable members (`verifySignatureEnvelope`,
`evaluateTrustRoot`, `verifyLogConsistency`, `evaluateFreshness`); the sync
`runConformanceVectors` now also runs the trust-root and freshness groups, and
`runConformanceVectorsAsync` appends the WebCrypto signature and log-consistency
groups. The report shape is unchanged. The new vector types (`SignatureVector`,
`TrustRootVector`, `LogConsistencyVector`, `FreshnessVector`) are exported.

The verify/canon security core is audited at 100% lines **and** branches (all 24
files), and a `test/coverage-gate.test.ts` meta-test pins the `vitest.config.ts`
threshold to both directories on every metric so the gate cannot be silently
weakened.
