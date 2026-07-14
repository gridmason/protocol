/**
 * Test-only fixture builder for `verifyRelease` vectors (docs/SPEC.md §5; FR-14).
 * Assembles a complete, genuinely-cryptographic happy-path input by composing the
 * leaf fixtures: real ECDSA key pairs + DER certificates + signatures from the
 * signature-envelope builder, the recorded Rekor-shaped log entry + pinned
 * checkpoint key, and a trust-root document + operator pins. Every negative vector
 * in `release.test.ts` mutates one field of this base.
 *
 * Lives under `test/` (outside the coverage `include`); it is the production /
 * signing side the pure verify lib deliberately omits (SPEC §5).
 */

import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

import { canonicalize } from '../../../src/canon/index.js';
import { hashBytes } from '../../../src/verify/hash/index.js';
import type { LogPublicKey } from '../../../src/verify/log/index.js';
import type { TrustRootPin } from '../../../src/verify/trust/index.js';
import type { ReleaseDoc, VerifyReleaseInput } from '../../../src/verify/release/index.js';
import type { SignatureEnvelope, TransparencyLogEntry } from '../../../src/types/wire/index.js';
import {
  ISSUER,
  EMAIL,
  buildCert,
  exportSpki,
  generateKeyPair,
  signP1363,
  toBase64,
  type KeyPair,
} from '../signature/build.js';

export { ISSUER, EMAIL } from '../signature/build.js';

/** The registry the whole scenario is anchored to. */
export const REGISTRY = 'registry.gridmason.dev';
/** `2024-01-01T00:00:00Z` — start of the trust-root validity window (epoch ms). */
export const NOT_BEFORE = 1_704_067_200_000;
/** `2025-01-01T00:00:00Z` — end of the trust-root validity window (epoch ms). */
export const NOT_AFTER = 1_735_689_600_000;
/** A clock comfortably inside `[NOT_BEFORE, NOT_AFTER]` (`2024-07-01`). */
export const WITHIN = 1_719_792_000_000;

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../log/${name}`, import.meta.url)), 'utf8')) as T;

/** A fully-populated valid scenario plus the raw material to derive negatives. */
export interface ReleaseScenario {
  /** The complete, valid `verifyRelease` input (non-rotation trust root). */
  readonly input: VerifyReleaseInput;
  /** A rotation-overlap trust-root document (two roots) with a valid `crossSig`. */
  readonly overlapTrustRoot: Record<string, unknown>;
  /** The same overlap document with its `crossSig` field omitted. */
  readonly overlapTrustRootNoCrossSig: Record<string, unknown>;
  /** Pins that authorize the overlap document (pinned to the outgoing root). */
  readonly overlapPins: readonly TrustRootPin[];
  /** The registry countersign root key pair (the rotation cross-signer). */
  readonly registryRootKey: KeyPair;
  /** The recorded tampered-proof log entry (for the log-inclusion-invalid case). */
  readonly tamperedLogEntry: TransparencyLogEntry;
}

/** Build the canonical happy-path `verifyRelease` scenario. */
export async function buildReleaseScenario(): Promise<ReleaseScenario> {
  const publisherRootKey = await generateKeyPair();
  const registryRootKey = await generateKeyPair();
  const leafKey = await generateKeyPair();
  const registryLeafKey = await generateKeyPair();

  // --- release document + dual-signature envelope over its canonical bytes ---
  const release: ReleaseDoc = {
    formatVersion: '1.0',
    artifact: 'acme-chart@2.3.1',
    files: {
      'index.js': await hashBytes(new TextEncoder().encode('export const entry = 1;')),
      'chunk-1.js': await hashBytes(new TextEncoder().encode('export const chunk = 2;')),
    },
  };
  const releaseBytes = canonicalize(release);
  const subject = { artifact: release.artifact, releaseHash: await hashBytes(releaseBytes) };
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

  // --- transparency-log entry + pinned key from the recorded fixtures ---
  const logEntry = load<TransparencyLogEntry>('inclusion-valid.json');
  const tamperedLogEntry = load<TransparencyLogEntry>('inclusion-tampered-proof.json');
  const pinnedFixture = load<{ name: string; publicKeyHex: string }>('pinned-key.json');
  const logPublicKey: LogPublicKey = {
    name: pinnedFixture.name,
    key: new Uint8Array(Buffer.from(pinnedFixture.publicKeyHex, 'hex')),
  };

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
    registrySig: { alg: 'ES256', cert: toBase64(registryCert), sig: toBase64(registrySig) },
    logInclusion: { logId: logEntry.logId, index: logEntry.index, proof: [] },
  };

  const publisherCARoots = [await exportSpki(publisherRootKey.publicKey)];
  const countersignRoots = [await exportSpki(registryRootKey.publicKey)];

  const trustRoot: Record<string, unknown> = {
    formatVersion: '1.0',
    registryId: REGISTRY,
    countersignRoots: ['root-2024'],
    issuerAllowlist: [ISSUER],
    logPublicKeys: ['ed25519:log-key'],
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
  };
  const pins: readonly TrustRootPin[] = [{ registryId: REGISTRY, root: 'root-2024', channel: 'build-time' }];

  // --- rotation-overlap trust root, cross-signed by the outgoing (registry) root ---
  const overlapTrustRootNoCrossSig: Record<string, unknown> = {
    formatVersion: '1.0',
    registryId: REGISTRY,
    countersignRoots: ['root-2024', 'root-2025'],
    issuerAllowlist: [ISSUER],
    logPublicKeys: ['ed25519:log-key'],
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
  };
  const crossSig = toBase64(await signP1363(registryRootKey.privateKey, canonicalize(overlapTrustRootNoCrossSig)));
  const overlapTrustRoot: Record<string, unknown> = { ...overlapTrustRootNoCrossSig, crossSig };

  const input: VerifyReleaseInput = {
    release,
    envelope,
    trustRoot,
    pins,
    publisherCARoots,
    countersignRoots,
    logEntry,
    logPublicKey,
    now: WITHIN,
  };

  return {
    input,
    overlapTrustRoot,
    overlapTrustRootNoCrossSig,
    overlapPins: pins,
    registryRootKey,
    tamperedLogEntry,
  };
}
