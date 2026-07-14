import { Buffer } from 'node:buffer';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  verifyOfflineBundle,
  VERIFY_BUNDLE_REASONS,
  type VerifyBundleInput,
  type VerifyBundleReason,
  type VerifyBundleResult,
} from '../../../src/verify/bundle/index.js';
import { VERIFY_RELEASE_REASONS } from '../../../src/verify/release/index.js';
import type { GmbBundle, GmbPayload } from '../../../src/types/wire/index.js';
import type { MultihashString } from '../../../src/verify/hash/index.js';
import { ISSUER } from '../../vectors/verify-release/build.js';
import { buildBundleScenario, bundleContentHash, type BundleScenario } from '../../vectors/gmb/build.js';

// Offline `.gmb` verification (docs/SPEC.md §4.5, §7; FR-13) against a
// genuinely-cryptographic composed bundle: the full happy path verifies with the
// network entirely absent, the archive seal catches tampering, and the online
// chain (sourced from the bundle) still refuses an unpinned embedded root or a
// broken proof with the SAME stable reasons. Security-core capstone at the 100%
// GW-D20 gate.

let s: BundleScenario;
beforeAll(async () => {
  s = await buildBundleScenario();
});

/** The valid base bundle. */
const bundle = (): GmbBundle => s.input.bundle;

/** Flip the first byte of a base64 blob, keeping it valid base64. */
const flipB64 = (b64: string): string => {
  const bytes = Buffer.from(b64, 'base64');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return bytes.toString('base64');
};

/** Rebuild an input with a mutated payload, optionally resealing the content hash. */
const withPayload = async (
  payload: GmbPayload,
  { reseal }: { reseal: boolean },
): Promise<VerifyBundleInput> => ({
  ...s.input,
  bundle: {
    ...bundle(),
    payload,
    contentHash: reseal ? await bundleContentHash(payload) : bundle().contentHash,
  },
});

const expectReason = (result: VerifyBundleResult, reason: VerifyBundleReason): void => {
  expect(result).toEqual({ ok: false, reason });
};

describe('verifyOfflineBundle — happy path (no network)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('verifies a fully-valid bundle with fetch stubbed to throw, returning the url→hash map', async () => {
    // Prove "no fetch of any kind": any network call would throw and fail the test.
    const fetchSpy = vi.fn(() => {
      throw new Error('offline verification must not touch the network');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await verifyOfflineBundle(s.input);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issuer).toBe(ISSUER);
    expect(result.subject.artifact).toBe('acme-chart@2.3.1');
    expect(result.urlHashes.get('index.js')).toBe(s.release.input.release.files['index.js']);
    expect(result.urlHashes.get('chunk-1.js')).toBe(s.release.input.release.files['chunk-1.js']);
    expect(result.urlHashes.size).toBe(2);
  });
});

describe('verifyOfflineBundle — archive integrity', () => {
  it('refuses a bundle whose content hash is a malformed string', async () => {
    const input = { ...s.input, bundle: { ...bundle(), contentHash: 'not-a-hash' as MultihashString } };
    expectReason(await verifyOfflineBundle(input), 'bundle-malformed');
  });

  it('refuses a bundle whose content hash tags an unimplemented algorithm', async () => {
    const contentHash = `sha3-256:${'0'.repeat(64)}` as MultihashString;
    const input = { ...s.input, bundle: { ...bundle(), contentHash } };
    expectReason(await verifyOfflineBundle(input), 'bundle-malformed');
  });

  it('refuses a payload that cannot be canonicalized', async () => {
    const payload: GmbPayload = {
      ...bundle().payload,
      logEntry: { ...bundle().payload.logEntry, integratedTime: Number.NaN },
    };
    expectReason(await verifyOfflineBundle(await withPayload(payload, { reseal: false })), 'bundle-malformed');
  });

  it('rejects a tampered packed byte against the stale content hash', async () => {
    const payload: GmbPayload = {
      ...bundle().payload,
      entry: { ...bundle().payload.entry, bytes: flipB64(bundle().payload.entry.bytes) },
    };
    expectReason(await verifyOfflineBundle(await withPayload(payload, { reseal: false })), 'bundle-hash-tampered');
  });
});

describe('verifyOfflineBundle — the online chain, sourced from the bundle', () => {
  it('refuses a bundle whose embedded trust root is not pinned (same enum as online)', async () => {
    expectReason(await verifyOfflineBundle({ ...s.input, pins: [] }), 'trust-root-untrusted');
  });

  it('rejects a mutated embedded inclusion proof even when the content hash is resealed', async () => {
    // Defence in depth: a producer who honestly reseals over a tampered proof is
    // still caught by the signed chain, not the archive seal.
    const payload: GmbPayload = { ...bundle().payload, logEntry: s.release.tamperedLogEntry };
    expectReason(await verifyOfflineBundle(await withPayload(payload, { reseal: true })), 'log-inclusion-invalid');
  });

  it('refuses a bundle whose release does not hash to the signed subject', async () => {
    const payload: GmbPayload = {
      ...bundle().payload,
      release: { ...bundle().payload.release, artifact: 'tampered@9.9.9' },
    };
    expectReason(await verifyOfflineBundle(await withPayload(payload, { reseal: true })), 'content-hash-mismatch');
  });
});

describe('verifyOfflineBundle — no-tag-echo rule (SPEC §7)', () => {
  it('reuses the full release reason set plus the two bundle-only classes, frozen', () => {
    expect(Object.isFrozen(VERIFY_BUNDLE_REASONS)).toBe(true);
    expect(new Set(VERIFY_BUNDLE_REASONS).size).toBe(VERIFY_BUNDLE_REASONS.length);
    for (const reason of VERIFY_RELEASE_REASONS) expect(VERIFY_BUNDLE_REASONS).toContain(reason);
    expect(VERIFY_BUNDLE_REASONS).toContain('bundle-malformed');
    expect(VERIFY_BUNDLE_REASONS).toContain('bundle-hash-tampered');
    expect(VERIFY_BUNDLE_REASONS.length).toBe(VERIFY_RELEASE_REASONS.length + 2);
  });

  it('never echoes an input-derived identifier and always returns a reason from the closed set', async () => {
    const secretArtifact = 'SECRET-GATED-WIDGET@6.6.6';
    const secretIssuer = 'https://secret-idp.internal/oauth';

    const results: VerifyBundleResult[] = [
      // A tampered release carrying a would-be-leaked artifact id.
      await verifyOfflineBundle(
        await withPayload(
          { ...bundle().payload, release: { ...bundle().payload.release, artifact: secretArtifact } },
          { reseal: true },
        ),
      ),
      // A publisher identity that fails to bind, carrying a secret issuer.
      await verifyOfflineBundle(
        await withPayload(
          {
            ...bundle().payload,
            envelope: {
              ...bundle().payload.envelope,
              publisherSig: { ...bundle().payload.envelope.publisherSig, issuer: secretIssuer },
            },
          },
          { reseal: true },
        ),
      ),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(VERIFY_BUNDLE_REASONS).toContain(result.reason);
      for (const identifier of [secretArtifact, secretIssuer, 'SECRET', 'secret']) {
        expect(result.reason).not.toContain(identifier);
      }
    }
  });
});
