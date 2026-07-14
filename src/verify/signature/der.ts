/**
 * Minimal, single-purpose ASN.1 DER / X.509 decoding for the signature-verify
 * path (docs/SPEC.md §4.2, §7). This is deliberately **not** a general X.509
 * library: it decodes only the fields dual-signature verification needs from a
 * short-lived leaf certificate — the SubjectPublicKeyInfo (to import the signing
 * key), the raw `tbsCertificate` bytes and the outer signature (to check the cert
 * is issued by a pinned root), the OIDC-issuer extension, and the
 * subject-alternative-name identity — and refuses everything else.
 *
 * Dependency decision (SPEC §8 — audited surface on the verify path, same
 * rationale as the in-house canonicalizer in #12 and the WebCrypto hash in #13):
 * the accepted certificate profile is narrow (ECDSA P-256 leaves with a fixed
 * field layout), so the correct decoding surface is small and self-contained. A
 * full ASN.1 stack (or the Sigstore JS verifier, which pulls a large Node-only,
 * network-capable tree) is neither minimal nor isomorphic; keeping this in-house
 * preserves the package's **zero runtime dependencies** and its
 * "minimal-and-auditable most-pinned package" posture (SPEC §7). The signature
 * math itself is WebCrypto (`globalThis.crypto.subtle`, see `signature.ts`).
 *
 * Pure and isomorphic: byte-in, structure-out. No I/O, no key handling, no clock.
 * Every malformed input throws {@link DerError}; the verifier maps that to a
 * stable certificate-malformed reason (it never leaks parser internals).
 */

/** Thrown by any decoding step on malformed input. Caught + mapped by the verifier. */
export class DerError extends Error {
  override readonly name = 'DerError';
}

// --- base64 (standard alphabet) ------------------------------------------------

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup: char code → 6-bit value, or `undefined` for non-alphabet. */
const BASE64_LOOKUP: ReadonlyMap<number, number> = new Map(
  [...BASE64_ALPHABET].map((char, value) => [char.charCodeAt(0), value]),
);

/**
 * Decode standard-alphabet base64 (with or without `=` padding) to bytes.
 * Whitespace is not tolerated — the wire fields are compact base64. Any
 * character outside the alphabet (other than trailing `=`) throws {@link DerError}.
 */
export function decodeBase64(input: string): Uint8Array {
  let end = input.length;
  while (end > 0 && input.charCodeAt(end - 1) === 0x3d /* '=' */) end--;
  const out = new Uint8Array((end * 3) >> 2);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < end; i++) {
    const value = BASE64_LOOKUP.get(input.charCodeAt(i));
    if (value === undefined) throw new DerError('invalid base64 character');
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

// --- DER TLV reader ------------------------------------------------------------

/** One decoded Tag-Length-Value element. */
export interface Tlv {
  /** The identifier octet (tag). */
  readonly tag: number;
  /** The value bytes (content), excluding tag + length header. */
  readonly content: Uint8Array;
  /** The full element bytes (tag + length + content) as a view of the source. */
  readonly raw: Uint8Array;
}

/**
 * Sequential reader over a DER byte range. Each primitive throws {@link DerError}
 * on truncation or malformed length so the verifier funnels every structural
 * failure through one catch rather than per-field branches.
 */
class DerReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}

  /** Whether the whole range has been consumed. */
  atEnd(): boolean {
    return this.pos >= this.bytes.length;
  }

  /** Read the next TLV, advancing past it. */
  next(): Tlv {
    const start = this.pos;
    if (this.pos >= this.bytes.length) throw new DerError('truncated: expected a tag');
    const tag = this.bytes[this.pos++] as number;
    const length = this.readLength();
    const end = this.pos + length;
    if (end > this.bytes.length) throw new DerError('truncated: content exceeds buffer');
    const content = this.bytes.subarray(this.pos, end);
    const raw = this.bytes.subarray(start, end);
    this.pos = end;
    return { tag, content, raw };
  }

  private readLength(): number {
    if (this.pos >= this.bytes.length) throw new DerError('truncated: expected a length');
    const first = this.bytes[this.pos++] as number;
    if (first < 0x80) return first;
    const count = first & 0x7f;
    // Reject the indefinite form (0x80) and absurd length-of-length: DER is
    // definite-length and these certificates are small.
    if (count === 0 || count > 4) throw new DerError('unsupported DER length encoding');
    let length = 0;
    for (let i = 0; i < count; i++) {
      if (this.pos >= this.bytes.length) throw new DerError('truncated: length bytes');
      length = (length << 8) | (this.bytes[this.pos++] as number);
    }
    return length;
  }
}

