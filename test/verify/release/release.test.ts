import { Buffer } from 'node:buffer';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  verifyRelease,
  verifyChunk,
  VERIFY_RELEASE_REASONS,
  type VerifyReleaseReason,
  type VerifyReleaseResult,
} from '../../../src/verify/index.js';
import { hashBytes } from '../../../src/verify/hash/index.js';
import type { ReleaseDoc } from '../../../src/verify/release/index.js';
import type { SignatureEnvelope } from '../../../src/types/wire/index.js';
import { buildReleaseScenario, ISSUER, NOT_AFTER, type ReleaseScenario } from '../../vectors/verify-release/build.js';

// End-to-end `verifyRelease` orchestration (docs/SPEC.md §5, §7; FR-14) against a
// genuinely-cryptographic composed vector: the full happy path returns the
// url→hash map, and every failure class maps to exactly one stable reason from the
// closed set (no-tag-echo). This is the security-core capstone held at the 100%
// GW-D20 gate.

let s: ReleaseScenario;
beforeAll(async () => {
  s = await buildReleaseScenario();
});

/** As-typed record view of the base (valid) trust-root document. */
const rawTrustRoot = (): Record<string, unknown> => s.input.trustRoot as Record<string, unknown>;

/** Flip the first byte of a base64 blob, keeping it valid 64-byte base64. */
const flipByte = (b64: string): string => {
  const bytes = Buffer.from(b64, 'base64');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return bytes.toString('base64');
};

const expectReason = (result: VerifyReleaseResult, reason: VerifyReleaseReason): void => {
  expect(result).toEqual({ ok: false, reason });
};

describe('verifyRelease — happy path', () => {
  it('verifies a fully-valid release and returns the url→hash map, issuer, and subject', async () => {
    const result = await verifyRelease(s.input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issuer).toBe(ISSUER);
    expect(result.subject.artifact).toBe('acme-chart@2.3.1');
    expect(result.urlHashes.get('index.js')).toBe(s.input.release.files['index.js']);
    expect(result.urlHashes.get('chunk-1.js')).toBe(s.input.release.files['chunk-1.js']);
    expect(result.urlHashes.size).toBe(2);
  });

  it('accepts a rotation-overlap trust root cross-signed by the outgoing root', async () => {
    const result = await verifyRelease({ ...s.input, trustRoot: s.overlapTrustRoot, pins: s.overlapPins });
    expect(result.ok).toBe(true);
  });
});

describe('verifyRelease — trust root', () => {
  it('refuses a non-object trust-root document', async () => {
    expectReason(await verifyRelease({ ...s.input, trustRoot: 42 }), 'trust-root-malformed');
  });

  it('refuses when no pin covers the document (registry mismatch)', async () => {
    expectReason(await verifyRelease({ ...s.input, pins: [] }), 'trust-root-untrusted');
  });

  it('refuses a document outside its validity window', async () => {
    expectReason(await verifyRelease({ ...s.input, now: NOT_AFTER + 1 }), 'trust-root-expired');
  });

  it('refuses a rotation-overlap document with no crossSig', async () => {
    const result = await verifyRelease({
      ...s.input,
      trustRoot: s.overlapTrustRootNoCrossSig,
      pins: s.overlapPins,
    });
    expectReason(result, 'trust-root-rotation-invalid');
  });

  it('refuses a rotation-overlap document whose crossSig does not verify', async () => {
    const trustRoot = { ...s.overlapTrustRoot, crossSig: flipByte(s.overlapTrustRoot.crossSig as string) };
    expectReason(await verifyRelease({ ...s.input, trustRoot, pins: s.overlapPins }), 'trust-root-rotation-invalid');
  });

  it('refuses a rotation crossSig that is not valid base64', async () => {
    const trustRoot = { ...s.overlapTrustRoot, crossSig: 'not*base64!' };
    expectReason(await verifyRelease({ ...s.input, trustRoot, pins: s.overlapPins }), 'trust-root-rotation-invalid');
  });

  it('refuses a rotation crossSig of the wrong length', async () => {
    const trustRoot = { ...s.overlapTrustRoot, crossSig: Buffer.from([1, 2, 3]).toString('base64') };
    expectReason(await verifyRelease({ ...s.input, trustRoot, pins: s.overlapPins }), 'trust-root-rotation-invalid');
  });

  it('refuses when the crossSig preimage cannot be canonicalized', async () => {
    const trustRoot = { ...s.overlapTrustRoot, junk: Number.NaN };
    expectReason(await verifyRelease({ ...s.input, trustRoot, pins: s.overlapPins }), 'trust-root-rotation-invalid');
  });

  it('refuses when no pinned root key can import to verify the crossSig', async () => {
    const result = await verifyRelease({
      ...s.input,
      trustRoot: s.overlapTrustRoot,
      pins: s.overlapPins,
      countersignRoots: [new Uint8Array([1, 2, 3])],
    });
    expectReason(result, 'trust-root-rotation-invalid');
  });
});

