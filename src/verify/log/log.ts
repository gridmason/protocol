/**
 * Transparency-log entry verification (docs/SPEC.md §4.3) — the public verify
 * surface. Validates that a Rekor-compatible {@link TransparencyLogEntry}'s
 * inclusion proof leads to the root a **pinned**-key-signed checkpoint commits
 * to, and that two checkpoints are consistent (the log did not fork). Both check
 * only against the caller-supplied pinned log key (GW-D17); neither fetches a
 * key nor contacts the log (SPEC §5, §7).
 *
 * Every outcome is a stable {@link LogVerdictReason} — a forked log, a tampered
 * inclusion proof, and a bad checkpoint signature are each a distinct reason, so
 * hosts render consistent, non-leaky error boundaries and telemetry aggregates
 * cleanly. Consumed by the `verifyRelease` orchestrator (FR-14), which supplies
 * the envelope's log inclusion and a checkpoint.
 *
 * Pure and isomorphic: WebCrypto only, no I/O, no clock. Held at 100%
 * line/branch coverage (GW-D20 gate).
 */

import type { TransparencyLogEntry } from '../../types/wire/log-entry.js';
import { base64ToBytes, hexToBytes } from './encoding.js';
import {
  bytesEqual,
  inclusionProofSize,
  leafHash,
  rootFromInclusionProof,
  verifyConsistencyProof,
} from './merkle.js';
import { verifyCheckpoint, type LogPublicKey } from './checkpoint.js';

export type { LogPublicKey, Checkpoint } from './checkpoint.js';

/** SHA-256 digest length in bytes — the size of every Merkle node hash. */
const DIGEST_LENGTH = 32;

/**
 * Why {@link verifyLogInclusion} / {@link verifyLogConsistency} reached their
 * verdict. Stable across versions — callers and telemetry may switch on these.
 * Every non-`ok` reason is a refusal:
 *
 * - `ok`                          — the proof verified against the pinned key.
 * - `malformed-checkpoint`        — the checkpoint note did not parse.
 * - `unsupported-key-algorithm`   — the pinned key is not a 32-byte Ed25519 key.
 * - `checkpoint-key-mismatch`     — no signature line was issued under the pinned key.
 * - `checkpoint-signature-invalid`— a matching signature failed Ed25519 verification.
 * - `checkpoint-mismatch`         — the entry's asserted root/size disagree with the signed checkpoint.
 * - `malformed-entry`             — the entry's `canonicalBody` is not valid base64.
 * - `index-out-of-range`          — the leaf `index` is ≥ the tree size.
 * - `malformed-inclusion-proof`   — wrong proof length, or a node hash that is not 32 bytes of hex.
 * - `inclusion-proof-invalid`     — the recomputed root ≠ the signed root (tampered/incorrect proof).
 * - `checkpoint-origin-mismatch`  — the two checkpoints name different logs.
 * - `malformed-consistency-proof` — wrong proof length, or a node hash that is not 32 bytes of hex.
 * - `consistency-proof-invalid`   — the log did not prove append-only consistency (a fork).
 */
export type LogVerdictReason =
  | 'ok'
  | 'malformed-checkpoint'
  | 'unsupported-key-algorithm'
  | 'checkpoint-key-mismatch'
  | 'checkpoint-signature-invalid'
  | 'checkpoint-mismatch'
  | 'malformed-entry'
  | 'index-out-of-range'
  | 'malformed-inclusion-proof'
  | 'inclusion-proof-invalid'
  | 'checkpoint-origin-mismatch'
  | 'malformed-consistency-proof'
  | 'consistency-proof-invalid';

/** The result of a log-proof check. Total: the verdict path never throws. */
export interface LogVerdict {
  /** Machine-readable outcome. */
  readonly reason: LogVerdictReason;
  /** Convenience gate: `true` iff `reason === 'ok'`. */
  readonly ok: boolean;
}

