import { describe, expect, it } from 'vitest';

import { base64ToBytes, hexToBytes } from '../../../src/verify/log/encoding.js';

// The in-house base64 / lowercase-hex decoders on the verify path (docs/SPEC.md
// §4.3, §8). Every malformed shape must return `undefined` (a stable verdict
// upstream, never a throw), so both the happy path and each rejection branch are
// pinned here for the security-core 100% gate.

const bytes = (...xs: number[]): Uint8Array => Uint8Array.from(xs);

describe('base64ToBytes', () => {
  it('decodes padded and unpadded standard base64', () => {
    // "Man" and its truncations exercise the 1- and 2-byte tail groups.
    expect(base64ToBytes('TWFu')).toEqual(bytes(0x4d, 0x61, 0x6e));
    expect(base64ToBytes('TWE=')).toEqual(bytes(0x4d, 0x61));
    expect(base64ToBytes('TQ==')).toEqual(bytes(0x4d));
    expect(base64ToBytes('TWE')).toEqual(bytes(0x4d, 0x61)); // unpadded
    expect(base64ToBytes('TQ')).toEqual(bytes(0x4d)); // unpadded
    expect(base64ToBytes('')).toEqual(bytes());
    expect(base64ToBytes('+/+/')).toEqual(bytes(0xfb, 0xff, 0xbf)); // full alphabet
  });

  it('rejects a lone trailing character (impossible length)', () => {
    expect(base64ToBytes('TWFuX')).toBeUndefined();
  });

  it('rejects padding that does not square the group length', () => {
    expect(base64ToBytes('TWE==')).toBeUndefined(); // remainder 3 + 2 pad
    expect(base64ToBytes('TW=')).toBeUndefined(); // remainder 2 + 1 pad
  });

  it('rejects an internal (non-trailing) padding character', () => {
    expect(base64ToBytes('TW=u')).toBeUndefined();
  });

  it('rejects non-alphabet and non-ASCII characters', () => {
    expect(base64ToBytes('TW$u')).toBeUndefined();
    expect(base64ToBytes('TWé=')).toBeUndefined();
  });
});

describe('hexToBytes', () => {
  it('decodes lowercase hex, including empty', () => {
    expect(hexToBytes('')).toEqual(bytes());
    expect(hexToBytes('00ff10')).toEqual(bytes(0x00, 0xff, 0x10));
  });

  it('rejects odd-length input', () => {
    expect(hexToBytes('abc')).toBeUndefined();
  });

  it('rejects uppercase and non-hex characters in either nibble', () => {
    expect(hexToBytes('AB')).toBeUndefined(); // uppercase
    expect(hexToBytes('0g')).toBeUndefined(); // bad low nibble
    expect(hexToBytes('g0')).toBeUndefined(); // bad high nibble
  });
});
