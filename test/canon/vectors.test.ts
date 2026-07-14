import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canonicalize, canonicalizeToString } from '../../src/canon/index.js';

// docs/SPEC.md §4/§7 — conformance against the reference JCS / RFC-8785 suite
// (vendored under test/vectors/canon/, see that folder's README). Each input,
// once parsed and canonicalized, must reproduce the published canonical bytes
// exactly. This is the load-bearing guarantee: bytes signed == bytes verified.
const VECTORS = ['arrays', 'french', 'structures', 'unicode', 'values', 'weird'] as const;

function read(kind: 'input' | 'expected', name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`../vectors/canon/${kind}/${name}.json`, import.meta.url)));
}

describe('JCS / RFC-8785 conformance suite', () => {
  it.each(VECTORS)('%s canonicalizes to the published bytes', (name) => {
    const parsed: unknown = JSON.parse(read('input', name).toString('utf8'));
    const expected = read('expected', name);

    // Readable string diff first, then the exact-byte assertion that actually
    // matters for the signature path.
    expect(canonicalizeToString(parsed)).toBe(expected.toString('utf8'));
    expect(Buffer.from(canonicalize(parsed)).equals(expected)).toBe(true);
  });
});
