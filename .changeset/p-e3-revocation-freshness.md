---
"@gridmason/protocol": patch
---

P-E3 revocation & kill feed + freshness (FR-11, issue #18): the signed
per-registry `RevocationFeed` wire type (`revoked`/`killed` entries with
severity, monotonic `seq`, TTL) with its generated JSON Schema
(`@gridmason/protocol/schemas/revocation-feed.json`) and `Cursor` type, plus the
pure `evaluateFreshness(feed, cursor, now)` load gate (security core, 100%
covered). It encodes the fail-closed-scoped-to-that-registry rule — a stale feed
blocks only its own registry's remotes while others stay fail-open — rejects a
rolled-back feed (lower `seq`) and a mismatched cursor, and blocks the named
revoked/killed artifacts on a fresh verdict. Every outcome is a stable enum; the
caller supplies `now` (no internal clock). Feed-signature verification is out of
scope here — it composes via #16/#17 in the #20 `verifyRelease` orchestrator.
