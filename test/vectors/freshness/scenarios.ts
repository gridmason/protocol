/**
 * Freshness evaluation vectors (docs/SPEC.md §4.3, §5) — self-describing
 * scenarios any conforming `evaluateFreshness` must reproduce: an
 * already-authenticated feed + the host's cursor + `now`, and the exact verdict
 * expected. Grouped by the four cases the acceptance criteria call out: fresh,
 * stale, multi-registry (scoping), and rollback.
 *
 * These are typed against the shipped contract, so a change to `RevocationFeed`
 * / `FreshnessVerdict` that breaks a scenario fails to compile. Consumed by
 * `test/vectors/freshness/freshness.test.ts`; the exhaustive branch/edge coverage
 * lives in `test/verify/freshness/freshness.test.ts`.
 */

import type { Cursor, RevocationFeed } from '../../../src/types/wire/revocation.js';
import type { FreshnessVerdict } from '../../../src/verify/freshness/index.js';

/** One freshness scenario: inputs to `evaluateFreshness` and the verdict it must return. */
export interface FreshnessVector {
  /** Which acceptance case this exercises. */
  readonly group: 'fresh' | 'stale' | 'multi-registry' | 'rollback';
  /** Human-readable scenario name. */
  readonly name: string;
  /** The already-authenticated feed under evaluation. */
  readonly feed: RevocationFeed;
  /** The host's cursor for the feed's registry. */
  readonly cursor: Cursor;
  /** Caller-supplied clock, epoch milliseconds. */
  readonly now: number;
  /** The exact verdict `evaluateFreshness(feed, cursor, now)` must produce. */
  readonly expected: FreshnessVerdict;
}

/** A fixed issue time so every scenario's TTL math is explicit. `2024-01-01T00:00:00Z`. */
const ISSUED_AT = 1_704_067_200_000;
/** One hour of TTL, in seconds. */
const ONE_HOUR_S = 3600;
/** `ISSUED_AT + ONE_HOUR_S`, the exact deadline in epoch ms. */
const DEADLINE = ISSUED_AT + ONE_HOUR_S * 1000;

export const freshnessVectors: readonly FreshnessVector[] = [
  {
    group: 'fresh',
    name: 'within TTL, empty feed — registry loads, nothing blocked',
    feed: {
      formatVersion: '1.0',
      registryId: 'registry.gridmason.dev',
      seq: 7,
      issuedAt: ISSUED_AT,
      ttlSeconds: ONE_HOUR_S,
      entries: [],
    },
    cursor: { registryId: 'registry.gridmason.dev', seq: 6 },
    now: ISSUED_AT + 60_000,
    expected: {
      code: 'fresh',
      ok: true,
      registryId: 'registry.gridmason.dev',
      blocked: [],
      nextSeq: 7,
    },
  },
  {
    group: 'fresh',
    name: 'within TTL with revoked + killed entries — registry loads, named artifacts blocked',
    feed: {
      formatVersion: '1.0',
      registryId: 'registry.gridmason.dev',
      seq: 8,
      issuedAt: ISSUED_AT,
      ttlSeconds: ONE_HOUR_S,
      entries: [
        { artifact: 'acme-chart@1.2.3', state: 'revoked', severity: 'high', reason: 'CVE-2024-0001' },
        { artifact: 'acme-map@0.9.0', state: 'killed', severity: 'critical', reason: 'active exploitation' },
      ],
    },
    cursor: { registryId: 'registry.gridmason.dev', seq: 8 },
    now: DEADLINE,
    expected: {
      code: 'fresh',
      ok: true,
      registryId: 'registry.gridmason.dev',
      blocked: [
        { artifact: 'acme-chart@1.2.3', state: 'revoked', severity: 'high' },
        { artifact: 'acme-map@0.9.0', state: 'killed', severity: 'critical' },
      ],
      nextSeq: 8,
    },
  },
  {
    group: 'stale',
    name: 'one millisecond past the TTL deadline — this registry fails closed',
    feed: {
      formatVersion: '1.0',
      registryId: 'registry.gridmason.dev',
      seq: 4,
      issuedAt: ISSUED_AT,
      ttlSeconds: ONE_HOUR_S,
      entries: [{ artifact: 'acme-chart@1.2.3', state: 'revoked', severity: 'low', reason: 'deprecated' }],
    },
    cursor: { registryId: 'registry.gridmason.dev', seq: 4 },
    now: DEADLINE + 1,
    expected: {
      code: 'stale',
      ok: false,
      registryId: 'registry.gridmason.dev',
      blocked: [],
      nextSeq: undefined,
    },
  },
  {
    group: 'rollback',
    name: 'feed seq below the cursor — replayed old feed rejected, even while within its own TTL',
    feed: {
      formatVersion: '1.0',
      registryId: 'registry.gridmason.dev',
      seq: 3,
      issuedAt: ISSUED_AT,
      ttlSeconds: ONE_HOUR_S,
      entries: [],
    },
    cursor: { registryId: 'registry.gridmason.dev', seq: 5 },
    now: ISSUED_AT + 60_000,
    expected: {
      code: 'rolled-back',
      ok: false,
      registryId: 'registry.gridmason.dev',
      blocked: [],
      nextSeq: undefined,
    },
  },
  // Multi-registry scoping: the same `now` makes registry A's feed stale while
  // registry B's feed is fresh. A host runs `evaluateFreshness` once per registry;
  // A's fail-closed verdict is scoped to A (its own registryId) and does not touch
  // B, which still loads. The two vectors below are the two independent calls.
  {
    group: 'multi-registry',
    name: 'registry A stale at this clock — only A is blocked',
    feed: {
      formatVersion: '1.0',
      registryId: 'registry-a.example',
      seq: 2,
      issuedAt: ISSUED_AT,
      ttlSeconds: ONE_HOUR_S,
      entries: [],
    },
    cursor: { registryId: 'registry-a.example', seq: 2 },
    now: DEADLINE + 1,
    expected: {
      code: 'stale',
      ok: false,
      registryId: 'registry-a.example',
      blocked: [],
      nextSeq: undefined,
    },
  },
  {
    group: 'multi-registry',
    name: 'registry B fresh at the same clock — B still loads despite A being stale',
    feed: {
      formatVersion: '1.0',
      registryId: 'registry-b.example',
      seq: 11,
      issuedAt: DEADLINE,
      ttlSeconds: ONE_HOUR_S,
      entries: [{ artifact: 'beta-widget@2.0.0', state: 'revoked', severity: 'medium', reason: 'superseded' }],
    },
    cursor: { registryId: 'registry-b.example', seq: 11 },
    now: DEADLINE + 1,
    expected: {
      code: 'fresh',
      ok: true,
      registryId: 'registry-b.example',
      blocked: [{ artifact: 'beta-widget@2.0.0', state: 'revoked', severity: 'medium' }],
      nextSeq: 11,
    },
  },
];
