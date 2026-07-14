import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  capabilityObjectVectors,
  capabilityStringVectors,
  contextValueVectors,
  contextVectors,
  layoutVectors,
  manifestVectors,
  runConformanceVectors,
  tagVectors,
} from '../../src/vectors/index.js';
import type { ConformanceSurface } from '../../src/vectors/index.js';

// FR-15 / SPEC §6: the vectors this package ships must pass against the package's
// own implementation, an injected real schema validator must agree with the
// zero-dependency fallback, and — the whole point — a *divergent* implementation
// must FAIL the shared runner rather than slip through.

// A validator compiled from the COMMITTED schema, injected the way a downstream
// repo would (the package keeps zero runtime deps; ajv is the consumer's).
function ajvValidateManifest(): (manifest: unknown) => boolean {
  const schema = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../schemas/manifest.schema.json', import.meta.url)), 'utf8'),
  ) as object;
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  return (manifest) => validate(manifest) === true;
}

describe('runConformanceVectors — self-conformance', () => {
  it('the package passes its own vectors with the built-in defaults', () => {
    const report = runConformanceVectors();
    expect(report.ok, report.failures).toBe(true);
    expect(report.total).toBeGreaterThan(0);
    expect(report.passed).toBe(report.total);
  });

  it('passes with an injected ajv validator (full schema fidelity)', () => {
    const report = runConformanceVectors({ validateManifest: ajvValidateManifest() });
    expect(report.ok, report.failures).toBe(true);
  });

  it('the embedded manifest check and the real schema agree on every manifest vector', () => {
    const ajv = ajvValidateManifest();
    const embedded = runConformanceVectors();
    const injected = runConformanceVectors({ validateManifest: ajv });
    const embeddedManifest = embedded.results.filter((r) => r.group === 'manifest-schema');
    const injectedManifest = injected.results.filter((r) => r.group === 'manifest-schema');
    expect(embeddedManifest.every((r) => r.ok)).toBe(true);
    expect(injectedManifest.every((r) => r.ok)).toBe(true);
  });
});

describe('runConformanceVectors — catches divergence (SPEC §6)', () => {
  it('a subset check that always returns true fails the negative context vectors', () => {
    const broken: ConformanceSurface = { isContextSubset: () => true };
    const report = runConformanceVectors(broken);
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'context-subset')).toBe(true);
  });

  it('a context-value matcher that always returns true fails the negative context-match vectors', () => {
    const broken: ConformanceSurface = { matchesContextMap: () => true };
    const report = runConformanceVectors(broken);
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'context-match')).toBe(true);
  });

  it('a tag linter that always passes fails the negative tag vectors', () => {
    const broken: ConformanceSurface = { lintTag: () => ({ ok: true, violations: [] }) };
    const report = runConformanceVectors(broken);
    expect(report.ok).toBe(false);
    expect(report.results.some((r) => !r.ok && r.group === 'manifest-tag')).toBe(true);
  });

  it('a manifest validator that accepts everything fails the negative manifest vectors', () => {
    const report = runConformanceVectors({ validateManifest: () => true });
    expect(report.ok).toBe(false);
    expect(report.results.some((r) => !r.ok && r.group === 'manifest-schema')).toBe(true);
  });
});

describe('vector corpus shape', () => {
  it('every group carries both positive and negative cases', () => {
    expect(manifestVectors.some((v) => v.valid)).toBe(true);
    expect(manifestVectors.some((v) => !v.valid)).toBe(true);
    expect(tagVectors.some((v) => v.ok)).toBe(true);
    expect(tagVectors.some((v) => !v.ok)).toBe(true);
    expect(capabilityStringVectors.some((v) => v.expected.ok)).toBe(true);
    expect(capabilityStringVectors.some((v) => !v.expected.ok)).toBe(true);
    expect(capabilityObjectVectors.some((v) => v.error === undefined)).toBe(true);
    expect(capabilityObjectVectors.some((v) => v.error !== undefined)).toBe(true);
    expect(contextVectors.some((v) => v.subset)).toBe(true);
    expect(contextVectors.some((v) => !v.subset)).toBe(true);
    expect(contextValueVectors.some((v) => v.matches)).toBe(true);
    expect(contextValueVectors.some((v) => !v.matches)).toBe(true);
    expect(layoutVectors.some((v) => !v.expected.readOnly)).toBe(true);
    expect(layoutVectors.some((v) => v.expected.readOnly)).toBe(true);
  });
});
