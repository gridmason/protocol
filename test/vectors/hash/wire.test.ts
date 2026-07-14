import { describe, expect, it } from 'vitest';

import { hashWireVectors, runConformanceVectorsAsync } from '../../../src/vectors/index.js';
import type { ConformanceSurface } from '../../../src/vectors/index.js';
import { verifyHash } from '../../../src/verify/index.js';

// FR-15 / SPEC §4.1, §7 — the content-hash WIRE vectors, exercised as a downstream
// consumer would: one import of the published corpus + the async runner. The
// load-bearing guarantee (SPEC §6): a consumer whose implementation "passes" a
// tampered vector fails its build.

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe('hash-wire vectors — published corpus', () => {
  it('ships positive, tampered, unknown-prefix, and malformed cases', () => {
    const reasons = new Set(hashWireVectors.map((v) => v.reason));
    expect(reasons.has('ok')).toBe(true);
    expect(reasons.has('hash-mismatch')).toBe(true);
    expect(reasons.has('unknown-hash-prefix')).toBe(true);
    expect(reasons.has('malformed-hash-string')).toBe(true);
  });

  it('the package produces the pinned verdict for every hash vector', async () => {
    const report = await runConformanceVectorsAsync();
    const hash = report.results.filter((r) => r.group === 'hash-wire');
    expect(hash.length).toBe(hashWireVectors.length);
    expect(hash.every((r) => r.ok), report.failures).toBe(true);
    // The async runner is a superset of the sync one — it must also carry the
    // canon-wire results, so a consumer gets the whole byte-path in one call.
    expect(report.results.some((r) => r.group === 'canon-wire')).toBe(true);
    expect(report.ok, report.failures).toBe(true);
  });
});

describe('hash-wire vectors — tampered byte fails verification (acceptance)', () => {
  it('every tampered vector is refused by verifyHash directly', async () => {
    const tampered = hashWireVectors.filter((v) => v.reason === 'hash-mismatch');
    expect(tampered.length).toBeGreaterThan(0);
    for (const v of tampered) {
      const verdict = await verifyHash(hexToBytes(v.inputHex), v.expected);
      expect(verdict.reason).toBe('hash-mismatch');
      expect(verdict.ok).toBe(false);
    }
  });
});

describe('hash-wire vectors — catch divergence (SPEC §6, §7)', () => {
  it('a verifier that always accepts fails the tampered and malformed vectors', async () => {
    // The whole point: an implementation that green-lights a tampered payload
    // must FAIL the shared runner — the build depends on this assertion.
    const broken: ConformanceSurface = {
      verifyHash: async (_bytes, expected) => ({ reason: 'ok', ok: true, computed: expected as `sha2-256:${string}` }),
    };
    const report = await runConformanceVectorsAsync(broken);
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'hash-wire')).toBe(true);
    // The tampered negative specifically must be among the failures.
    const names = hashWireVectors.filter((v) => v.reason === 'hash-mismatch').map((v) => v.name);
    expect(failed.some((r) => names.includes(r.name))).toBe(true);
  });

  it('a hashBytes that returns the wrong digest fails the positive vectors', async () => {
    // verifyHash stays correct (default), but a divergent hashBytes must still be
    // caught: the positive vectors pin the raw digest, not just the verdict.
    const broken: ConformanceSurface = {
      hashBytes: async () => 'sha2-256:0000000000000000000000000000000000000000000000000000000000000000',
    };
    const report = await runConformanceVectorsAsync(broken);
    expect(report.ok).toBe(false);
    expect(report.results.some((r) => !r.ok && r.group === 'hash-wire')).toBe(true);
  });
});
