import { describe, expect, it } from 'vitest';

import type { TrustRootDoc } from '../../../src/types/wire/trust-root.js';
import type { TrustRootPin } from '../../../src/verify/trust/index.js';
import { evaluateTrustRoot, parseTrustRoot } from '../../../src/verify/trust/index.js';

// FR-12 / SPEC §4.4, §5: exhaustive branch + edge coverage for the pure
// trust-root parse + pin/rotation/validity decision. src/verify is security core,
// held at 100% (GW-D20).

const REGISTRY = 'registry.gridmason.dev';
const NOT_BEFORE = 1_704_067_200_000; // 2024-01-01T00:00:00Z, epoch ms
const NOT_AFTER = 1_735_689_600_000; // 2025-01-01T00:00:00Z, epoch ms

/** A well-formed single-root document with the given overrides. */
function doc(overrides: Partial<TrustRootDoc> = {}): TrustRootDoc {
  return {
    formatVersion: '1.0',
    registryId: REGISTRY,
    countersignRoots: ['root-2024'],
    issuerAllowlist: ['https://accounts.google.com'],
    logPublicKeys: ['ed25519:log-key'],
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
    ...overrides,
  };
}

/** A pin for the default registry + root. */
function pin(overrides: Partial<TrustRootPin> = {}): TrustRootPin {
  return { registryId: REGISTRY, root: 'root-2024', channel: 'build-time', ...overrides };
}

describe('parseTrustRoot — input shape', () => {
  it('rejects a non-object (string)', () => {
    expect(parseTrustRoot('nope')).toEqual({ ok: false, reason: 'not-an-object' });
  });

  it('rejects null', () => {
    expect(parseTrustRoot(null)).toEqual({ ok: false, reason: 'not-an-object' });
  });

  it('rejects an array', () => {
    expect(parseTrustRoot([])).toEqual({ ok: false, reason: 'not-an-object' });
  });
});

describe('parseTrustRoot — field validation', () => {
  it('rejects a non-string registryId', () => {
    expect(parseTrustRoot({ ...doc(), registryId: 42 })).toEqual({ ok: false, reason: 'malformed-field' });
  });

  it('rejects a non-string formatVersion', () => {
    expect(parseTrustRoot({ ...doc(), formatVersion: 1 })).toEqual({ ok: false, reason: 'malformed-field' });
  });

  it('rejects a formatVersion that is not major.minor', () => {
    expect(parseTrustRoot({ ...doc(), formatVersion: '1' })).toEqual({ ok: false, reason: 'malformed-field' });
  });

  it('rejects a well-formed but unsupported major version', () => {
    expect(parseTrustRoot({ ...doc(), formatVersion: '2.0' })).toEqual({
      ok: false,
      reason: 'unsupported-format-version',
    });
  });

  it('rejects a non-array countersignRoots', () => {
    expect(parseTrustRoot({ ...doc(), countersignRoots: 'root' })).toEqual({
      ok: false,
      reason: 'malformed-field',
    });
  });

  it('rejects a countersignRoots array containing a non-string', () => {
    expect(parseTrustRoot({ ...doc(), countersignRoots: ['ok', 7] })).toEqual({
      ok: false,
      reason: 'malformed-field',
    });
  });

  it('rejects an empty countersignRoots (anchors nothing)', () => {
    expect(parseTrustRoot({ ...doc(), countersignRoots: [] })).toEqual({
      ok: false,
      reason: 'empty-countersign-roots',
    });
  });

  it('rejects a non-array issuerAllowlist', () => {
    expect(parseTrustRoot({ ...doc(), issuerAllowlist: {} })).toEqual({ ok: false, reason: 'malformed-field' });
  });

  it('rejects a non-array logPublicKeys', () => {
    expect(parseTrustRoot({ ...doc(), logPublicKeys: 'key' })).toEqual({ ok: false, reason: 'malformed-field' });
  });

  it('rejects a present-but-malformed publisherCARoots', () => {
    expect(parseTrustRoot({ ...doc(), publisherCARoots: [1] })).toEqual({
      ok: false,
      reason: 'malformed-field',
    });
  });

  it('rejects a non-integer notBefore', () => {
    expect(parseTrustRoot({ ...doc(), notBefore: 'yesterday' })).toEqual({
      ok: false,
      reason: 'malformed-field',
    });
  });

  it('rejects a non-integer notAfter', () => {
    expect(parseTrustRoot({ ...doc(), notAfter: 1.5 })).toEqual({ ok: false, reason: 'malformed-field' });
  });

  it('rejects a window where notAfter is before notBefore', () => {
    expect(parseTrustRoot({ ...doc(), notBefore: NOT_AFTER, notAfter: NOT_BEFORE })).toEqual({
      ok: false,
      reason: 'invalid-validity-window',
    });
  });

  it('accepts a window where notAfter equals notBefore (instant window)', () => {
    const result = parseTrustRoot({ ...doc(), notBefore: NOT_BEFORE, notAfter: NOT_BEFORE });
    expect(result.ok).toBe(true);
  });

  it('rejects a present-but-non-string crossSig', () => {
    expect(parseTrustRoot({ ...doc(), crossSig: 123 })).toEqual({ ok: false, reason: 'malformed-field' });
  });
});

