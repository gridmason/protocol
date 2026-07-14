import { beforeAll, describe, expect, it } from 'vitest';

import { verifySignatureEnvelope } from '../../../src/verify/signature/index.js';
import type { SignatureEnvelope } from '../../../src/types/wire/signature.js';
import {
  buildCert,
  buildScenario,
  EMAIL,
  exportSpki,
  generateEd25519KeyPair,
  ISSUER,
  toBase64,
  type Scenario,
} from '../../vectors/signature/build.js';

/** Flip the first byte of some bytes so a signature/hash over them no longer holds. */
function tamper(bytes: Uint8Array): Uint8Array {
  const copy = Uint8Array.from(bytes);
  copy[0] = (copy[0] ?? 0) ^ 0xff;
  return copy;
}

describe('verifySignatureEnvelope', () => {
  let base: Scenario;
  beforeAll(async () => {
    base = await buildScenario();
  });

  /** Verify `envelope` against the base scenario's release bytes + trust inputs. */
  const verify = (envelope: SignatureEnvelope, releaseBytes = base.releaseBytes, trust = base.trust) =>
    verifySignatureEnvelope({ envelope, releaseBytes, trust });

  it('accepts a valid dual-signed envelope and returns the verified identity', async () => {
    const verdict = await verify(base.envelope);
    expect(verdict).toEqual({
      reason: 'ok',
      ok: true,
      subject: base.envelope.subject,
      issuer: ISSUER,
      identity: { kind: 'email', value: EMAIL },
    });
  });

  it('refuses an unsupported format major', async () => {
    const verdict = await verify({ ...base.envelope, formatVersion: '2.0' });
    expect(verdict.reason).toBe('unsupported-format-version');
    expect(verdict.ok).toBe(false);
  });

  it('refuses a malformed format version (no minor)', async () => {
    const verdict = await verify({ ...base.envelope, formatVersion: '1' });
    expect(verdict.reason).toBe('unsupported-format-version');
  });

  it('refuses a publisher signature algorithm other than ES256', async () => {
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, alg: 'RS256' as 'ES256' },
    };
    expect((await verify(envelope)).reason).toBe('unsupported-signature-alg');
  });

  it('refuses when the release bytes do not hash to subject.releaseHash', async () => {
    expect((await verify(base.envelope, tamper(base.releaseBytes))).reason).toBe('subject-hash-mismatch');
  });

  it('refuses a publisher certificate that is not decodable DER', async () => {
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, cert: toBase64(Uint8Array.of(0x30, 0x01, 0x00)) },
    };
    expect((await verify(envelope)).reason).toBe('publisher-cert-malformed');
  });

  it('refuses a publisher certificate whose key is not ECDSA P-256', async () => {
    const edLeaf = await generateEd25519KeyPair();
    const cert = await buildCert({
      issuerKey: base.publisherRootKey.privateKey,
      subjectSpki: await exportSpki(edLeaf.publicKey),
      oidcIssuer: ISSUER,
      sanEmail: EMAIL,
    });
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, cert: toBase64(cert) },
    };
    expect((await verify(envelope)).reason).toBe('publisher-cert-malformed');
  });

  it('refuses a publisher certificate no pinned root issued', async () => {
    const trust = { ...base.trust, publisherCARoots: [] };
    expect((await verify(base.envelope, base.releaseBytes, trust)).reason).toBe('publisher-cert-untrusted');
  });

  it('skips an unimportable pinned root and still refuses when none match', async () => {
    const trust = { ...base.trust, publisherCARoots: [Uint8Array.of(0x30, 0x00)] };
    expect((await verify(base.envelope, base.releaseBytes, trust)).reason).toBe('publisher-cert-untrusted');
  });

  it('refuses when a valid pinned root did not issue the leaf', async () => {
    // The countersign root is a real P-256 key, but it did not sign the publisher leaf.
    const trust = { ...base.trust, publisherCARoots: base.trust.countersignRoots };
    expect((await verify(base.envelope, base.releaseBytes, trust)).reason).toBe('publisher-cert-untrusted');
  });

  it('refuses a publisher certificate that carries no OIDC identity', async () => {
    const cert = await buildCert({
      issuerKey: base.publisherRootKey.privateKey,
      subjectSpki: await exportSpki(base.leafKey.publicKey),
      includeExtensions: false,
    });
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, cert: toBase64(cert) },
    };
    expect((await verify(envelope)).reason).toBe('publisher-cert-missing-identity');
  });

  it('refuses when the envelope issuer disagrees with the certificate', async () => {
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, issuer: 'https://evil.example' },
    };
    expect((await verify(envelope)).reason).toBe('publisher-issuer-mismatch');
  });

  it('refuses an issuer that is not on the allowlist', async () => {
    const trust = { ...base.trust, issuerAllowlist: [] };
    expect((await verify(base.envelope, base.releaseBytes, trust)).reason).toBe(
      'publisher-issuer-not-allowlisted',
    );
  });

  it('refuses when the claimed identity does not match the certificate SAN', async () => {
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, subjectClaims: { email: 'someone@else.example' } },
    };
    expect((await verify(envelope)).reason).toBe('publisher-identity-mismatch');
  });

  it('refuses a tampered publisher signature', async () => {
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, sig: toBase64(tamper(base.publisherSig)) },
    };
    expect((await verify(envelope)).reason).toBe('publisher-signature-invalid');
  });

  it('refuses a publisher signature of the wrong length', async () => {
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, sig: toBase64(Uint8Array.of(1, 2, 3)) },
    };
    expect((await verify(envelope)).reason).toBe('publisher-signature-invalid');
  });

  it('refuses a publisher signature that is not valid base64', async () => {
    const envelope = {
      ...base.envelope,
      publisherSig: { ...base.envelope.publisherSig, sig: '!!not base64!!' },
    };
    expect((await verify(envelope)).reason).toBe('publisher-signature-invalid');
  });

  it('refuses when the countersignature is missing (not yet approved)', async () => {
    const withoutCountersig: SignatureEnvelope = {
      formatVersion: base.envelope.formatVersion,
      subject: base.envelope.subject,
      publisherSig: base.envelope.publisherSig,
      logInclusion: base.envelope.logInclusion,
    };
    expect((await verify(withoutCountersig)).reason).toBe('registry-signature-missing');
  });

  it('refuses a registry signature algorithm other than ES256', async () => {
    const registrySig = { ...base.envelope.registrySig!, alg: 'RS256' as 'ES256' };
    expect((await verify({ ...base.envelope, registrySig })).reason).toBe('unsupported-signature-alg');
  });

  it('refuses a registry certificate that is not decodable DER', async () => {
    const registrySig = { ...base.envelope.registrySig!, cert: toBase64(Uint8Array.of(0x30, 0x01, 0x00)) };
    expect((await verify({ ...base.envelope, registrySig })).reason).toBe('registry-cert-malformed');
  });

  it('refuses a registry certificate whose key is not ECDSA P-256', async () => {
    const edLeaf = await generateEd25519KeyPair();
    const cert = await buildCert({
      issuerKey: base.registryRootKey.privateKey,
      subjectSpki: await exportSpki(edLeaf.publicKey),
      includeExtensions: false,
    });
    const registrySig = { ...base.envelope.registrySig!, cert: toBase64(cert) };
    expect((await verify({ ...base.envelope, registrySig })).reason).toBe('registry-cert-malformed');
  });

  it('refuses a registry certificate no countersign root issued', async () => {
    const trust = { ...base.trust, countersignRoots: [] };
    expect((await verify(base.envelope, base.releaseBytes, trust)).reason).toBe('registry-cert-untrusted');
  });

  it('refuses a tampered countersignature', async () => {
    const registrySig = { ...base.envelope.registrySig!, sig: toBase64(tamper(base.publisherSig)) };
    expect((await verify({ ...base.envelope, registrySig })).reason).toBe('registry-signature-invalid');
  });

  it('refuses a countersignature of the wrong length', async () => {
    const registrySig = { ...base.envelope.registrySig!, sig: toBase64(Uint8Array.of(1, 2, 3)) };
    expect((await verify({ ...base.envelope, registrySig })).reason).toBe('registry-signature-invalid');
  });
});