describe('verifyRelease — release integrity, authorship, approval', () => {
  it('refuses a release document that cannot be canonicalized', async () => {
    const release = { ...s.input.release, files: { bad: Number.NaN } } as unknown as ReleaseDoc;
    expectReason(await verifyRelease({ ...s.input, release }), 'release-malformed');
  });

  it('refuses when the release bytes do not hash to the signed subject', async () => {
    const release: ReleaseDoc = { ...s.input.release, artifact: 'tampered@9.9.9' };
    expectReason(await verifyRelease({ ...s.input, release }), 'content-hash-mismatch');
  });

  it('refuses an unsupported envelope format major', async () => {
    const envelope: SignatureEnvelope = { ...s.input.envelope, formatVersion: '2.0' };
    expectReason(await verifyRelease({ ...s.input, envelope }), 'unsupported-format');
  });

  it('refuses an invalid publisher signature', async () => {
    const envelope: SignatureEnvelope = {
      ...s.input.envelope,
      publisherSig: { ...s.input.envelope.publisherSig, sig: flipByte(s.input.envelope.publisherSig.sig) },
    };
    expectReason(await verifyRelease({ ...s.input, envelope }), 'publisher-signature-invalid');
  });

  it('refuses a publisher cert not issued by any pinned CA root', async () => {
    expectReason(await verifyRelease({ ...s.input, publisherCARoots: [] }), 'publisher-untrusted');
  });

  it('refuses when the envelope issuer does not match the certificate', async () => {
    const envelope: SignatureEnvelope = {
      ...s.input.envelope,
      publisherSig: { ...s.input.envelope.publisherSig, issuer: 'https://evil.example' },
    };
    expectReason(await verifyRelease({ ...s.input, envelope }), 'publisher-identity-invalid');
  });

  it('refuses an issuer that is not on the trust-root allowlist', async () => {
    const trustRoot = { ...rawTrustRoot(), issuerAllowlist: ['https://other.example'] };
    expectReason(await verifyRelease({ ...s.input, trustRoot }), 'issuer-not-allowlisted');
  });

  it('refuses a release that is not yet registry-approved (no countersignature)', async () => {
    const envelope: SignatureEnvelope = {
      formatVersion: s.input.envelope.formatVersion,
      subject: s.input.envelope.subject,
      publisherSig: s.input.envelope.publisherSig,
      logInclusion: s.input.envelope.logInclusion,
    };
    expectReason(await verifyRelease({ ...s.input, envelope }), 'registry-countersignature-missing');
  });

  it('refuses an invalid registry countersignature', async () => {
    const envelope: SignatureEnvelope = {
      ...s.input.envelope,
      registrySig: { ...s.input.envelope.registrySig!, sig: flipByte(s.input.envelope.registrySig!.sig) },
    };
    expectReason(await verifyRelease({ ...s.input, envelope }), 'registry-countersignature-invalid');
  });
});

describe('verifyRelease — transparency log', () => {
  it('refuses when the envelope names a different log entry', async () => {
    const envelope: SignatureEnvelope = {
      ...s.input.envelope,
      logInclusion: { ...s.input.envelope.logInclusion, index: 999 },
    };
    expectReason(await verifyRelease({ ...s.input, envelope }), 'log-inclusion-mismatch');
  });

  it('refuses a tampered inclusion proof', async () => {
    expectReason(await verifyRelease({ ...s.input, logEntry: s.tamperedLogEntry }), 'log-inclusion-invalid');
  });
});

describe('verifyChunk', () => {
  it('returns true for bytes that hash to the expected hash', async () => {
    const bytes = new TextEncoder().encode('service-worker chunk');
    expect(await verifyChunk(bytes, await hashBytes(bytes))).toBe(true);
  });

  it('returns false for bytes that do not', async () => {
    const bytes = new TextEncoder().encode('service-worker chunk');
    const other = await hashBytes(new TextEncoder().encode('different'));
    expect(await verifyChunk(bytes, other)).toBe(false);
  });

  it('returns false for a malformed expected-hash string', async () => {
    expect(await verifyChunk(new TextEncoder().encode('x'), 'not-a-hash')).toBe(false);
  });
});

describe('no-tag-echo rule (SPEC §7)', () => {
  it('never echoes an input-derived identifier and always returns a reason from the closed set', async () => {
    const secretArtifact = 'SECRET-GATED-WIDGET@6.6.6';
    const secretIssuer = 'https://secret-idp.internal/oauth';
    const secretEmail = 'leaker@classified.example';

    // A refusal for each of several inputs that embed a would-be-leaked identity.
    const results: VerifyReleaseResult[] = [
      // release identity carried in a tampered (hash-mismatching) document
      await verifyRelease({ ...s.input, release: { ...s.input.release, artifact: secretArtifact } }),
      // a publisher identity that fails to bind
      await verifyRelease({
        ...s.input,
        envelope: {
          ...s.input.envelope,
          publisherSig: {
            ...s.input.envelope.publisherSig,
            issuer: secretIssuer,
            subjectClaims: { email: secretEmail },
          },
        },
      }),
      // an issuer gated off by the allowlist
      await verifyRelease({
        ...s.input,
        trustRoot: { ...rawTrustRoot(), issuerAllowlist: ['https://only-this.example'] },
      }),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(VERIFY_RELEASE_REASONS).toContain(result.reason);
      for (const identifier of [secretArtifact, secretIssuer, secretEmail, 'SECRET', 'secret', 'classified']) {
        expect(result.reason).not.toContain(identifier);
      }
    }
  });

  it('exposes the closed reason set as a frozen array', () => {
    expect(Object.isFrozen(VERIFY_RELEASE_REASONS)).toBe(true);
    expect(new Set(VERIFY_RELEASE_REASONS).size).toBe(VERIFY_RELEASE_REASONS.length);
  });
});
