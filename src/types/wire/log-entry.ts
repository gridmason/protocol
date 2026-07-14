/**
 * Transparency-log entry (docs/SPEC.md §4.3) — the Sigstore/Rekor-compatible
 * record proving that a signed release was appended to an append-only
 * transparency log. TypeScript is the single authoring surface; the JSON Schema
 * under `schemas/` is generated from this type at build (FR-5) and must never be
 * hand-edited.
 *
 * The shape mirrors a Rekor log entry: a leaf `index` in a tree of `treeSize`
 * leaves, the `canonicalBody` that was logged, an RFC 6962 `inclusionProof`
 * (Merkle audit path), and a signed `checkpoint` (the log's signed tree head).
 * The verify lib (`src/verify/log`) validates the inclusion proof — and, across
 * two checkpoints, a consistency proof (the log did not fork) — against a
 * **pinned** log public key the caller supplies from its trust root (GW-D17);
 * it never fetches a key or contacts the log (SPEC §5, §7).
 *
 * Encoding conventions match Rekor: Merkle node hashes (`rootHash`, `hashes`)
 * are lowercase hex; `canonicalBody` is base64; the `checkpoint` carries its
 * tree-head root as base64 inside the signed note. The verify lib reconciles the
 * two encodings — a proof leads to a root that must equal the base64 root the
 * checkpoint signs over.
 */

/**
 * An RFC 6962 inclusion proof: the Merkle audit path from a leaf up to the tree
 * root at `treeSize`. `hashes` are the sibling node hashes, ordered leaf-to-root;
 * the verify lib recomputes the root from the leaf and this path and compares it
 * to the root the signed {@link TransparencyLogEntry.checkpoint} commits to.
 */
export interface LogInclusionProof {
  /** Number of leaves in the tree this proof leads to the root of. */
  treeSize: number;
  /**
   * The Merkle tree root at `treeSize`, lowercase hex. Advisory: the verify lib
   * checks the recomputed root against the **signed checkpoint** root, and
   * requires this field to agree with it (a self-consistent entry).
   * @pattern ^[0-9a-f]{64}$
   */
  rootHash: string;
  /**
   * Sibling node hashes of the audit path, leaf-to-root, each a lowercase-hex
   * SHA-256 digest. The array length is fixed by `index` and `treeSize`
   * (RFC 6962); the verify lib enforces the hex/length of each element.
   */
  hashes: string[];
}

/**
 * A Sigstore/Rekor-compatible transparency-log entry (docs/SPEC.md §4.3). Proves
 * the logged `canonicalBody` sits at leaf `index` of a log whose signed tree head
 * is `checkpoint`.
 */
export interface TransparencyLogEntry {
  /**
   * Log identity — the hex SHA-256 of the log's public key. Names *which* log;
   * the caller maps it to a pinned key. Non-load-bearing for the Merkle math.
   * @pattern ^[0-9a-f]{64}$
   */
  logId: string;
  /** Zero-based leaf index of this entry within the tree of `inclusionProof.treeSize`. */
  index: number;
  /** Unix seconds at which the log integrated the entry. Carried, not verified here. */
  integratedTime: number;
  /**
   * The exact bytes that were logged as this leaf, base64. The leaf hash is
   * `SHA-256(0x00 || canonicalBody)` (RFC 6962 leaf hashing).
   * @pattern ^[A-Za-z0-9+/]*={0,2}$
   */
  canonicalBody: string;
  /** RFC 6962 audit path proving `canonicalBody` is the leaf at `index`. */
  inclusionProof: LogInclusionProof;
  /**
   * The log's signed tree head as a c2sp.org/tlog-checkpoint signed note:
   * `origin`, `treeSize`, and base64 root on their own lines, followed by a blank
   * line and one or more `— <name> <base64>` signature lines. The verify lib
   * checks the signature against the pinned log key before trusting the root.
   */
  checkpoint: string;
}
