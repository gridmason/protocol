import { describe, expect, it } from 'vitest';

import { evaluateFreshness } from '../../../src/verify/freshness/index.js';
import { freshnessVectors } from '../../../src/vectors/freshness.js';

// SPEC §4.3/§5 (FR-11): the shipped freshness scenarios must reproduce exactly on
// this package's own `evaluateFreshness`. Exhaustive branch/edge coverage lives in
// test/verify/freshness/freshness.test.ts; here each vector is one data-driven case.
describe('freshness vectors — evaluateFreshness reproduces every scenario', () => {
  for (const vector of freshnessVectors) {
    it(`[${vector.group}] ${vector.name}`, () => {
      const verdict = evaluateFreshness(vector.feed, vector.cursor, vector.now);
      expect(verdict).toEqual(vector.expected);
    });
  }
});

describe('freshness vectors — multi-registry scoping (SPEC §4.3)', () => {
  it('a stale registry fails closed without affecting a fresh one at the same clock', () => {
    const scoped = freshnessVectors.filter((v) => v.group === 'multi-registry');
    const stale = scoped.find((v) => v.expected.code === 'stale');
    const fresh = scoped.find((v) => v.expected.code === 'fresh');
    expect(stale && fresh).toBeTruthy();
    // Same `now`, different registries: the block is scoped to the stale one only.
    expect(stale!.now).toBe(fresh!.now);
    const staleVerdict = evaluateFreshness(stale!.feed, stale!.cursor, stale!.now);
    const freshVerdict = evaluateFreshness(fresh!.feed, fresh!.cursor, fresh!.now);
    expect(staleVerdict.ok).toBe(false);
    expect(freshVerdict.ok).toBe(true);
    expect(staleVerdict.registryId).not.toBe(freshVerdict.registryId);
  });
});

describe('freshness vector corpus shape', () => {
  it('covers all four acceptance groups', () => {
    const groups = new Set(freshnessVectors.map((v) => v.group));
    expect(groups).toEqual(new Set(['fresh', 'stale', 'multi-registry', 'rollback']));
  });

  it('carries both loadable and blocked outcomes', () => {
    expect(freshnessVectors.some((v) => v.expected.ok)).toBe(true);
    expect(freshnessVectors.some((v) => !v.expected.ok)).toBe(true);
  });
});
