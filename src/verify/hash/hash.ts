/**
 * Content hashing (docs/SPEC.md §4.1) — the second half of the sign/verify byte
 * path after canonicalization (`src/canon`). Artifacts are addressed by the hash
 * of their **exact served bytes**; a signed release document lists `{path → hash}`
 * for every file the runtime may load, and the dashboard Service Worker verifies
 * **by exact URL + expected hash** — trust is bound per URL, never per origin.
 *
 * Algorithm: **SHA-256**, encoded as a **multihash-tagged** string
 * (`sha2-256:<hex>`, lowercase). The tag is load-bearing: it names the algorithm
 * in-band so a future swap is a version bump, not an ambiguity. A hash whose
 * prefix we do not recognize is **refused with a stable enum, never guessed** —
 * guessing the algorithm is exactly the ambiguity the tag exists to remove.
 *
 * Dependency decision (SPEC §8 — audited surface on the verify path, same
 * rationale as the in-house canonicalizer in #12): one pinned prefix and a fixed
 * digest do not justify a multihash/hashing npm dependency. The hash primitive is
 * WebCrypto (`globalThis.crypto.subtle`), which is isomorphic across browser,
 * Node ≥22, and edge runtimes — there is deliberately no `node:crypto` import.
 * Held at 100% line/branch coverage (GW-D20 gate).
 *
 * Pure and isomorphic: no I/O, no key handling, no clock.
 */

/**
 * The multihash prefix for SHA-256. A hash string is `sha2-256:<64 lowercase hex
 * chars>`. Exported so callers can build/inspect tags without duplicating the
 * literal; {@link MultihashString} is keyed off this same value.
 */
export const SHA256_MULTIHASH_PREFIX = 'sha2-256:';

/** Length in characters of a lowercase-hex SHA-256 digest (32 bytes). */
const SHA256_HEX_LENGTH = 64;

/**
 * A multihash-tagged content hash: the algorithm prefix followed by the digest.
 * Today only `sha2-256:<hex>` is produced and accepted; the template keeps the
 * type honest about the in-band tag. This is a shape hint, not a validity proof —
 * an arbitrary `sha2-256:` string still satisfies it, so untrusted values are
 * validated by {@link verifyHash} rather than by the type alone.
 */
export type MultihashString = `${typeof SHA256_MULTIHASH_PREFIX}${string}`;

/**
 * The signed release document's file list (docs/SPEC.md §4.1): every path the
 * runtime may load mapped to the expected hash of its exact served bytes.
 * Consumed later by `verifyRelease` (FR-14) and by the dashboard Service Worker's
 * per-URL check. `path` is the served URL/path key; the map is read-only because
 * a release manifest is immutable once signed.
 */
export type ReleaseHashMap = { readonly [path: string]: MultihashString };

/**
 * Why {@link verifyHash} reached its conclusion. Stable across versions — callers
 * and logs may switch on these. Every non-`ok` reason is a refusal:
 *
 * - `ok`                   — the expected hash matched the computed one.
 * - `hash-mismatch`        — well-formed `sha2-256:` hash, but the bytes differ.
 * - `unknown-hash-prefix`  — a recognizable `<algo>:` tag we do not implement
 *                            (e.g. `sha3-256:`); refused, never guessed.
 * - `malformed-hash-string`— not a `<algo>:<hex>` shape at all, or a `sha2-256:`
 *                            tag with a bad digest (wrong length / non-lowercase-hex).
 */
export type HashVerdictReason = 'ok' | 'hash-mismatch' | 'unknown-hash-prefix' | 'malformed-hash-string';

/**
 * The result of checking bytes against an expected hash. Total: {@link verifyHash}
 * never throws on the verdict path — a bad `expected` string yields a reason, not
 * an exception.
 */
export interface HashVerdict {
  /** Machine-readable outcome. */
  readonly reason: HashVerdictReason;
  /** Convenience gate: `true` iff `reason === 'ok'`. */
  readonly ok: boolean;
  /** The multihash actually computed over the supplied bytes. */
  readonly computed: MultihashString;
}

/** Lowercase-hex encode raw digest bytes. */
function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Whether `value` is exactly a 64-character lowercase SHA-256 hex digest. */
function isSha256Hex(value: string): boolean {
  return value.length === SHA256_HEX_LENGTH && /^[0-9a-f]+$/.test(value);
}

/**
 * Hash exact bytes with SHA-256 and return the multihash-tagged string
 * `sha2-256:<hex>` (lowercase). These are the bytes served for an artifact file
 * — e.g. `hashBytes(canonicalize(releaseDoc))` for the canonical form of a
 * document (see `src/canon`).
 */
export async function hashBytes(bytes: Uint8Array): Promise<MultihashString> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `${SHA256_MULTIHASH_PREFIX}${toHex(new Uint8Array(digest))}`;
}

/**
 * Check that `bytes` hash to `expected`. The comparison is on the SHA-256 of the
 * bytes; `expected` is untrusted input, so an unrecognized prefix or a malformed
 * string produces a stable {@link HashVerdictReason} rather than a throw or a
 * guess. `computed` on the returned verdict is always the real hash of `bytes`.
 */
export async function verifyHash(bytes: Uint8Array, expected: string): Promise<HashVerdict> {
  const computed = await hashBytes(bytes);
  const reason = classify(expected, computed);
  return { reason, ok: reason === 'ok', computed };
}

/** Classify an untrusted `expected` hash string against an already-`computed` one. */
function classify(expected: string, computed: MultihashString): HashVerdictReason {
  const colon = expected.indexOf(':');
  // No separator, or an empty algorithm label — not a `<algo>:<hex>` string.
  if (colon <= 0) return 'malformed-hash-string';
  const prefix = expected.slice(0, colon + 1);
  // A tagged hash for an algorithm we do not implement: refuse, never guess.
  if (prefix !== SHA256_MULTIHASH_PREFIX) return 'unknown-hash-prefix';
  const hex = expected.slice(colon + 1);
  if (!isSha256Hex(hex)) return 'malformed-hash-string';
  return expected === computed ? 'ok' : 'hash-mismatch';
}
