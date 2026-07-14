import { describe, expect, it } from 'vitest';

import { evaluateTrustRoot } from '../../../src/verify/trust/index.js';
import { trustRootVectors } from './scenarios.js';

// SPEC §4.4/§5 (FR-12): the shipped trust-root scenarios must reproduce exactly on
// this package's own `evaluateTrustRoot`. Exhaustive branch/edge coverage lives in
// test/verify/trust/trust.test.ts; here each vector is one data-driven case.
describe('trust-root vectors — evaluateTrustRoot reproduces every scenario', () => {
  for (const vector of trustRootVectors) {
    it(`[${vector.group}] ${vector.name}`, () => {
      const verdict = evaluateTrustRoot(vector.doc, vector.pins, vector.now);
      expect(verdict).toEqual(vector.expected);
    });
  }
});

describe('trust-root vectors — overlap rotation accepts old and new (SPEC §4.4)', () => {
  it('the same overlap document is trusted for both the outgoing- and incoming-pinned host', () => {
    const overlap = trustRootVectors.filter((v) => v.group === 'overlap');
    expect(overlap.length).toBe(2);
    for (const vector of overlap) {
      const verdict = evaluateTrustRoot(vector.doc, vector.pins, vector.now);
      expect(verdict.ok).toBe(true);
      expect(verdict.overlap).toBe(true);
    }
    // Both accept the same multi-root document, on different pins.
    expect(overlap[0]!.doc.countersignRoots).toEqual(overlap[1]!.doc.countersignRoots);
    expect(overlap[0]!.pins[0]!.root).not.toBe(overlap[1]!.pins[0]!.root);
  });
});

describe('trust-root vector corpus shape', () => {
  it('covers all four acceptance groups', () => {
    const groups = new Set(trustRootVectors.map((v) => v.group));
    expect(groups).toEqual(new Set(['pinned-valid', 'overlap', 'unpinned', 'expired']));
  });

  it('carries both trusted and refused outcomes', () => {
    expect(trustRootVectors.some((v) => v.expected.ok)).toBe(true);
    expect(trustRootVectors.some((v) => !v.expected.ok)).toBe(true);
  });
});