/** Split a container's content bytes into its child TLVs. */
export function readChildren(content: Uint8Array): Tlv[] {
  const reader = new DerReader(content);
  const children: Tlv[] = [];
  while (!reader.atEnd()) children.push(reader.next());
  return children;
}

/** Read exactly one TLV from `bytes`, requiring it to be `expectedTag`. */
export function readTagged(bytes: Uint8Array, expectedTag: number): Tlv {
  const reader = new DerReader(bytes);
  const tlv = reader.next();
  if (tlv.tag !== expectedTag) throw new DerError(`expected tag 0x${expectedTag.toString(16)}`);
  return tlv;
}

// --- ECDSA signature conversion ------------------------------------------------

const P256_COORD_BYTES = 32;

/** Left-trim leading `0x00` sign/padding bytes, then left-pad to `size`. */
function normalizeCoordinate(bytes: Uint8Array, size: number): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start++;
  const trimmed = bytes.subarray(start);
  if (trimmed.length > size) throw new DerError('ECDSA coordinate too large for curve');
  const out = new Uint8Array(size);
  out.set(trimmed, size - trimmed.length);
  return out;
}

/**
 * Convert a DER-encoded ECDSA signature (`SEQUENCE { INTEGER r, INTEGER s }`, as
 * X.509 certificate signatures use) to the IEEE-P1363 fixed-width `r || s` form
 * WebCrypto's `verify` expects. P-256 only (32-byte coordinates).
 */
export function derEcdsaToP1363(der: Uint8Array): Uint8Array {
  const seq = readTagged(der, 0x30);
  const parts = readChildren(seq.content);
  if (parts.length !== 2) throw new DerError('ECDSA signature must be two integers');
  const [r, s] = parts as [Tlv, Tlv];
  if (r.tag !== 0x02 || s.tag !== 0x02) throw new DerError('ECDSA signature integers malformed');
  const out = new Uint8Array(P256_COORD_BYTES * 2);
  out.set(normalizeCoordinate(r.content, P256_COORD_BYTES), 0);
  out.set(normalizeCoordinate(s.content, P256_COORD_BYTES), P256_COORD_BYTES);
  return out;
}

// --- X.509 leaf certificate ----------------------------------------------------

/** OID `2.5.29.17` (subjectAltName), compared as raw DER bytes to avoid an OID decoder. */
const OID_SUBJECT_ALT_NAME = Uint8Array.of(0x55, 0x1d, 0x11);
/** OID `1.3.6.1.4.1.57264.1.1` — Sigstore/Fulcio "OIDC Issuer" (legacy, raw-string value). */
const OID_FULCIO_ISSUER = Uint8Array.of(0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, 0x01);

/** SAN `GeneralName` kinds this profile accepts: rfc822Name (email) and URI. */
const SAN_RFC822 = 0x81;
const SAN_URI = 0x86;

/** An OIDC identity extracted from a leaf certificate's SAN. */
export interface CertIdentity {
  /** Which SAN `GeneralName` form carried the identity. */
  readonly kind: 'email' | 'uri';
  /** The identity value (an email address or a URI). */
  readonly value: string;
}

/** The fields the verifier needs from a decoded leaf certificate. */
export interface LeafCertificate {
  /** Raw `tbsCertificate` DER bytes — the message the issuing root signed. */
  readonly tbs: Uint8Array;
  /** Outer signature in IEEE-P1363 form, ready for WebCrypto `verify`. */
  readonly signature: Uint8Array;
  /** Raw `SubjectPublicKeyInfo` DER — imported as the cert's ECDSA public key. */
  readonly spki: Uint8Array;
  /** OIDC issuer from the Fulcio issuer extension, or `undefined` if absent. */
  readonly issuer: string | undefined;
  /** SAN identity, or `undefined` if the certificate carries no SAN. */
  readonly identity: CertIdentity | undefined;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new DerError('invalid UTF-8 in certificate');
  }
}