describe('parseTrustRoot — success and optional-field round-trip', () => {
  it('narrows a minimal document and omits absent optionals', () => {
    const result = parseTrustRoot(doc());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.doc).toEqual(doc());
    expect('publisherCARoots' in result.doc).toBe(false);
    expect('crossSig' in result.doc).toBe(false);
  });

  it('carries present optionals through (publisherCARoots + crossSig)', () => {
    const full = doc({
      countersignRoots: ['root-2024', 'root-2025'],
      publisherCARoots: ['publisher-ca'],
      crossSig: 'sig-2024',
    });
    const result = parseTrustRoot(full);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.doc).toEqual(full);
    expect(result.doc.publisherCARoots).toEqual(['publisher-ca']);
    expect(result.doc.crossSig).toBe('sig-2024');
  });

  it('a parsed document feeds evaluateTrustRoot end to end', () => {
    const result = parseTrustRoot(doc());
    if (!result.ok) throw new Error('expected ok');
    expect(evaluateTrustRoot(result.doc, [pin()], NOT_BEFORE).code).toBe('trusted');
  });
});

describe('evaluateTrustRoot — pinning', () => {
  it('refuses registry-mismatch when no pin is for the document registry', () => {
    const verdict = evaluateTrustRoot(doc(), [pin({ registryId: 'other.example' })], NOT_BEFORE);
    expect(verdict).toEqual({
      code: 'registry-mismatch',
      ok: false,
      registryId: REGISTRY,
      matchedRoot: undefined,
      matchedChannel: undefined,
      overlap: false,
      crossSig: undefined,
    });
  });

  it('refuses registry-mismatch when no pins are supplied at all', () => {
    expect(evaluateTrustRoot(doc(), [], NOT_BEFORE).code).toBe('registry-mismatch');
  });

  it('refuses unpinned when a registry pin exists but matches no countersign root', () => {
    const verdict = evaluateTrustRoot(doc(), [pin({ root: 'some-other-root' })], NOT_BEFORE);
    expect(verdict).toEqual({
      code: 'unpinned',
      ok: false,
      registryId: REGISTRY,
      matchedRoot: undefined,
      matchedChannel: undefined,
      overlap: false,
      crossSig: undefined,
    });
  });

  it('skips a non-matching registry pin and matches a later one', () => {
    const verdict = evaluateTrustRoot(
      doc(),
      [pin({ root: 'wrong-root' }), pin({ root: 'root-2024', channel: 'deploy-time' })],
      NOT_BEFORE,
    );
    expect(verdict.code).toBe('trusted');
    expect(verdict.matchedRoot).toBe('root-2024');
    expect(verdict.matchedChannel).toBe('deploy-time');
  });
});

describe('evaluateTrustRoot — validity window (fail closed)', () => {
  it('is trusted exactly at notBefore (inclusive lower bound)', () => {
    expect(evaluateTrustRoot(doc(), [pin()], NOT_BEFORE).code).toBe('trusted');
  });

  it('is trusted exactly at notAfter (inclusive upper bound)', () => {
    expect(evaluateTrustRoot(doc(), [pin()], NOT_AFTER).code).toBe('trusted');
  });

  it('is not-yet-valid one millisecond before notBefore, still naming the matched root', () => {
    const verdict = evaluateTrustRoot(doc(), [pin()], NOT_BEFORE - 1);
    expect(verdict).toEqual({
      code: 'not-yet-valid',
      ok: false,
      registryId: REGISTRY,
      matchedRoot: 'root-2024',
      matchedChannel: 'build-time',
      overlap: false,
      crossSig: undefined,
    });
  });

  it('is expired one millisecond past notAfter, still naming the matched root', () => {
    const verdict = evaluateTrustRoot(doc(), [pin()], NOT_AFTER + 1);
    expect(verdict).toEqual({
      code: 'expired',
      ok: false,
      registryId: REGISTRY,
      matchedRoot: 'root-2024',
      matchedChannel: 'build-time',
      overlap: false,
      crossSig: undefined,
    });
  });
});

describe('evaluateTrustRoot — overlap-window rotation (SPEC §4.4)', () => {
  const overlapDoc = doc({
    countersignRoots: ['root-2024', 'root-2025'],
    crossSig: 'sig-of-root-2024-over-this-doc',
  });

  it('accepts a host pinned to the outgoing root during the overlap', () => {
    const verdict = evaluateTrustRoot(overlapDoc, [pin({ root: 'root-2024' })], NOT_BEFORE);
    expect(verdict.code).toBe('trusted');
    expect(verdict.matchedRoot).toBe('root-2024');
    expect(verdict.overlap).toBe(true);
    expect(verdict.crossSig).toBe('sig-of-root-2024-over-this-doc');
  });

  it('accepts a host pinned to the incoming root during the overlap', () => {
    const verdict = evaluateTrustRoot(overlapDoc, [pin({ root: 'root-2025' })], NOT_BEFORE);
    expect(verdict.code).toBe('trusted');
    expect(verdict.matchedRoot).toBe('root-2025');
    expect(verdict.overlap).toBe(true);
  });

  it('refuses a host still pinned to the dropped outgoing root after the overlap closes', () => {
    const afterOverlap = doc({ countersignRoots: ['root-2025'] });
    const verdict = evaluateTrustRoot(afterOverlap, [pin({ root: 'root-2024' })], NOT_BEFORE);
    expect(verdict.code).toBe('unpinned');
    expect(verdict.overlap).toBe(false);
  });
});