/** Inputs to {@link verifyLogConsistency}: two signed heads and the proof between them. */
export interface LogConsistencyInput {
  /** The earlier (smaller) checkpoint, as a signed note. */
  readonly oldCheckpoint: string;
  /** The later (larger) checkpoint, as a signed note. */
  readonly newCheckpoint: string;
  /** RFC 6962 consistency-proof node hashes, lowercase hex, leaf-to-root order. */
  readonly proof: readonly string[];
  /** The pinned log key both checkpoints must be signed under. */
  readonly logPublicKey: LogPublicKey;
}

/** Assemble a {@link LogVerdict} from a reason. */
function verdict(reason: LogVerdictReason): LogVerdict {
  return { reason, ok: reason === 'ok' };
}

/**
 * Verify a transparency-log entry's inclusion proof against a pinned log key.
 * The checkpoint signature is checked first (nothing downstream is trusted until
 * the signed tree head is), then the entry's self-asserted root/size are
 * reconciled with it, then the audit path is recomputed from the leaf and
 * compared to the signed root.
 */
export async function verifyLogInclusion(
  entry: TransparencyLogEntry,
  logPublicKey: LogPublicKey,
): Promise<LogVerdict> {
  const checkpointResult = await verifyCheckpoint(entry.checkpoint, logPublicKey);
  if (checkpointResult.outcome !== 'ok') return verdict(checkpointResult.outcome);
  const checkpoint = checkpointResult.checkpoint;

  // The entry's advisory root/size MUST agree with the signed tree head.
  const assertedRoot = hexToBytes(entry.inclusionProof.rootHash);
  if (
    assertedRoot === undefined ||
    BigInt(entry.inclusionProof.treeSize) !== checkpoint.treeSize ||
    !bytesEqual(assertedRoot, checkpoint.rootHash)
  ) {
    return verdict('checkpoint-mismatch');
  }

  const index = BigInt(entry.index);
  if (index < 0n || index >= checkpoint.treeSize) return verdict('index-out-of-range');

  const leafBytes = base64ToBytes(entry.canonicalBody);
  if (leafBytes === undefined) return verdict('malformed-entry');

  const nodes = decodeNodes(entry.inclusionProof.hashes);
  if (nodes === undefined || nodes.length !== inclusionProofSize(index, checkpoint.treeSize)) {
    return verdict('malformed-inclusion-proof');
  }

  const leaf = await leafHash(leafBytes);
  const root = await rootFromInclusionProof(index, checkpoint.treeSize, leaf, nodes);
  return verdict(bytesEqual(root, checkpoint.rootHash) ? 'ok' : 'inclusion-proof-invalid');
}

/**
 * Verify that the log is append-only consistent across two signed checkpoints —
 * the forked-log check. Both must be signed under the pinned key and name the
 * same log; the RFC 6962 consistency proof must then derive both signed roots
 * from one shared subtree.
 */
export async function verifyLogConsistency(input: LogConsistencyInput): Promise<LogVerdict> {
  const oldResult = await verifyCheckpoint(input.oldCheckpoint, input.logPublicKey);
  if (oldResult.outcome !== 'ok') return verdict(oldResult.outcome);
  const newResult = await verifyCheckpoint(input.newCheckpoint, input.logPublicKey);
  if (newResult.outcome !== 'ok') return verdict(newResult.outcome);

  const older = oldResult.checkpoint;
  const newer = newResult.checkpoint;
  if (older.origin !== newer.origin) return verdict('checkpoint-origin-mismatch');

  const nodes = decodeNodes(input.proof);
  if (nodes === undefined) return verdict('malformed-consistency-proof');

  const outcome = await verifyConsistencyProof(
    older.treeSize,
    newer.treeSize,
    older.rootHash,
    newer.rootHash,
    nodes,
  );
  if (outcome === 'malformed') return verdict('malformed-consistency-proof');
  if (outcome === 'inconsistent') return verdict('consistency-proof-invalid');
  return verdict('ok');
}

/** Decode hex Merkle node hashes, requiring each to be exactly 32 bytes. */
function decodeNodes(hexes: readonly string[]): Uint8Array[] | undefined {
  const nodes: Uint8Array[] = [];
  for (const hex of hexes) {
    const bytes = hexToBytes(hex);
    if (bytes === undefined || bytes.length !== DIGEST_LENGTH) return undefined;
    nodes.push(bytes);
  }
  return nodes;
}
