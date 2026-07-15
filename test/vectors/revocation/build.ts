/**
 * Test-only fixture builder for signed-revocation-feed vectors. Composes the
 * signature-vector build harness (real ECDSA P-256 keys, DER X.509 leaf certs,
 * WebCrypto signatures) to mint a genuine registry-countersigned feed, so
 * `verifyRevocationFeed` is exercised against real cryptographic material rather
 * than hand-waved blobs.
 *
 * Like `../signature/build.ts`, this lives under `test/` (outside the coverage
 * `include`) and exercises the sign side the pure verify lib deliberately omits.
 */

import { canonicalize } from '../../../src/canon/index.js';
import type { RevocationFeed, SignedRevocationFeed } from '../../../src/types/wire/revocation.js';
import type { RevocationTrustInputs } from '../../../src/verify/revocation/index.js';
import {
  buildCert,
  exportSpki,
  generateKeyPair,
  signP1363,
  toBase64,
  type KeyPair,
} from '../signature/build.js';

/** A fully-populated valid scenario plus the raw material to derive negatives. */
export interface FeedScenario {
  readonly signed: SignedRevocationFeed;
  readonly trust: RevocationTrustInputs;
  readonly feed: RevocationFeed;
  /** Root that issued the countersign leaf (its public key is the pinned root). */
  readonly countersignRootKey: KeyPair;
  /** The leaf that signed `canonicalize(feed)`. */
  readonly countersignLeafKey: KeyPair;
}

export const REGISTRY_ID = 'registry.gridmason.dev';

/**
 * Build a signed feed scenario every test works from. `feedOverride` replaces the
 * default (non-empty) feed *before* signing, so the returned signature always
 * covers the exact feed on the wire (e.g. pass `{ entries: [] }` for a genuinely
 * signed empty feed).
 */
export async function buildFeedScenario(feedOverride?: Partial<RevocationFeed>): Promise<FeedScenario> {
  const countersignRootKey = await generateKeyPair();
  const countersignLeafKey = await generateKeyPair();

  const feed: RevocationFeed = {
    formatVersion: '1.0',
    registryId: REGISTRY_ID,
    seq: 3,
    issuedAt: 1720000000000,
    ttlSeconds: 3600,
    entries: [
      {
        artifact: 'acme-clock@1.2.0',
        state: 'killed',
        severity: 'critical',
        reason: 'actively exploited credential path',
      },
    ],
    ...feedOverride,
  };

  // The countersign cert carries no OIDC identity (like the release
  // countersignature): it is trusted purely by pinned-root issuance.
  const cert = await buildCert({
    issuerKey: countersignRootKey.privateKey,
    subjectSpki: await exportSpki(countersignLeafKey.publicKey),
    includeExtensions: false,
  });
  const sig = await signP1363(countersignLeafKey.privateKey, canonicalize(feed));

  const signed: SignedRevocationFeed = {
    feed,
    signature: { alg: 'ES256', cert: toBase64(cert), sig: toBase64(sig) },
  };
  const trust: RevocationTrustInputs = {
    countersignRoots: [await exportSpki(countersignRootKey.publicKey)],
  };

  return { signed, trust, feed, countersignRootKey, countersignLeafKey };
}
