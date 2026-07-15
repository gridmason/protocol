import { beforeAll, describe, expect, it } from 'vitest';

import { verifyRevocationFeed } from '../../../src/verify/revocation/index.js';
import type { SignedRevocationFeed } from '../../../src/types/wire/revocation.js';
import {
  buildCert,
  exportSpki,
  generateEd25519KeyPair,
  toBase64,
} from '../../vectors/signature/build.js';
import { buildFeedScenario, type FeedScenario } from '../../vectors/revocation/build.js';

/** Flip the first byte of some bytes so a signature over them no longer holds. */
function tamper(bytes: Uint8Array): Uint8Array {
  const copy = Uint8Array.from(bytes);
  copy[0] = (copy[0] ?? 0) ^ 0xff;
  return copy;
}

/** Decode a standard-alphabet base64 string back to bytes (test-side helper). */
function fromBase64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64'));
}

describe('verifyRevocationFeed', () => {
  let base: FeedScenario;
  beforeAll(async () => {
    base = await buildFeedScenario();
  });

  /** Verify `signed` against the base scenario's pinned countersign roots. */
  const verify = (signed: SignedRevocationFeed, trust = base.trust) => verifyRevocationFeed(signed, trust);

  it('accepts a validly countersigned feed and returns the authenticated feed', async () => {
    const verdict = await verify(base.signed);
    expect(verdict).toEqual({ reason: 'ok', ok: true, feed: base.signed.feed });
  });

  it('accepts a validly countersigned empty ("nothing revoked") feed', async () => {
    const empty = await buildFeedScenario({ seq: 0, entries: [] });
    const verdict = await verifyRevocationFeed(empty.signed, empty.trust);
    expect(verdict).toEqual({ reason: 'ok', ok: true, feed: empty.signed.feed });
  });

  it('refuses a signature algorithm other than ES256', async () => {
    const signed = { ...base.signed, signature: { ...base.signed.signature, alg: 'RS256' as 'ES256' } };
    expect((await verify(signed)).reason).toBe('unsupported-signature-alg');
  });

  it('refuses a countersign certificate that is not decodable DER', async () => {
    const signed = {
      ...base.signed,
      signature: { ...base.signed.signature, cert: toBase64(Uint8Array.of(0x30, 0x01, 0x00)) },
    };
    expect((await verify(signed)).reason).toBe('signature-cert-malformed');
  });

  it('refuses a countersign certificate whose key is not ECDSA P-256', async () => {
    const edLeaf = await generateEd25519KeyPair();
    const cert = await buildCert({
      issuerKey: base.countersignRootKey.privateKey,
      subjectSpki: await exportSpki(edLeaf.publicKey),
      includeExtensions: false,
    });
    const signed = { ...base.signed, signature: { ...base.signed.signature, cert: toBase64(cert) } };
    expect((await verify(signed)).reason).toBe('signature-cert-malformed');
  });

  it('refuses a countersign certificate no pinned root issued', async () => {
    const trust = { countersignRoots: [] };
    expect((await verify(base.signed, trust)).reason).toBe('signature-cert-untrusted');
  });

  it('skips an unimportable pinned root and still refuses when none match', async () => {
    const trust = { countersignRoots: [Uint8Array.of(0x30, 0x00)] };
    expect((await verify(base.signed, trust)).reason).toBe('signature-cert-untrusted');
  });

  it('refuses when a valid pinned root did not issue the cert', async () => {
    const other = await buildFeedScenario();
    // `other`'s root is a real P-256 key, but it did not sign this feed's leaf.
    expect((await verify(base.signed, other.trust)).reason).toBe('signature-cert-untrusted');
  });

  it('refuses a tampered signature', async () => {
    const signed = {
      ...base.signed,
      signature: { ...base.signed.signature, sig: toBase64(tamper(fromBase64(base.signed.signature.sig))) },
    };
    expect((await verify(signed)).reason).toBe('signature-invalid');
  });

  it('refuses a signature of the wrong length', async () => {
    const signed = {
      ...base.signed,
      signature: { ...base.signed.signature, sig: toBase64(Uint8Array.of(1, 2, 3)) },
    };
    expect((await verify(signed)).reason).toBe('signature-invalid');
  });

  it('refuses a signature that is not valid base64', async () => {
    const signed = { ...base.signed, signature: { ...base.signed.signature, sig: '!!not base64!!' } };
    expect((await verify(signed)).reason).toBe('signature-invalid');
  });

  it('refuses when the feed bytes no longer match the signed bytes', async () => {
    const signed = { ...base.signed, feed: { ...base.signed.feed, seq: base.signed.feed.seq + 1 } };
    expect((await verify(signed)).reason).toBe('signature-invalid');
  });
});
