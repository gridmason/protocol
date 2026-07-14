---
"@gridmason/protocol": patch
---

P-E3 verify orchestration: `verifyRelease` / `verifyChunk` + canonical stable
reason set (FR-14, issue #20, epic #15 capstone). Composes the four leaf
verifiers into the single decision a host runs before it loads a release —
`verifyRelease(input)` parses and pins the (untrusted) trust-root document
against the operator's out-of-band pins and clock (including cryptographic
`crossSig` verification of a rotation-overlap document, the check the trust-root
leaf deferred), canonicalizes and hash-binds the release document, verifies the
dual-signature envelope (publisher authorship + registry approval), and verifies
transparency-log inclusion against the pinned checkpoint — returning the signed
`url → hash` map (plus issuer and subject) on success, or a single stable reason
on the first failure. `verifyChunk(bytes, expectedHash)` is the Service-Worker
per-fetch hash gate.

Every failure maps into one exported closed set, `VerifyReleaseReason`, with a
value per failure class (`VERIFY_RELEASE_REASONS`); the mapping from each leaf's
reason enum is total and stable, and enforces the **no-tag-echo rule** (SPEC §7)
by construction — a reason is always a fixed literal, never a gated-off or
unknown widget's tag, artifact id, or issuer. `evaluateFreshness` (FR-11) is
re-exported as part of the same public verify surface; `negotiate` (§6) stays
reserved in `src/negotiate`. Pure and isomorphic (no I/O, no key handling; the
caller supplies bytes, pinned roots/keys, the log entry, and `now`), and the
whole `src/verify` tree holds the 100% line/branch security-core gate across the
happy path and every negative reason.
