import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  capabilityGrantVectors,
  capabilityObjectVectors,
  capabilityStringVectors,
  contextValueVectors,
  contextVectors,
  devProxyRequestVectors,
  devProxyResponseVectors,
  freshnessVectors,
  hashWireVectors,
  layoutVectors,
  logConsistencyVectors,
  manifestVectors,
  negotiateVectors,
  runConformanceVectors,
  runConformanceVectorsAsync,
  signatureVectors,
  tagVectors,
  trustRootVectors,
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

  it('a grant rule that always grants fails the negative capability-grant vectors', () => {
    const report = runConformanceVectors({ grantsCapability: () => true });
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'capability-grant')).toBe(true);
  });

  it('a request guard that accepts everything fails the negative dev-proxy-request vectors', () => {
    const report = runConformanceVectors({ isDevProxySdkRequest: () => true });
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'dev-proxy-request')).toBe(true);
  });

  it('a response guard that accepts everything fails the negative dev-proxy-response vectors', () => {
    const report = runConformanceVectors({ isDevProxySdkResponse: () => true });
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'dev-proxy-response')).toBe(true);
  });

  it('a negotiator that always returns ok fails the upgrade/refuse vectors', () => {
    const report = runConformanceVectors({ negotiate: () => 'ok' });
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'negotiate')).toBe(true);
  });

  it('a trust evaluator that always trusts fails the expired/unpinned vectors', () => {
    const alwaysTrusted: ConformanceSurface['evaluateTrustRoot'] = () => ({
      code: 'trusted',
      ok: true,
      registryId: 'anything',
      matchedRoot: undefined,
      matchedChannel: undefined,
      overlap: false,
      crossSig: undefined,
    });
    const report = runConformanceVectors({ evaluateTrustRoot: alwaysTrusted });
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'trust-root')).toBe(true);
    // The expired-root negative (SPEC §7) is among the caught divergences.
    expect(failed.some((r) => r.name.includes('expired'))).toBe(true);
  });

  it('a freshness evaluator that always says fresh fails the stale/rollback vectors', () => {
    const alwaysFresh: ConformanceSurface['evaluateFreshness'] = () => ({
      code: 'fresh',
      ok: true,
      registryId: 'anything',
      blocked: [],
      nextSeq: 0,
    });
    const report = runConformanceVectors({ evaluateFreshness: alwaysFresh });
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'freshness')).toBe(true);
    // The stale-past-TTL negative (SPEC §7) is among the caught divergences.
    expect(failed.some((r) => r.group === 'freshness' && r.name.includes('past the TTL'))).toBe(true);
  });
});

// The crypto negatives are async — a broken WebCrypto-backed verifier must fail
// the shared runner exactly as the sync ones do (SPEC §6, §7).
describe('runConformanceVectorsAsync — catches divergence on the crypto negatives', () => {
  it('the package passes the full corpus with the built-in defaults', async () => {
    const report = await runConformanceVectorsAsync();
    expect(report.ok, report.failures).toBe(true);
    // The whole SPEC §7 negative set is present and green.
    for (const group of ['hash-wire', 'signature', 'log-consistency', 'trust-root', 'freshness']) {
      expect(report.results.some((r) => r.group === group), group).toBe(true);
    }
  });

  it('a signature verifier that always says ok fails the wrong-issuer vectors', async () => {
    const report = await runConformanceVectorsAsync({
      verifySignatureEnvelope: async () => ({ reason: 'ok', ok: true }),
    });
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'signature')).toBe(true);
    expect(failed.some((r) => r.name.includes('issuer'))).toBe(true);
  });

  it('a log verifier that always says ok fails the forked-log vector', async () => {
    const report = await runConformanceVectorsAsync({
      verifyLogConsistency: async () => ({ reason: 'ok', ok: true }),
    });
    expect(report.ok).toBe(false);
    const failed = report.results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.group === 'log-consistency')).toBe(true);
    expect(failed.some((r) => r.name.includes('forked'))).toBe(true);
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
    expect(capabilityGrantVectors.some((v) => v.grants)).toBe(true);
    expect(capabilityGrantVectors.some((v) => !v.grants)).toBe(true);
    expect(devProxyRequestVectors.some((v) => v.valid)).toBe(true);
    expect(devProxyRequestVectors.some((v) => !v.valid)).toBe(true);
    expect(devProxyResponseVectors.some((v) => v.valid)).toBe(true);
    expect(devProxyResponseVectors.some((v) => !v.valid)).toBe(true);
    expect(layoutVectors.some((v) => !v.expected.readOnly)).toBe(true);
    expect(layoutVectors.some((v) => v.expected.readOnly)).toBe(true);
    expect(negotiateVectors.some((v) => v.outcome === 'ok')).toBe(true);
    expect(negotiateVectors.some((v) => v.outcome === 'upgrade')).toBe(true);
    expect(negotiateVectors.some((v) => v.outcome === 'refuse')).toBe(true);
    // The P-E4 crypto/verify groups — each carries a positive and its SPEC §7 negative.
    expect(signatureVectors.some((v) => v.reason === 'ok')).toBe(true);
    expect(signatureVectors.some((v) => v.reason !== 'ok')).toBe(true);
    expect(trustRootVectors.some((v) => v.expected.ok)).toBe(true);
    expect(trustRootVectors.some((v) => !v.expected.ok)).toBe(true);
    expect(logConsistencyVectors.some((v) => v.reason === 'ok')).toBe(true);
    expect(logConsistencyVectors.some((v) => v.reason !== 'ok')).toBe(true);
    expect(freshnessVectors.some((v) => v.expected.ok)).toBe(true);
    expect(freshnessVectors.some((v) => !v.expected.ok)).toBe(true);
  });

  it('every SPEC §7 negative is present as a published vector', () => {
    // tampered hash | wrong issuer | expired root | forked log | stale-past-TTL feed
    expect(hashWireVectors.some((v) => v.reason === 'hash-mismatch')).toBe(true);
    expect(signatureVectors.some((v) => v.reason === 'publisher-issuer-not-allowlisted')).toBe(true);
    expect(trustRootVectors.some((v) => v.group === 'expired' && v.expected.code === 'expired')).toBe(true);
    expect(logConsistencyVectors.some((v) => v.reason === 'consistency-proof-invalid')).toBe(true);
    expect(freshnessVectors.some((v) => v.group === 'stale' && v.expected.code === 'stale')).toBe(true);
  });
});
