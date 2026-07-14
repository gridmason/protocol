/**
 * Trust-root evaluation vectors (docs/SPEC.md §4.4, §5) — self-describing
 * scenarios any conforming `evaluateTrustRoot` must reproduce: a parsed
 * {@link TrustRootDoc} + the operator's out-of-band pins + `now`, and the exact
 * verdict expected. Grouped by the four cases the acceptance criteria call out:
 * pinned-valid, overlap (rotation), unpinned (refused), and expired.
 *
 * These are typed against the shipped contract, so a change to `TrustRootDoc` /
 * `TrustRootVerdict` / `TrustRootPin` that breaks a scenario fails to compile.
 * Consumed by `test/vectors/trust/trust.test.ts`; the exhaustive branch/edge
 * coverage lives in `test/verify/trust/trust.test.ts`.
 */

import type { TrustRootDoc } from '../../../src/types/wire/trust-root.js';
import type { TrustRootPin, TrustRootVerdict } from '../../../src/verify/trust/index.js';

/** One trust-root scenario: inputs to `evaluateTrustRoot` and the verdict it must return. */
export interface TrustRootVector {
  /** Which acceptance case this exercises. */
  readonly group: 'pinned-valid' | 'overlap' | 'unpinned' | 'expired';
  /** Human-readable scenario name. */
  readonly name: string;
  /** The already-parsed, already-signature-verified trust-root document. */
  readonly doc: TrustRootDoc;
  /** The operator's out-of-band pins. */
  readonly pins: readonly TrustRootPin[];
  /** Caller-supplied clock, epoch milliseconds. */
  readonly now: number;
  /** The exact verdict `evaluateTrustRoot(doc, pins, now)` must produce. */
  readonly expected: TrustRootVerdict;
}

const REGISTRY = 'registry.gridmason.dev';
/** `2024-01-01T00:00:00Z` — start of every scenario's validity window. */
const NOT_BEFORE = 1_704_067_200_000;
/** `2025-01-01T00:00:00Z` — end of every scenario's validity window. */
const NOT_AFTER = 1_735_689_600_000;
/** A clock comfortably inside `[NOT_BEFORE, NOT_AFTER]`. */
const WITHIN = 1_719_792_000_000; // 2024-07-01T00:00:00Z

export const trustRootVectors: readonly TrustRootVector[] = [
  {
    group: 'pinned-valid',
    name: 'single pinned root, within validity window — trusted',
    doc: {
      formatVersion: '1.0',
      registryId: REGISTRY,
      countersignRoots: ['root-2024'],
      issuerAllowlist: ['https://accounts.google.com'],
      logPublicKeys: ['ed25519:log-key'],
      notBefore: NOT_BEFORE,
      notAfter: NOT_AFTER,
    },
    pins: [{ registryId: REGISTRY, root: 'root-2024', channel: 'build-time' }],
    now: WITHIN,
    expected: {
      code: 'trusted',
      ok: true,
      registryId: REGISTRY,
      matchedRoot: 'root-2024',
      matchedChannel: 'build-time',
      overlap: false,
      crossSig: undefined,
    },
  },
  {
    group: 'overlap',
    name: 'rotation overlap, host pinned to the outgoing root — trusted, overlap flagged',
    doc: {
      formatVersion: '1.0',
      registryId: REGISTRY,
      countersignRoots: ['root-2024', 'root-2025'],
      issuerAllowlist: ['https://accounts.google.com'],
      logPublicKeys: ['ed25519:log-key'],
      notBefore: NOT_BEFORE,
      notAfter: NOT_AFTER,
      crossSig: 'sig-of-root-2024-over-this-doc',
    },
    pins: [{ registryId: REGISTRY, root: 'root-2024', channel: 'deploy-time' }],
    now: WITHIN,
    expected: {
      code: 'trusted',
      ok: true,
      registryId: REGISTRY,
      matchedRoot: 'root-2024',
      matchedChannel: 'deploy-time',
      overlap: true,
      crossSig: 'sig-of-root-2024-over-this-doc',
    },
  },
  {
    group: 'overlap',
    name: 'rotation overlap, host re-pinned to the incoming root — also trusted',
    doc: {
      formatVersion: '1.0',
      registryId: REGISTRY,
      countersignRoots: ['root-2024', 'root-2025'],
      issuerAllowlist: ['https://accounts.google.com'],
      logPublicKeys: ['ed25519:log-key'],
      notBefore: NOT_BEFORE,
      notAfter: NOT_AFTER,
      crossSig: 'sig-of-root-2024-over-this-doc',
    },
    pins: [{ registryId: REGISTRY, root: 'root-2025', channel: 'build-time' }],
    now: WITHIN,
    expected: {
      code: 'trusted',
      ok: true,
      registryId: REGISTRY,
      matchedRoot: 'root-2025',
      matchedChannel: 'build-time',
      overlap: true,
      crossSig: 'sig-of-root-2024-over-this-doc',
    },
  },
  {
    group: 'unpinned',
    name: 'overlap has closed and the outgoing root was dropped — host still pinned to it is refused',
    doc: {
      formatVersion: '1.0',
      registryId: REGISTRY,
      countersignRoots: ['root-2025'],
      issuerAllowlist: ['https://accounts.google.com'],
      logPublicKeys: ['ed25519:log-key'],
      notBefore: NOT_BEFORE,
      notAfter: NOT_AFTER,
    },
    pins: [{ registryId: REGISTRY, root: 'root-2024', channel: 'build-time' }],
    now: WITHIN,
    expected: {
      code: 'unpinned',
      ok: false,
      registryId: REGISTRY,
      matchedRoot: undefined,
      matchedChannel: undefined,
      overlap: false,
      crossSig: undefined,
    },
  },
  {
    group: 'expired',
    name: 'pinned root but the document is past notAfter — expired, matched root still named',
    doc: {
      formatVersion: '1.0',
      registryId: REGISTRY,
      countersignRoots: ['root-2024'],
      issuerAllowlist: ['https://accounts.google.com'],
      logPublicKeys: ['ed25519:log-key'],
      notBefore: NOT_BEFORE,
      notAfter: NOT_AFTER,
    },
    pins: [{ registryId: REGISTRY, root: 'root-2024', channel: 'build-time' }],
    now: NOT_AFTER + 1,
    expected: {
      code: 'expired',
      ok: false,
      registryId: REGISTRY,
      matchedRoot: 'root-2024',
      matchedChannel: 'build-time',
      overlap: false,
      crossSig: undefined,
    },
  },
];
