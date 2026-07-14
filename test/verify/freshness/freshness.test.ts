import { describe, expect, it } from 'vitest';

import type { Cursor, RevocationFeed } from '../../../src/types/wire/revocation.js';
import { evaluateFreshness } from '../../../src/verify/freshness/index.js';

// FR-11 / SPEC §4.3, §5: exhaustive branch + edge coverage for the pure
// per-registry load gate. src/verify is security core, held at 100% (GW-D20).

const REGISTRY = 'registry.gridmason.dev';
const ISSUED_AT = 1_704_067_200_000; // 2024-01-01T00:00:00Z, epoch ms
const TTL_S = 3600; // one hour
const DEADLINE = ISSUED_AT + TTL_S * 1000;

/** A within-TTL feed with the given overrides; entries default to empty. */
function feed(overrides: Partial<RevocationFeed> = {}): RevocationFeed {
  return {
    formatVersion: '1.0',
    registryId: REGISTRY,
    seq: 5,
    issuedAt: ISSUED_AT,
    ttlSeconds: TTL_S,
    entries: [],
    ...overrides,
  };
}

function cursor(overrides: Partial<Cursor> = {}): Cursor {
  return { registryId: REGISTRY, seq: 5, ...overrides };
}

describe('evaluateFreshness — registry match guard', () => {
  it('refuses (registry-mismatch) when feed and cursor name different registries', () => {
    const verdict = evaluateFreshness(feed(), cursor({ registryId: 'other.example' }), ISSUED_AT);
    expect(verdict).toEqual({
      code: 'registry-mismatch',
      ok: false,
      registryId: REGISTRY, // the verdict is scoped to the FEED's registry
      blocked: [],
      nextSeq: undefined,
    });
  });
});

describe('evaluateFreshness — monotonicity (rollback) guard', () => {
  it('rejects a feed whose seq is below the cursor, regardless of TTL', () => {
    const verdict = evaluateFreshness(feed({ seq: 3 }), cursor({ seq: 5 }), ISSUED_AT + 1);
    expect(verdict.code).toBe('rolled-back');
    expect(verdict.ok).toBe(false);
    expect(verdict.nextSeq).toBeUndefined();
  });

  it('accepts an equal seq (idempotent re-check, not a rollback)', () => {
    const verdict = evaluateFreshness(feed({ seq: 5 }), cursor({ seq: 5 }), ISSUED_AT + 1);
    expect(verdict.code).toBe('fresh');
    expect(verdict.nextSeq).toBe(5);
  });

  it('accepts the first feed for a never-seen registry (cursor seq -1)', () => {
    const verdict = evaluateFreshness(feed({ seq: 0 }), cursor({ seq: -1 }), ISSUED_AT + 1);
    expect(verdict.code).toBe('fresh');
    expect(verdict.nextSeq).toBe(0);
  });
});

describe('evaluateFreshness — TTL / staleness (fail-closed scoped)', () => {
  it('is fresh strictly before the deadline', () => {
    expect(evaluateFreshness(feed(), cursor(), DEADLINE - 1).code).toBe('fresh');
  });

  it('is fresh exactly at the deadline (boundary is inclusive)', () => {
    expect(evaluateFreshness(feed(), cursor(), DEADLINE).code).toBe('fresh');
  });

  it('is stale one millisecond past the deadline', () => {
    const verdict = evaluateFreshness(feed(), cursor(), DEADLINE + 1);
    expect(verdict).toEqual({
      code: 'stale',
      ok: false,
      registryId: REGISTRY,
      blocked: [],
      nextSeq: undefined,
    });
  });
});

describe('evaluateFreshness — fresh verdict blocks named artifacts', () => {
  it('maps revoked and killed entries to the blocked list, in feed order, with severity', () => {
    const verdict = evaluateFreshness(
      feed({
        seq: 9,
        entries: [
          { artifact: 'acme-chart@1.2.3', state: 'revoked', severity: 'high', reason: 'CVE' },
          { artifact: 'acme-map@0.9.0', state: 'killed', severity: 'critical', reason: 'exploited' },
        ],
      }),
      cursor({ seq: 8 }),
      ISSUED_AT + 60_000,
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.blocked).toEqual([
      { artifact: 'acme-chart@1.2.3', state: 'revoked', severity: 'high' },
      { artifact: 'acme-map@0.9.0', state: 'killed', severity: 'critical' },
    ]);
    expect(verdict.nextSeq).toBe(9);
  });

  it('returns an empty blocked list for a feed with no entries', () => {
    expect(evaluateFreshness(feed(), cursor(), ISSUED_AT).blocked).toEqual([]);
  });
});

describe('evaluateFreshness — check ordering', () => {
  it('registry-mismatch takes precedence over a rollback', () => {
    const verdict = evaluateFreshness(
      feed({ seq: 1 }),
      cursor({ registryId: 'other.example', seq: 5 }),
      ISSUED_AT,
    );
    expect(verdict.code).toBe('registry-mismatch');
  });

  it('rollback takes precedence over staleness', () => {
    const verdict = evaluateFreshness(feed({ seq: 1 }), cursor({ seq: 5 }), DEADLINE + 10_000);
    expect(verdict.code).toBe('rolled-back');
  });
});
