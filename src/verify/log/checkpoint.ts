/**
 * Signed-checkpoint parsing and verification (docs/SPEC.md §4.3) — the log's
 * signed tree head in the c2sp.org/tlog-checkpoint + c2sp.org/signed-note
 * format Sigstore/Rekor emit. A checkpoint is:
 *
 * ```
 * <origin>\n
 * <tree size>\n
 * <base64 root hash>\n
 * [extension lines…]\n
 * \n                                  ← blank line separates body from signatures
 * — <key name> <base64(keyId ‖ sig)>\n
 * ```
 *
 * The Ed25519 signature covers the note **body** (everything up to, and
 * including, the newline before the blank separator). The 4-byte key id that
 * prefixes each signature is `SHA-256(name ‖ 0x0A ‖ 0x01 ‖ pubkey)[:4]` (0x01 is
 * the Ed25519 algorithm identifier). We verify against a **pinned** public key
 * the caller supplies — never a key fetched from the log (SPEC §5, §7).
 *
 * Pure and isomorphic: WebCrypto Ed25519, no I/O, no clock. Held at 100%
 * line/branch coverage (GW-D20 gate).
 */

import { sha256 } from './merkle.js';
import { base64ToBytes } from './encoding.js';

/**
 * A pinned transparency-log public key (GW-D17), supplied by the caller from its
 * trust root — the only key a checkpoint signature is ever checked against.
 */
export interface LogPublicKey {
  /** The checkpoint signer identity (the note "key name", usually the origin). */
  name: string;
  /** The raw 32-byte Ed25519 public key (RFC 8032 encoding). */
  key: Uint8Array;
}

/** The verified content of a checkpoint note body. */
export interface Checkpoint {
  /** Log identity line — must match across the checkpoints of a consistency proof. */
  origin: string;
  /** Number of leaves the signed tree head commits to. */
  treeSize: bigint;
  /** The Merkle tree root at `treeSize` (raw bytes, decoded from the base64 line). */
  rootHash: Uint8Array;
}

/** Why {@link verifyCheckpoint} rejected a checkpoint, or `'ok'`. Stable. */
export type CheckpointOutcome =
  | 'ok'
  | 'malformed-checkpoint'
  | 'unsupported-key-algorithm'
  | 'checkpoint-key-mismatch'
  | 'checkpoint-signature-invalid';

/** Success carries the parsed body; every failure is a stable reason. */
export type CheckpointResult =
  | { readonly outcome: 'ok'; readonly checkpoint: Checkpoint }
  | { readonly outcome: Exclude<CheckpointOutcome, 'ok'> };

/** Raw Ed25519 public keys are exactly 32 bytes (RFC 8032). */
const ED25519_PUBLIC_KEY_LENGTH = 32;
/** Raw Ed25519 signatures are exactly 64 bytes (RFC 8032). */
const ED25519_SIGNATURE_LENGTH = 64;
/** The signed-note algorithm identifier byte for Ed25519. */
const ED25519_ALG = 0x01;
/** Key ids are the first 4 bytes of the identity hash. */
const KEY_ID_LENGTH = 4;

const textEncoder = new TextEncoder();

/**
 * Parse and verify a checkpoint note against a pinned Ed25519 key. Returns the
 * parsed body only when a signature line whose key id matches the pinned key
 * verifies over the note body; otherwise a stable reason.
 */
export async function verifyCheckpoint(note: string, pinned: LogPublicKey): Promise<CheckpointResult> {
  if (pinned.key.length !== ED25519_PUBLIC_KEY_LENGTH) return { outcome: 'unsupported-key-algorithm' };

  const parsed = parseNote(note);
  if (parsed === undefined) return { outcome: 'malformed-checkpoint' };
  const { body, signatures } = parsed;

  const checkpoint = parseBody(body);
  if (checkpoint === undefined) return { outcome: 'malformed-checkpoint' };

  const keyId = await ed25519KeyId(pinned);
  // Find the signature line issued under the pinned key (its 4-byte key id).
  // Every blob is ≥ KEY_ID_LENGTH bytes (parseNote guarantees it).
  const signature = signatures.find((sig) => hasKeyId(sig, keyId));
  if (signature === undefined) return { outcome: 'checkpoint-key-mismatch' };

  const sigBytes = signature.subarray(KEY_ID_LENGTH);
  if (sigBytes.length !== ED25519_SIGNATURE_LENGTH) return { outcome: 'checkpoint-signature-invalid' };

  const ok = await ed25519Verify(pinned.key, sigBytes, textEncoder.encode(body));
  if (!ok) return { outcome: 'checkpoint-signature-invalid' };
  return { outcome: 'ok', checkpoint };
}