/** Extract the first accepted SAN `GeneralName` from a subjectAltName extension value. */
function parseSubjectAltName(extnValue: Uint8Array): CertIdentity | undefined {
  const names = readChildren(readTagged(extnValue, 0x30).content);
  for (const name of names) {
    if (name.tag === SAN_RFC822) return { kind: 'email', value: decodeUtf8(name.content) };
    if (name.tag === SAN_URI) return { kind: 'uri', value: decodeUtf8(name.content) };
  }
  return undefined;
}

/**
 * Walk the `Extensions` (`SEQUENCE OF Extension`) content, pulling out the OIDC
 * issuer and SAN identity. Each `Extension` is `SEQUENCE { extnID OID, critical
 * BOOLEAN DEFAULT FALSE, extnValue OCTET STRING }`; the value is the last child.
 */
function parseExtensions(extensionsContent: Uint8Array): Pick<LeafCertificate, 'issuer' | 'identity'> {
  let issuer: string | undefined;
  let identity: CertIdentity | undefined;
  for (const extension of readChildren(extensionsContent)) {
    if (extension.tag !== 0x30) throw new DerError('extension is not a SEQUENCE');
    const fields = readChildren(extension.content);
    const oid = fields[0];
    if (oid === undefined || oid.tag !== 0x06) throw new DerError('malformed extension');
    // With `oid` present the sequence is non-empty, so the last field exists.
    const value = fields[fields.length - 1] as Tlv;
    if (value.tag !== 0x04) throw new DerError('malformed extension');
    if (bytesEqual(oid.content, OID_FULCIO_ISSUER)) {
      issuer = decodeUtf8(value.content);
    } else if (bytesEqual(oid.content, OID_SUBJECT_ALT_NAME)) {
      identity = parseSubjectAltName(value.content);
    }
  }
  return { issuer, identity };
}

/**
 * Decode a DER X.509 certificate into the {@link LeafCertificate} fields the
 * verifier uses. Requires the v3 layout (`[0] version` present) with the standard
 * field order; anything else throws {@link DerError}. Validity/serial/issuer-DN
 * are intentionally skipped — temporal validity is the orchestrator's clock
 * concern (SPEC §5), not this pure module's.
 */
export function parseLeafCertificate(der: Uint8Array): LeafCertificate {
  const certificate = readChildren(readTagged(der, 0x30).content);
  if (certificate.length !== 3) throw new DerError('certificate is not a 3-element SEQUENCE');
  const [tbsTlv, , signatureTlv] = certificate as [Tlv, Tlv, Tlv];
  if (tbsTlv.tag !== 0x30) throw new DerError('tbsCertificate is not a SEQUENCE');
  if (signatureTlv.tag !== 0x03) throw new DerError('signatureValue is not a BIT STRING');

  // BIT STRING content is a leading "unused bits" octet (always 0x00 here)
  // followed by the DER-encoded ECDSA signature.
  const signatureBits = signatureTlv.content.subarray(1);
  const signature = derEcdsaToP1363(signatureBits);

  const fields = readChildren(tbsTlv.content);
  // v3 layout: [0]version, serial, sigAlg, issuer, validity, subject, spki, then
  // optional context-tagged trailers ([3] holds Extensions).
  if (fields.length < 7) throw new DerError('unexpected tbsCertificate layout');
  const version = fields[0] as Tlv;
  if (version.tag !== 0xa0) throw new DerError('unexpected tbsCertificate layout');
  const spkiTlv = fields[6] as Tlv;
  if (spkiTlv.tag !== 0x30) throw new DerError('subjectPublicKeyInfo is not a SEQUENCE');
  // WebCrypto importKey('spki') wants the full SubjectPublicKeyInfo element; use
  // its exact source bytes (also what the issuing root signed within the tbs).
  const spki = spkiTlv.raw;

  let issuer: string | undefined;
  let identity: CertIdentity | undefined;
  const extensionsWrapper = fields.slice(7).find((field) => field.tag === 0xa3);
  if (extensionsWrapper !== undefined) {
    const parsed = parseExtensions(readTagged(extensionsWrapper.content, 0x30).content);
    issuer = parsed.issuer;
    identity = parsed.identity;
  }

  return { tbs: tbsTlv.raw, signature, spki, issuer, identity };
}
