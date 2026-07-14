import { describe, expect, test } from 'vitest';

import { canonicalize } from '../../../src/canon/index.js';
import {
  hashBytes,
  verifyHash,
  SHA256_MULTIHASH_PREFIX,
  type MultihashString,
  type ReleaseHashMap,
} from '../../../src/verify/hash/index.js';

// Unit coverage for the content-hash module (docs/SPEC.md §4.1). The vendored KAT
// corpus (vectors.test.ts) pins the SHA-256 digest itself; this file nails down
// the multihash tagging, every verdict enum and refusal path, the release-map
// type, and the canon→hash composition, meeting the security-core 100%
// line/branch gate.

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

// A real, correctly-formed hash to mutate for the malformed/mismatch cases.
const ABC = 'sha2-256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' as const;

describe('hashBytes', () => {
  test('tags the digest with the sha2-256 multihash prefix', async () => {
    const hash = await hashBytes(enc('abc'));
    expect(hash).toBe(ABC);
    expect(hash.startsWith(SHA256_MULTIHASH_PREFIX)).toBe(true);
    // sha2-256: + 64 lowercase hex chars.
    expect(hash.slice(SHA256_MULTIHASH_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the empty input hashes to the known constant', async () => {
    await expect(hashBytes(new Uint8Array(0))).resolves.toBe(
      'sha2-256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('verifyHash — verdict enums', () => {
  test('ok: bytes match the expected hash', async () => {
    const verdict = await verifyHash(enc('abc'), ABC);
    expect(verdict).toEqual({ reason: 'ok', ok: true, computed: ABC });
  });

  test('hash-mismatch: well-formed sha2-256 hash, different bytes', async () => {
    const verdict = await verifyHash(enc('not abc'), ABC);
    expect(verdict.reason).toBe('hash-mismatch');
    expect(verdict.ok).toBe(false);
    // `computed` is always the real hash of the supplied bytes.
    expect(verdict.computed).toBe(await hashBytes(enc('not abc')));
    expect(verdict.computed).not.toBe(ABC);
  });

  test('unknown-hash-prefix: a recognizable algo tag we do not implement is refused, not guessed', async () => {
    // Same 64-hex digest, wrong algorithm label — the bytes are irrelevant, the
    // prefix alone refuses.
    const sha3 = `sha3-256:${ABC.slice(SHA256_MULTIHASH_PREFIX.length)}`;
    await expect(verifyHash(enc('abc'), sha3)).resolves.toMatchObject({
      reason: 'unknown-hash-prefix',
      ok: false,
    });
    await expect(verifyHash(enc('abc'), 'md5:d41d8cd98f00b204e9800998ecf8427e')).resolves.toMatchObject({
      reason: 'unknown-hash-prefix',
    });
  });

  describe('malformed-hash-string', () => {
    test.each([
      ['no separator', 'ba7816bf'],
      ['empty string', ''],
      ['empty algorithm label', ':ba7816bf'],
      ['sha2-256 tag, digest too short', 'sha2-256:abcd'],
      ['sha2-256 tag, non-hex character', `sha2-256:${'z'.repeat(64)}`],
      ['sha2-256 tag, uppercase hex (must be lowercase)', `sha2-256:${ABC.slice(SHA256_MULTIHASH_PREFIX.length).toUpperCase()}`],
      ['sha2-256 tag, embedded colon in digest', 'sha2-256:ab:816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f2001'],
    ])('%s', async (_label, expected) => {
      await expect(verifyHash(enc('abc'), expected)).resolves.toMatchObject({
        reason: 'malformed-hash-string',
        ok: false,
      });
    });
  });
});

describe('ReleaseHashMap', () => {
  test('maps served paths to expected hashes and drives per-path verification', async () => {
    const entry = enc('export default {}');
    const chunk = enc('/* chunk */');
    const release: ReleaseHashMap = {
      '/widgets/acme/entry.js': await hashBytes(entry),
      '/widgets/acme/chunk-1.js': await hashBytes(chunk),
    };

    // A path present with the right bytes verifies; tampered bytes are caught by
    // the per-URL check the way the dashboard Service Worker uses this map.
    await expect(verifyHash(entry, release['/widgets/acme/entry.js']!)).resolves.toMatchObject({ ok: true });
    await expect(verifyHash(chunk, release['/widgets/acme/entry.js']!)).resolves.toMatchObject({
      reason: 'hash-mismatch',
    });
  });
});

describe('canon → hash composition (builds on #12)', () => {
  test('key-order variants of the same document hash identically', async () => {
    const a = { source: 'registry.gridmason.dev', tag: 'acme-chart', version: '2.3.1' };
    const b = { version: '2.3.1', tag: 'acme-chart', source: 'registry.gridmason.dev' };

    const hashA = await hashBytes(canonicalize(a));
    const hashB = await hashBytes(canonicalize(b));

    expect(hashA).toBe(hashB);
    await expect(verifyHash(canonicalize(b), hashA)).resolves.toMatchObject({ reason: 'ok' });
  });

  test('a semantically different document hashes differently', async () => {
    const base = await hashBytes(canonicalize({ tag: 'acme-chart', version: '2.3.1' }));
    const bumped = await hashBytes(canonicalize({ tag: 'acme-chart', version: '2.3.2' }));
    expect(bumped).not.toBe(base);
  });
});

describe('MultihashString type', () => {
  test('a produced hash is assignable to the branded string type', async () => {
    // Compile-time intent, exercised at runtime: the template-literal type admits
    // exactly `sha2-256:<...>`.
    const hash: MultihashString = await hashBytes(enc('abc'));
    expect(hash).toBe(ABC);
  });
});
