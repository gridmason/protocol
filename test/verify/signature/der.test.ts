import { describe, expect, it } from 'vitest';

import {
  DerError,
  decodeBase64,
  derEcdsaToP1363,
  parseLeafCertificate,
  readChildren,
  readTagged,
} from '../../../src/verify/signature/der.js';

// --- a local DER encoder, just for crafting parser fixtures --------------------

function encodeLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  let n = length;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}
const tlv = (tag: number, content: Uint8Array): Uint8Array =>
  Uint8Array.from([tag, ...encodeLength(content.length), ...content]);
const concat = (parts: Uint8Array[]): Uint8Array => Uint8Array.from(parts.flatMap((p) => [...p]));
const seq = (...c: Uint8Array[]): Uint8Array => tlv(0x30, concat(c));
const octet = (c: Uint8Array): Uint8Array => tlv(0x04, c);
const oid = (c: Uint8Array): Uint8Array => tlv(0x06, c);
const int = (c: Uint8Array): Uint8Array => tlv(0x02, c);
const bitString = (c: Uint8Array): Uint8Array => tlv(0x03, concat([Uint8Array.of(0x00), c]));
const explicit = (n: number, inner: Uint8Array): Uint8Array => tlv(0xa0 | n, inner);
const ctx = (n: number, c: Uint8Array): Uint8Array => tlv(0x80 | n, c);
const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

const OID_SAN = bytes(0x55, 0x1d, 0x11);
const OID_FULCIO = bytes(0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, 0x01);
const OID_UNKNOWN = bytes(0x55, 0x1d, 0x13); // basicConstraints — same length as SAN, different bytes

// A syntactically valid ECDSA signature (r=1, s=1); parseLeafCertificate runs the
// DER→P1363 conversion over it but verifies nothing.
const DUMMY_SIG = bitString(seq(int(bytes(0x01)), int(bytes(0x01))));
const DUMMY_ALG = seq(oid(bytes(0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02)));
const DUMMY_SPKI = seq(oid(bytes(0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01)), bitString(bytes(0x04, 0x00)));

interface CertShape {
  readonly extensions?: Uint8Array[];
  readonly omitExtensionsBlock?: boolean;
  readonly spki?: Uint8Array;
}

/** Assemble a parse-only leaf certificate; nothing here is cryptographically signed. */
function cert(shape: CertShape = {}): Uint8Array {
  const tbsChildren = [
    explicit(0, int(bytes(0x02))),
    int(bytes(0x01)),
    DUMMY_ALG,
    seq(), // issuer
    seq(tlv(0x17, utf8('240101000000Z')), tlv(0x17, utf8('340101000000Z'))),
    seq(), // subject
    shape.spki ?? DUMMY_SPKI,
  ];
  if (!shape.omitExtensionsBlock) {
    tbsChildren.push(explicit(3, seq(...(shape.extensions ?? []))));
  }
  return seq(seq(...tbsChildren), DUMMY_ALG, DUMMY_SIG);
}

const sanEmail = (email: string): Uint8Array => seq(oid(OID_SAN), octet(seq(ctx(1, utf8(email)))));
const sanRaw = (name: Uint8Array): Uint8Array => seq(oid(OID_SAN), octet(seq(name)));
const fulcioIssuer = (issuer: string): Uint8Array => seq(oid(OID_FULCIO), octet(utf8(issuer)));

describe('decodeBase64', () => {
  it('decodes unpadded and padded input', () => {
    expect([...decodeBase64('QUJD')]).toEqual([0x41, 0x42, 0x43]);
    expect([...decodeBase64('QQ==')]).toEqual([0x41]);
    expect([...decodeBase64('')]).toEqual([]);
  });

  it('throws on a non-alphabet character', () => {
    expect(() => decodeBase64('QQ*Q')).toThrow(DerError);
  });
});

describe('DER TLV reader', () => {
  it('splits a container into its children', () => {
    expect(readChildren(concat([int(bytes(1)), int(bytes(2))]))).toHaveLength(2);
  });

  it('reads a long-form length', () => {
    const big = new Uint8Array(200).fill(7);
    const tlvBytes = tlv(0x04, big);
    expect(readTagged(tlvBytes, 0x04).content).toHaveLength(200);
  });

  it('rejects a tag mismatch', () => {
    expect(() => readTagged(int(bytes(1)), 0x30)).toThrow(DerError);
  });

  it('rejects truncation before a tag', () => {
    expect(() => readTagged(bytes(), 0x30)).toThrow(/expected a tag/);
  });

  it('rejects truncation before a length', () => {
    expect(() => readTagged(bytes(0x30), 0x30)).toThrow(/expected a length/);
  });

  it('rejects the indefinite length form', () => {
    expect(() => readTagged(bytes(0x04, 0x80), 0x04)).toThrow(/length encoding/);
  });

  it('rejects an oversize length-of-length', () => {
    expect(() => readTagged(bytes(0x04, 0x85, 1, 2, 3, 4, 5), 0x04)).toThrow(/length encoding/);
  });

  it('rejects truncated long-form length bytes', () => {
    expect(() => readTagged(bytes(0x04, 0x82, 0x01), 0x04)).toThrow(/length bytes/);
  });

  it('rejects content that exceeds the buffer', () => {
    expect(() => readTagged(bytes(0x04, 0x05, 0x00), 0x04)).toThrow(/exceeds buffer/);
  });
});

