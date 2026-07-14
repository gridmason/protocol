import { describe, expect, it } from 'vitest';

import {
  canonMalleabilityVectors,
  canonWireVectors,
  runConformanceVectors,
} from '../../../src/vectors/index.js';
import type { ConformanceSurface } from '../../../src/vectors/index.js';

// FR-15 / SPEC §4, §7 — the canonicalization WIRE vectors, exercised exactly as a
// downstream consumer (core / cli / registry / dashboard) would: one import of the
// published corpus + runner. The positives pin exact canonical bytes; the
// malleability vectors prove presentation variants collapse to one signed form.

describe('canon-wire vectors — published corpus', () => {
  it('ships positive and malleability vectors', () => {
    expect(canonWireVectors.length).toBeGreaterThan(0);
    expect(canonMalleabilityVectors.length).toBeGreaterThan(0);
    // Every malleability vector must carry more than one presentation to prove.
    expect(canonMalleabilityVectors.every((v) => v.jsonVariants.length > 1)).toBe(true);
  });

  it('the package canonicalizes every wire vector to its pinned bytes', () => {
    const report = runConformanceVectors();
    const canon = report.results.filter((r) => r.group === 'canon-wire' || r.group === 'canon-malleability');
    expect(canon.length).toBe(canonWireVectors.length + canonMalleabilityVectors.length);
    expect(canon.every((r) => r.ok), report.failures).toBe(true);
  });
});

describe('canon-wire vectors — catch divergence (SPEC §6)', () => {
  it('a canonicalizer that drops the bytes fails every canon vector', () => {
    // A divergent implementation that does not reproduce the signed bytes must
    // fail the shared runner rather than slip a malleable form through.
    const broken: ConformanceSurface = { canonicalize: () => new Uint8Array() };
    const report = runConformanceVectors(broken);
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'canon-wire' || r.group === 'canon-malleability')).toBe(true);
  });

  it('a canonicalizer that ignores key order fails the malleability vectors', () => {
    // JSON.stringify preserves insertion order, so re-ordered inputs produce
    // different bytes — exactly the malleability the real canonicalizer removes.
    const broken: ConformanceSurface = {
      canonicalize: (value) => new TextEncoder().encode(JSON.stringify(value)),
    };
    const report = runConformanceVectors(broken);
    expect(report.ok).toBe(false);
    expect(report.results.some((r) => !r.ok && r.group === 'canon-malleability')).toBe(true);
  });
});
