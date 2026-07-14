/**
 * Revocation-feed **freshness** conformance vectors (docs/SPEC.md §4.3, §7; FR-15,
 * P-E4 — the `stale-past-TTL feed` negative of the SPEC §7 set).
 *
 * Self-describing scenarios any conforming
 * {@link import('../verify/freshness/freshness.js').evaluateFreshness} must
 * reproduce: an already-authenticated {@link RevocationFeed}, the host
 * {@link Cursor}, and `now`, paired with the exact verdict. Typed against the
 * shipped contract, so a change that breaks a scenario fails to compile. Grouped
 * by the four acceptance cases: fresh, stale, multi-registry (scoping), rollback.
 *
 * The load-bearing negative is `stale-past-TTL feed` (SPEC §7): a feed one
 * millisecond past its TTL deadline fails closed (`code: 'stale'`), scoped to its
 * own registry — the multi-registry pair shows a stale registry A not touching a
 * fresh registry B at the same clock. A consumer whose runner "passes" a stale
 * feed fails CI.
 *
 * The exhaustive branch/edge coverage of `evaluateFreshness` lives in
 * `test/verify/freshness/freshness.test.ts`; this is the shared, published corpus.
 */

import type { Cursor, RevocationFeed } from '../types/wire/revocation.js';
import type { FreshnessVector } from './types.js';

/** A fixed issue time so every scenario's TTL math is explicit. `2024-01-01T00:00:00Z`. */
const ISSUED_AT = 1_704_067_200_000;
/** One hour of TTL, in seconds. */
const ONE_HOUR_S = 3600;
/** `ISSUED_AT + ONE_HOUR_S`, the exact deadline in epoch ms. */
const DEADLINE = ISSUED_AT + ONE_HOUR_S * 1000;

const feed = (registryId: string, seq: number, issuedAt: number, entries: RevocationFeed['entries']): RevocationFeed => ({
  formatVersion: '1.0',
  registryId,
  seq,
  issuedAt,
  ttlSeconds: ONE_HOUR_S,
  entries,
});
const cursor = (registryId: string, seq: number): Cursor => ({ registryId, seq });

/**
 * The freshness corpus — fresh (empty + with blocked entries), stale
 * (past-TTL, the SPEC §7 negative), rollback (replayed old feed), and a
 * multi-registry pair proving stale-scoping.
 */
export const freshnessVectors: readonly FreshnessVector[] = [
  {
    group: 'fresh',
    name: 'within TTL, empty feed — registry loads, nothing blocked',
    feed: feed('registry.gridmason.dev', 7, ISSUED_AT, []),
    cursor: cursor('registry.gridmason.dev', 6),
    now: ISSUED_AT + 60_000,
    expected: { code: 'fresh', ok: true, registryId: 'registry.gridmason.dev', blocked: [], nextSeq: 7 },
  },
  {
    group: 'fresh',
    name: 'within TTL with revoked + killed entries — registry loads, named artifacts blocked',
    feed: feed('registry.gridmason.dev', 8, ISSUED_AT, [
      { artifact: 'acme-chart@1.2.3', state: 'revoked', severity: 'high', reason: 'CVE-2024-0001' },
      { artifact: 'acme-map@0.9.0', state: 'killed', severity: 'critical', reason: 'active exploitation' },
    ]),
    cursor: cursor('registry.gridmason.dev', 8),
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
    feed: feed('registry.gridmason.dev', 4, ISSUED_AT, [
      { artifact: 'acme-chart@1.2.3', state: 'revoked', severity: 'low', reason: 'deprecated' },
    ]),
    cursor: cursor('registry.gridmason.dev', 4),
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
    feed: feed('registry.gridmason.dev', 3, ISSUED_AT, []),
    cursor: cursor('registry.gridmason.dev', 5),
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
  // A's fail-closed verdict is scoped to A and does not touch B, which still loads.
  {
    group: 'multi-registry',
    name: 'registry A stale at this clock — only A is blocked',
    feed: feed('registry-a.example', 2, ISSUED_AT, []),
    cursor: cursor('registry-a.example', 2),
    now: DEADLINE + 1,
    expected: { code: 'stale', ok: false, registryId: 'registry-a.example', blocked: [], nextSeq: undefined },
  },
  {
    group: 'multi-registry',
    name: 'registry B fresh at the same clock — B still loads despite A being stale',
    feed: feed('registry-b.example', 11, DEADLINE, [
      { artifact: 'beta-widget@2.0.0', state: 'revoked', severity: 'medium', reason: 'superseded' },
    ]),
    cursor: cursor('registry-b.example', 11),
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
