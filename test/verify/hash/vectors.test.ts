import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { hashBytes, verifyHash } from '../../../src/verify/hash/index.js';

// docs/SPEC.md §4.1 — known-answer tests for the SHA-256 content-hash primitive
// against the vendored vector corpus (test/vectors/hash/, see that README for
// sources: FIPS 180-2/180-4 examples + empty-string + raw-byte inputs). Pinning
// the digest here is the load-bearing guarantee for artifact addressing.

interface KatVector {
  readonly name: string;
  readonly note: string;
  readonly inputUtf8?: string;
  readonly inputHex?: string;
  readonly expected: string;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function inputBytes(v: KatVector): Uint8Array {
  return v.inputUtf8 !== undefined ? new TextEncoder().encode(v.inputUtf8) : hexToBytes(v.inputHex ?? '');
}

const VECTORS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../vectors/hash/sha256-kat.json', import.meta.url)), 'utf8'),
) as readonly KatVector[];

describe('SHA-256 known-answer vectors', () => {
  it.each(VECTORS)('$name hashes to its published sha2-256 digest', async (vector) => {
    const bytes = inputBytes(vector);
    await expect(hashBytes(bytes)).resolves.toBe(vector.expected);
    // The same digest, checked through the verdict path, must accept.
    await expect(verifyHash(bytes, vector.expected)).resolves.toMatchObject({ reason: 'ok', ok: true });
  });
});