describe('derEcdsaToP1363', () => {
  it('converts a well-formed signature to fixed-width r||s', () => {
    const r = new Uint8Array(32).fill(0xaa);
    const s = new Uint8Array(32).fill(0xbb);
    const out = derEcdsaToP1363(seq(int(r), int(s)));
    expect(out).toHaveLength(64);
    expect(out[0]).toBe(0xaa);
    expect(out[32]).toBe(0xbb);
  });

  it('strips a leading sign byte and left-pads short coordinates', () => {
    const out = derEcdsaToP1363(seq(int(bytes(0x00, 0x7f)), int(bytes(0x01))));
    expect(out).toHaveLength(64);
    expect(out[31]).toBe(0x7f);
    expect(out[63]).toBe(0x01);
  });

  it('rejects a signature that is not two integers', () => {
    expect(() => derEcdsaToP1363(seq(int(bytes(1))))).toThrow(/two integers/);
  });

  it('rejects a non-integer first component', () => {
    expect(() => derEcdsaToP1363(seq(oid(bytes(1)), int(bytes(2))))).toThrow(/integers malformed/);
  });

  it('rejects a non-integer second component', () => {
    expect(() => derEcdsaToP1363(seq(int(bytes(1)), oid(bytes(2))))).toThrow(/integers malformed/);
  });

  it('rejects a coordinate that is too large for the curve', () => {
    const huge = new Uint8Array(33).fill(0x01);
    expect(() => derEcdsaToP1363(seq(int(huge), int(bytes(1))))).toThrow(/too large/);
  });
});

describe('parseLeafCertificate', () => {
  it('extracts issuer and email identity', () => {
    const leaf = parseLeafCertificate(
      cert({ extensions: [fulcioIssuer('https://accounts.google.com'), sanEmail('dev@acme.com')] }),
    );
    expect(leaf.issuer).toBe('https://accounts.google.com');
    expect(leaf.identity).toEqual({ kind: 'email', value: 'dev@acme.com' });
  });

  it('extracts a URI identity', () => {
    const leaf = parseLeafCertificate(cert({ extensions: [sanRaw(ctx(6, utf8('https://ci.example/workflow')))] }));
    expect(leaf.identity).toEqual({ kind: 'uri', value: 'https://ci.example/workflow' });
  });

  it('yields no identity when the SAN holds only an unsupported name form', () => {
    const leaf = parseLeafCertificate(cert({ extensions: [sanRaw(ctx(2, utf8('dns.example')))] }));
    expect(leaf.identity).toBeUndefined();
  });

  it('ignores extensions that are neither SAN nor the OIDC issuer', () => {
    const leaf = parseLeafCertificate(cert({ extensions: [seq(oid(OID_UNKNOWN), octet(bytes(0x01)))] }));
    expect(leaf.issuer).toBeUndefined();
    expect(leaf.identity).toBeUndefined();
  });

  it('yields no identity when there is no extensions block', () => {
    const leaf = parseLeafCertificate(cert({ omitExtensionsBlock: true }));
    expect(leaf.issuer).toBeUndefined();
    expect(leaf.identity).toBeUndefined();
  });

  it('rejects a certificate that is not a SEQUENCE', () => {
    expect(() => parseLeafCertificate(int(bytes(1)))).toThrow(DerError);
  });

  it('rejects a certificate that is not three elements', () => {
    expect(() => parseLeafCertificate(seq(seq(), DUMMY_ALG))).toThrow(/3-element/);
  });

  it('rejects a tbsCertificate that is not a SEQUENCE', () => {
    expect(() => parseLeafCertificate(seq(int(bytes(1)), DUMMY_ALG, DUMMY_SIG))).toThrow(/tbsCertificate/);
  });

  it('rejects a signatureValue that is not a BIT STRING', () => {
    expect(() => parseLeafCertificate(seq(seq(), DUMMY_ALG, int(bytes(1))))).toThrow(/BIT STRING/);
  });

  it('rejects a tbsCertificate whose first field is not the [0] version wrapper', () => {
    const tbs = seq(int(bytes(1)), int(bytes(1)), DUMMY_ALG, seq(), seq(), seq(), DUMMY_SPKI);
    expect(() => parseLeafCertificate(seq(tbs, DUMMY_ALG, DUMMY_SIG))).toThrow(/layout/);
  });

  it('rejects a tbsCertificate with too few fields', () => {
    const tbs = seq(explicit(0, int(bytes(0x02))), int(bytes(1)), DUMMY_ALG, seq(), seq(), seq());
    expect(() => parseLeafCertificate(seq(tbs, DUMMY_ALG, DUMMY_SIG))).toThrow(/layout/);
  });

  it('rejects a subjectPublicKeyInfo that is not a SEQUENCE', () => {
    expect(() => parseLeafCertificate(cert({ spki: int(bytes(1)) }))).toThrow(/subjectPublicKeyInfo/);
  });

  it('rejects an extension that is not a SEQUENCE', () => {
    expect(() => parseLeafCertificate(cert({ extensions: [int(bytes(1))] }))).toThrow(/not a SEQUENCE/);
  });

  it('rejects an empty extension SEQUENCE', () => {
    expect(() => parseLeafCertificate(cert({ extensions: [seq()] }))).toThrow(/malformed extension/);
  });

  it('rejects an extension whose first field is not an OID', () => {
    expect(() => parseLeafCertificate(cert({ extensions: [seq(int(bytes(1)), octet(bytes(1)))] }))).toThrow(
      /malformed extension/,
    );
  });

  it('rejects a structurally malformed extension', () => {
    // extnID present but extnValue is an INTEGER, not an OCTET STRING.
    expect(() => parseLeafCertificate(cert({ extensions: [seq(oid(OID_SAN), int(bytes(1)))] }))).toThrow(
      /malformed extension/,
    );
  });

  it('rejects invalid UTF-8 in a certificate string', () => {
    expect(() => parseLeafCertificate(cert({ extensions: [fulcioIssuer('x'), sanRaw(ctx(1, bytes(0xff, 0xfe)))] }))).toThrow(
      /UTF-8/,
    );
  });
});
