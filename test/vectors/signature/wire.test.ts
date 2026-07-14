import { beforeAll, describe, expect, it } from 'vitest';

import { verifySignatureEnvelope } from '../../../src/verify/signature/index.js';
import type {
  SignatureTrustInputs,
  SignatureVerdictReason,
} from '../../../src/verify/signature/index.js';
import type { SignatureEnvelope } from '../../../src/types/wire/signature.js';
import { buildScenario, toBase64, type Scenario } from './build.js';

// FR-9 / SPEC §4.2, §7 — the signature-envelope WIRE vectors, exercised as a
// downstream consumer would: build a real dual-signed envelope over genuine
// ECDSA-P256 material, then run the canonical positive and the negative variants
// through the pure verifier and pin each stable reason.
//
// Unlike the content-hash KATs (`../hash/sha256-kat.json`), these are generated
// per run rather than frozen: ECDSA signing is randomized, so a committed byte
// blob could not be reproduced, and freshly-minted genuine certificates exercise
// the real parse + WebCrypto path every time. The cross-repo conformance corpus
// (shared `src/vectors`) gains its signature negatives in P-E4.

interface WireVector {
  readonly name: string;
  readonly reason: SignatureVerdictReason;
  /** Produce the envelope + trust for this case from the base scenario. */
  readonly build: (base: Scenario) => { envelope: SignatureEnvelope; releaseBytes: Uint8Array; trust: SignatureTrustInputs };
}

function tamper(bytes: Uint8Array): Uint8Array {
  const copy = Uint8Array.from(bytes);
  copy[0] = (copy[0] ?? 0) ^ 0xff;
  return copy;
}

const identity = (base: Scenario) => ({
  envelope: base.envelope,
  releaseBytes: base.releaseBytes,
  trust: base.trust,
});

const vectors: readonly WireVector[] = [
  { name: 'valid dual-signed envelope', reason: 'ok', build: identity },
  {
    name: 'release bytes do not match the signed subject hash',
    reason: 'subject-hash-mismatch',
    build: (base) => ({ ...identity(base), releaseBytes: tamper(base.releaseBytes) }),
  },
  {
    name: 'envelope issuer disagrees with the certificate',
    reason: 'publisher-issuer-mismatch',
    build: (base) => ({
      ...identity(base),
      envelope: {
        ...base.envelope,
        publisherSig: { ...base.envelope.publisherSig, issuer: 'https://evil.example' },
      },
    }),
  },
  {
    name: 'attested issuer is not on the registry allowlist',
    reason: 'publisher-issuer-not-allowlisted',
    build: (base) => ({ ...identity(base), trust: { ...base.trust, issuerAllowlist: [] } }),
  },
  {
    name: 'publisher signature is tampered',
    reason: 'publisher-signature-invalid',
    build: (base) => ({
      ...identity(base),
      envelope: {
        ...base.envelope,
        publisherSig: { ...base.envelope.publisherSig, sig: toBase64(tamper(base.publisherSig)) },
      },
    }),
  },
  {
    name: 'countersignature is missing (not yet approved)',
    reason: 'registry-signature-missing',
    build: (base) => ({
      ...identity(base),
      envelope: {
        formatVersion: base.envelope.formatVersion,
        subject: base.envelope.subject,
        publisherSig: base.envelope.publisherSig,
        logInclusion: base.envelope.logInclusion,
      },
    }),
  },
  {
    name: 'countersignature is tampered',
    reason: 'registry-signature-invalid',
    build: (base) => ({
      ...identity(base),
      envelope: {
        ...base.envelope,
        registrySig: { ...base.envelope.registrySig!, sig: toBase64(tamper(base.publisherSig)) },
      },
    }),
  },
];

describe('signature-envelope wire vectors', () => {
  let base: Scenario;
  beforeAll(async () => {
    base = await buildScenario();
  });

  it('covers a valid case plus the headline negatives with distinct reasons', () => {
    const reasons = new Set(vectors.map((v) => v.reason));
    expect(reasons.has('ok')).toBe(true);
    // The acceptance-criteria trio: a missing countersignature and a wrong issuer
    // must be distinct, both distinct from a valid subject/hash.
    expect(reasons.has('registry-signature-missing')).toBe(true);
    expect(reasons.has('publisher-issuer-mismatch')).toBe(true);
    expect(reasons.size).toBe(vectors.length);
  });

  it.each(vectors.map((v) => [v.name, v] as const))(
    'the verifier returns the pinned reason for: %s',
    async (_name, vector) => {
      const verdict = await verifySignatureEnvelope(vector.build(base));
      expect(verdict.reason).toBe(vector.reason);
      expect(verdict.ok).toBe(vector.reason === 'ok');
    },
  );
});
