/**
 * Test-only fixture builder for `.gmb` offline-bundle vectors (docs/SPEC.md §4.5;
 * FR-13). Wraps the genuinely-cryptographic `verifyRelease` scenario
 * (`../verify-release/build.ts`) into a self-contained bundle: the same real
 * ECDSA-signed envelope, recorded log entry + pinned checkpoint key, and
 * trust-root document + operator pins, plus a manifest and the packed servable
 * bytes — sealed by a bundle-level content hash over the canonical payload.
 *
 * The valid bundle verifies fully offline; every negative in `offline.test.ts`
 * mutates one field of this base. Lives under `test/` (outside the coverage
 * `include`); it is the production / packing side the pure verify lib omits.
 */

import { canonicalize } from '../../../src/canon/index.js';
import { hashBytes, type MultihashString } from '../../../src/verify/hash/index.js';
import type { VerifyBundleInput } from '../../../src/verify/bundle/index.js';
import type { GmbBundle, GmbPayload, TrustRootDoc } from '../../../src/types/wire/index.js';
import type { Manifest } from '../../../src/types/manifest/index.js';
import { buildReleaseScenario, REGISTRY, type ReleaseScenario } from '../verify-release/build.js';
import { toBase64 } from '../signature/build.js';

export { REGISTRY } from '../verify-release/build.js';

/** Base64 the UTF-8 bytes of `text`. */
const packText = (text: string): string => toBase64(new TextEncoder().encode(text));

/** The multihash seal a `.gmb` carries: the hash of its canonicalized payload. */
export async function bundleContentHash(payload: GmbPayload): Promise<MultihashString> {
  return hashBytes(canonicalize(payload));
}

/** A fully-populated valid bundle scenario plus the material to derive negatives. */
export interface BundleScenario {
  /** The complete, valid `verifyOfflineBundle` input. */
  readonly input: VerifyBundleInput;
  /** The underlying release scenario (source of the tampered log entry, etc.). */
  readonly release: ReleaseScenario;
}

/** Build the canonical happy-path offline-bundle scenario. */
export async function buildBundleScenario(): Promise<BundleScenario> {
  const release = await buildReleaseScenario();
  const { input } = release;

  const manifest: Manifest = {
    formatVersion: '1.0',
    tag: 'acme-chart',
    kind: 'widget',
    name: 'Acme Chart',
    publisher: 'acme',
    version: '2.3.1',
    entry: 'index.js',
  };

  const payload: GmbPayload = {
    manifest,
    release: input.release,
    envelope: input.envelope,
    logEntry: input.logEntry,
    // The base scenario's trust root is a well-formed non-rotation document.
    trustRoot: input.trustRoot as TrustRootDoc,
    entry: { path: 'index.js', bytes: packText('export const entry = 1;') },
    chunks: [{ path: 'chunk-1.js', bytes: packText('export const chunk = 2;') }],
    schemas: [],
    docs: [],
  };

  const bundle: GmbBundle = {
    formatVersion: '1.0',
    producedBy: REGISTRY,
    contentHash: await bundleContentHash(payload),
    payload,
  };

  const bundleInput: VerifyBundleInput = {
    bundle,
    pins: input.pins,
    publisherCARoots: input.publisherCARoots,
    countersignRoots: input.countersignRoots,
    logPublicKey: input.logPublicKey,
    now: input.now,
  };

  return { input: bundleInput, release };
}
