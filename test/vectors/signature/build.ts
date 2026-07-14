/**
 * Test-only fixture builder for signature-envelope vectors. Mints real ECDSA
 * P-256 key pairs, DER X.509 leaf certificates (with Fulcio-style OIDC-issuer +
 * SAN extensions), and signatures with WebCrypto, so the verifier is exercised
 * against genuine cryptographic material rather than hand-waved blobs.
 *
 * This lives under `test/` (outside the coverage `include`) and carries a tiny
 * DER *encoder* — the mirror of the lib's minimal decoder — which the shipped
 * package never contains. It is the production side of the sign path the pure
 * verify lib deliberately omits (SPEC §5): signing lives outside `@gridmason/protocol`.
 */

import { canonicalize } from '../../../src/canon/index.js';
import { hashBytes } from '../../../src/verify/hash/index.js';
import type {
  SignatureEnvelope,
  SignatureSubject,
} from '../../../src/types/wire/signature.js';
import type { SignatureTrustInputs } from '../../../src/verify/signature/index.js';

const subtle = globalThis.crypto.subtle;

/** WebCrypto key type, derived from the API (no DOM lib, no `node:crypto` import). */
type CryptoKey = Awaited<ReturnType<typeof subtle.importKey>>;

// --- minimal DER encoder -------------------------------------------------------

function encodeLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag: number, content: Uint8Array): Uint8Array {
  return Uint8Array.from([tag, ...encodeLength(content.length), ...content]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

const seq = (...children: Uint8Array[]): Uint8Array => tlv(0x30, concat(children));
const octetString = (content: Uint8Array): Uint8Array => tlv(0x04, content);
const oid = (content: Uint8Array): Uint8Array => tlv(0x06, content);
const bitString = (content: Uint8Array): Uint8Array => tlv(0x03, concat([Uint8Array.of(0x00), content]));
const explicit = (tagNumber: number, inner: Uint8Array): Uint8Array => tlv(0xa0 | tagNumber, inner);
const contextPrimitive = (tagNumber: number, content: Uint8Array): Uint8Array => tlv(0x80 | tagNumber, content);

/** DER INTEGER from a nonnegative big-endian value (adds a `0x00` sign byte if needed). */
function integer(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start++;
  const trimmed = bytes.subarray(start);
  const needsPad = (trimmed[0] ?? 0) >= 0x80;
  return tlv(0x02, needsPad ? Uint8Array.from([0x00, ...trimmed]) : trimmed);
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const utcTime = (value: string): Uint8Array => tlv(0x17, utf8(value));

// OID contents (tag+length added by `oid()`).
const OID_ECDSA_WITH_SHA256 = Uint8Array.of(0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02);
const OID_SUBJECT_ALT_NAME = Uint8Array.of(0x55, 0x1d, 0x11);
const OID_FULCIO_ISSUER = Uint8Array.of(0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, 0x01);

const ALG_ECDSA_SHA256 = seq(oid(OID_ECDSA_WITH_SHA256));
const EMPTY_NAME = seq();

/** Convert an IEEE-P1363 `r || s` signature to the DER form X.509 signatures use. */
function p1363ToDer(sig: Uint8Array): Uint8Array {
  return seq(integer(sig.subarray(0, 32)), integer(sig.subarray(32)));
}

// --- WebCrypto helpers ---------------------------------------------------------

export interface KeyPair {
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
}

export async function generateKeyPair(): Promise<KeyPair> {
  return subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as Promise<KeyPair>;
}

export async function generateEd25519KeyPair(): Promise<KeyPair> {
  return subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as Promise<KeyPair>;
}

export async function exportSpki(publicKey: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle.exportKey('spki', publicKey));
}

/** Sign `message` with an ECDSA P-256 key, returning the raw IEEE-P1363 signature. */
export async function signP1363(privateKey: CryptoKey, message: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, message));
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

// --- certificate assembly ------------------------------------------------------

export interface CertOptions {
  /** Private key of the issuing root (signs the tbsCertificate). */
  readonly issuerKey: CryptoKey;
  /** SPKI DER of the certified leaf public key. */
  readonly subjectSpki: Uint8Array;
  /** OIDC issuer to embed in the Fulcio issuer extension. */
  readonly oidcIssuer?: string;
  /** SAN email identity (rfc822Name). */
  readonly sanEmail?: string;
  /** SAN URI identity (uniformResourceIdentifier); used when `sanEmail` is absent. */
  readonly sanUri?: string;
  /** Emit the `[3]` extensions block at all (a cert with no extensions when false). */
  readonly includeExtensions?: boolean;
}

/** Build a DER X.509 v3 leaf certificate signed by `issuerKey`. */
export async function buildCert(options: CertOptions): Promise<Uint8Array> {
  const extensions: Uint8Array[] = [];
  if (options.oidcIssuer !== undefined) {
    extensions.push(seq(oid(OID_FULCIO_ISSUER), octetString(utf8(options.oidcIssuer))));
  }
  if (options.sanEmail !== undefined) {
    extensions.push(seq(oid(OID_SUBJECT_ALT_NAME), octetString(seq(contextPrimitive(1, utf8(options.sanEmail))))));
  } else if (options.sanUri !== undefined) {
    extensions.push(seq(oid(OID_SUBJECT_ALT_NAME), octetString(seq(contextPrimitive(6, utf8(options.sanUri))))));
  }

  const tbsChildren: Uint8Array[] = [
    explicit(0, integer(Uint8Array.of(0x02))), // version v3
    integer(Uint8Array.of(0x01)), // serial
    ALG_ECDSA_SHA256,
    EMPTY_NAME, // issuer
    seq(utcTime('240101000000Z'), utcTime('340101000000Z')), // validity
    EMPTY_NAME, // subject
    options.subjectSpki,
  ];
  if (options.includeExtensions !== false) {
    tbsChildren.push(explicit(3, seq(...extensions)));
  }
  const tbs = seq(...tbsChildren);
  const signature = p1363ToDer(await signP1363(options.issuerKey, tbs));
  return seq(tbs, ALG_ECDSA_SHA256, bitString(signature));
}

// --- full scenario -------------------------------------------------------------

/** A fully-populated valid scenario plus the raw material to derive negatives. */
export interface Scenario {
  readonly envelope: SignatureEnvelope;
  readonly releaseBytes: Uint8Array;
  readonly trust: SignatureTrustInputs;
  readonly subject: SignatureSubject;
  /** The 64-byte publisher P-256 signature (countersigned value). */
  readonly publisherSig: Uint8Array;
  readonly leafKey: KeyPair;
  readonly registryLeafKey: KeyPair;
  readonly publisherRootKey: KeyPair;
  readonly registryRootKey: KeyPair;
}

export const ISSUER = 'https://accounts.google.com';
export const EMAIL = 'dev@acme.com';

/** Build the canonical happy-path scenario every negative test mutates from. */
export async function buildScenario(): Promise<Scenario> {
  const publisherRootKey = await generateKeyPair();
  const registryRootKey = await generateKeyPair();
  const leafKey = await generateKeyPair();
  const registryLeafKey = await generateKeyPair();

  const releaseDoc = { widget: 'acme-chart', version: '2.3.1', entry: 'index.js' };
  const releaseBytes = canonicalize(releaseDoc);
  const subject: SignatureSubject = {
    artifact: 'acme-chart@2.3.1',
    releaseHash: await hashBytes(releaseBytes),
  };
  const subjectBytes = canonicalize(subject);

  const leafCert = await buildCert({
    issuerKey: publisherRootKey.privateKey,
    subjectSpki: await exportSpki(leafKey.publicKey),
    oidcIssuer: ISSUER,
    sanEmail: EMAIL,
  });
  const registryCert = await buildCert({
    issuerKey: registryRootKey.privateKey,
    subjectSpki: await exportSpki(registryLeafKey.publicKey),
    includeExtensions: false,
  });

  const publisherSig = await signP1363(leafKey.privateKey, subjectBytes);
  const registrySig = await signP1363(registryLeafKey.privateKey, publisherSig);

  const envelope: SignatureEnvelope = {
    formatVersion: '1.0',
    subject,
    publisherSig: {
      alg: 'ES256',
      cert: toBase64(leafCert),
      issuer: ISSUER,
      subjectClaims: { email: EMAIL },
      sig: toBase64(publisherSig),
    },
    registrySig: {
      alg: 'ES256',
      cert: toBase64(registryCert),
      sig: toBase64(registrySig),
    },
    logInclusion: { logId: 'rekor.example', index: 88421, proof: [] },
  };

  const trust: SignatureTrustInputs = {
    issuerAllowlist: [ISSUER],
    publisherCARoots: [await exportSpki(publisherRootKey.publicKey)],
    countersignRoots: [await exportSpki(registryRootKey.publicKey)],
  };

  return {
    envelope,
    releaseBytes,
    trust,
    subject,
    publisherSig,
    leafKey,
    registryLeafKey,
    publisherRootKey,
    registryRootKey,
  };
}
