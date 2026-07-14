/**
 * Trust-root **evaluation** conformance vectors (docs/SPEC.md §4.4, §7; FR-15,
 * P-E4 — the `expired root` negative of the SPEC §7 set).
 *
 * Self-describing scenarios any conforming
 * {@link import('../verify/trust/trust.js').evaluateTrustRoot} must reproduce: a
 * parsed, already-signature-verified {@link TrustRootDoc}, the operator's
 * out-of-band pins, and `now`, paired with the exact verdict. Typed against the
 * shipped contract, so a change that breaks a scenario fails to compile. Grouped
 * by the four acceptance cases: pinned-valid, overlap (rotation), unpinned
 * (refused), and expired.
 *
 * The load-bearing negative is `expired root` (SPEC §7): a pinned root evaluated
 * past the document's `notAfter` is refused (`code: 'expired'`), the matched root
 * still named. A consumer whose runner "passes" it fails CI.
 *
 * The exhaustive branch/edge coverage of `evaluateTrustRoot` lives in
 * `test/verify/trust/trust.test.ts`; this is the shared, published corpus.
 */

import type { TrustRootDoc } from '../types/wire/trust-root.js';
import type { TrustRootVector } from './types.js';

const REGISTRY = 'registry.gridmason.dev';
/** `2024-01-01T00:00:00Z` — start of every scenario's validity window. */
const NOT_BEFORE = 1_704_067_200_000;
/** `2025-01-01T00:00:00Z` — end of every scenario's validity window. */
const NOT_AFTER = 1_735_689_600_000;
/** A clock comfortably inside `[NOT_BEFORE, NOT_AFTER]`. */
const WITHIN = 1_719_792_000_000; // 2024-07-01T00:00:00Z

const baseDoc: Omit<TrustRootDoc, 'countersignRoots'> = {
  formatVersion: '1.0',
  registryId: REGISTRY,
  issuerAllowlist: ['https://accounts.google.com'],
  logPublicKeys: ['ed25519:log-key'],
  notBefore: NOT_BEFORE,
  notAfter: NOT_AFTER,
};

/**
 * The trust-root corpus — pinned-valid + both rotation-overlap directions
 * (positive), unpinned + expired (negative, the SPEC §7 `expired root`).
 */
export const trustRootVectors: readonly TrustRootVector[] = [
  {
    group: 'pinned-valid',
    name: 'single pinned root, within validity window — trusted',
    doc: { ...baseDoc, countersignRoots: ['root-2024'] },
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
    doc: { ...baseDoc, countersignRoots: ['root-2024', 'root-2025'], crossSig: 'sig-of-root-2024-over-this-doc' },
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
    doc: { ...baseDoc, countersignRoots: ['root-2024', 'root-2025'], crossSig: 'sig-of-root-2024-over-this-doc' },
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
    doc: { ...baseDoc, countersignRoots: ['root-2025'] },
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
    doc: { ...baseDoc, countersignRoots: ['root-2024'] },
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