/** The signed note split into its signed `body` and decoded signature blobs. */
interface ParsedNote {
  /** The note body, including its trailing newline — the exact signed bytes. */
  body: string;
  /** Each signature line's `base64(keyId ‖ sig)` decoded to bytes. */
  signatures: Uint8Array[];
}

/**
 * Split a signed note into body + signatures at the blank separator line. Returns
 * `undefined` if the note is not well-formed (no separator, no signature lines,
 * or a signature line that is not `— <name> <base64>` decoding to ≥ a key id).
 */
function parseNote(note: string): ParsedNote | undefined {
  const separator = note.indexOf('\n\n');
  if (separator === -1) return undefined;

  // The signed body includes the newline before the blank separator line.
  const body = note.slice(0, separator + 1);
  const sigBlock = note.slice(separator + 2);
  // Signature lines are newline-terminated; a trailing newline yields an empty
  // final segment we drop.
  const lines = sigBlock.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return undefined;

  const signatures: Uint8Array[] = [];
  for (const line of lines) {
    // "— " is an em dash (U+2014) then a space.
    if (!line.startsWith('— ')) return undefined;
    const space = line.lastIndexOf(' ');
    // A well-formed line has a second space between name and the base64 blob.
    if (space <= 1) return undefined;
    const blob = base64ToBytes(line.slice(space + 1));
    if (blob === undefined || blob.length < KEY_ID_LENGTH) return undefined;
    signatures.push(blob);
  }
  return { body, signatures };
}

/**
 * Parse the checkpoint body's first three lines: origin, decimal tree size, and
 * base64 root hash. Extra (extension) lines are permitted and ignored.
 */
function parseBody(body: string): Checkpoint | undefined {
  const lines = body.split('\n');
  // origin, size, root, and the trailing empty segment from the final newline.
  if (lines.length < 4) return undefined;
  const [origin, sizeText, rootB64] = lines as [string, string, string, ...string[]];
  if (origin === '') return undefined;

  // Tree size: ASCII decimal, no sign, no leading zeros (except "0" itself).
  if (!/^(0|[1-9][0-9]*)$/.test(sizeText)) return undefined;
  const treeSize = BigInt(sizeText);

  const rootHash = base64ToBytes(rootB64);
  if (rootHash === undefined) return undefined;
  return { origin, treeSize, rootHash };
}

/** The 4-byte signed-note key id for a pinned Ed25519 key. */
async function ed25519KeyId(pinned: LogPublicKey): Promise<Uint8Array> {
  const name = textEncoder.encode(pinned.name);
  const preimage = new Uint8Array(name.length + 2 + pinned.key.length);
  preimage.set(name, 0);
  preimage[name.length] = 0x0a;
  preimage[name.length + 1] = ED25519_ALG;
  preimage.set(pinned.key, name.length + 2);
  return (await sha256(preimage)).subarray(0, KEY_ID_LENGTH);
}

/** Verify an Ed25519 signature over `message` with a raw 32-byte public key. */
async function ed25519Verify(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean> {
  const key = await globalThis.crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, [
    'verify',
  ]);
  return globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, signature, message);
}

/** Whether a signature blob's leading `KEY_ID_LENGTH` bytes equal `keyId`. */
function hasKeyId(blob: Uint8Array, keyId: Uint8Array): boolean {
  for (let i = 0; i < keyId.length; i++) if (blob[i] !== keyId[i]) return false;
  return true;
}
