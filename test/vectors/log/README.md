# Transparency-log fixtures

Recorded, offline fixtures for the transparency-log verifier (`src/verify/log`,
docs/SPEC.md §4.3). They are **Rekor-shaped**: RFC 6962 inclusion/consistency
proofs plus c2sp.org/tlog-checkpoint signed notes. The verify lib is pure and
its tests never touch the network (spec Risks — never live Rekor), so these are
generated once and committed.

## Regenerating

`node test/vectors/log/gen.mjs` rewrites every JSON file here. The generator is
**deterministic**: a fixed Ed25519 seed and an *honest* RFC 6962 prover (it
builds proofs by constructing the tree, the way a log does — not by running the
client verifier under test). The seed is a throwaway test key; it protects
nothing and lives in the generator only so the fixtures are reproducible.

The prover (generator) and the verifier (`src/verify/log`) are independent code
paths — proofs built bottom-up versus verified top-down — so a passing test is
real agreement, not a tautology.

## Files

- `pinned-key.json` — the log's public key the caller pins (`name`,
  `publicKeyHex`, raw 32-byte Ed25519). Every checkpoint below is signed by it.
- `inclusion-valid.json` — a `TransparencyLogEntry`: leaf 3 of an 8-leaf tree,
  its audit path, and the signed size-8 checkpoint. Verifies (`ok`).
- `inclusion-tampered-proof.json` — the same entry with the first audit-path
  node's last byte flipped. The recomputed root no longer matches the signed
  root → `inclusion-proof-invalid`.
- `consistency-valid.json` — the honest log growing 5 → 8 leaves, with the
  consistency proof between the two signed heads. Verifies (`ok`).
- `consistency-forked.json` — two size-8 checkpoints signed by the same key with
  **different** roots (a compromised/forked log): irreconcilable histories →
  `consistency-proof-invalid`.

The signed byte path (checkpoint signature) is exercised end to end here; the
exhaustive Merkle branch coverage across many tree sizes and indices lives in
`test/verify/log/merkle.test.ts`.
