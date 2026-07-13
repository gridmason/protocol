/**
 * Manifest conformance vectors (docs/SPEC.md §3.1): schema validity, the tag
 * lint rules, and the capability grammar. Positive and negative cases for each.
 *
 * The valid manifests are the canonical SPEC §3.1 examples, authored here as
 * `satisfies Manifest` so a type error catches drift; the invalid ones are plain
 * objects (they must be *un*typeable to be malformed). {@link defaultValidateManifest}
 * is the zero-dependency structural fallback the runner uses when a consumer
 * injects no real schema validator — see {@link import('./types.js').ConformanceSurface}.
 */

import type { CapabilityApi, Manifest, ManifestKind } from '../types/manifest/index.js';
import type {
  CapabilityObjectVector,
  CapabilityStringVector,
  ManifestVector,
  TagVector,
} from './types.js';

const validWidget = {
  formatVersion: '1.0',
  tag: 'acme-sales-chart',
  kind: 'widget',
  name: 'Sales Chart',
  publisher: 'acme',
  version: '2.3.1',
  requiresContext: { record: { recordType: 'customer' } },
  supportsPages: ['crm.customer-detail', 'dashboards.*'],
  size: { default: [4, 3], min: [2, 2], max: [12, 8] },
  capabilities: [{ api: 'records.read', scope: 'recordType:customer' }],
  props: 'schemas/sales-chart.json',
  requires: [{ tag: 'acme-chart-kit', range: '^1.4.0' }],
  sharedScope: { react: '^18', '@gridmason/sdk': '^1' },
  entry: 'widget.js',
  thumbnail: 'assets/sales-chart.png',
} satisfies Manifest;

const validPageType = {
  formatVersion: '1.0',
  tag: 'acme-customer-detail',
  kind: 'page-type',
  name: 'Customer Detail',
  publisher: 'acme',
  version: '1.0.0',
  entry: 'page-type.js',
  pageType: {
    context: { record: { recordType: 'customer' } },
    default_layout: 'acme-customer-default',
    locks: ['header'],
    allow_user_customization: true,
  },
} satisfies Manifest;

/**
 * Manifest schema-validity vectors. The negatives each violate exactly one
 * schema rule: `additionalProperties: false`, a required field, the
 * `formatVersion` pattern, and the `kind` enum (SPEC §3.1).
 */
export const manifestVectors: readonly ManifestVector[] = [
  { name: 'canonical widget manifest', manifest: validWidget, valid: true },
  { name: 'canonical page-type manifest', manifest: validPageType, valid: true },
  {
    name: 'unknown top-level property',
    manifest: { ...structural(), colour: 'red' },
    valid: false,
    note: 'additionalProperties: false',
  },
  {
    name: 'missing required entry',
    manifest: omit(structural(), 'entry'),
    valid: false,
    note: 'entry is required',
  },
  {
    name: 'formatVersion missing minor',
    manifest: { ...structural(), formatVersion: '1' },
    valid: false,
    note: 'must match ^\\d+\\.\\d+$',
  },
  {
    name: 'unknown manifest kind',
    manifest: { ...structural(), kind: 'gadget' },
    valid: false,
    note: 'kind is an enum',
  },
];

/** A minimal well-formed widget manifest, the base each negative mutates. */
function structural(): Record<string, unknown> {
  return {
    formatVersion: '1.0',
    tag: 'acme-sales-chart',
    kind: 'widget',
    name: 'Sales Chart',
    publisher: 'acme',
    version: '2.3.1',
    entry: 'widget.js',
  };
}

/** Return a shallow copy of `obj` without `key` (for the missing-field vector). */
function omit(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

/** Tag-lint vectors (SPEC §3.1). Each negative names the rule(s) it trips. */
export const tagVectors: readonly TagVector[] = [
  { name: 'publisher-prefixed lowercase tag', tag: 'acme-sales-chart', publisher: 'acme', ok: true, codes: [] },
  { name: 'structural check without publisher', tag: 'gm-note', ok: true, codes: [] },
  { name: 'empty tag', tag: '', ok: false, codes: ['empty'] },
  { name: 'no hyphen', tag: 'note', ok: false, codes: ['missing-hyphen'] },
  { name: 'not publisher-prefixed', tag: 'other-widget', publisher: 'acme', ok: false, codes: ['missing-publisher-prefix'] },
  { name: 'illegal character', tag: 'acme-chart!', ok: false, codes: ['invalid-characters'] },
  { name: 'uppercase', tag: 'acme-Chart', ok: false, codes: ['not-lowercase', 'invalid-characters'] },
];

/** Capability-string parse vectors (`<api>[:<scope>]`, SPEC §3.1). */
export const capabilityStringVectors: readonly CapabilityStringVector[] = [
  { name: 'unscoped api', input: 'records.read', expected: { ok: true, api: 'records.read' } },
  {
    name: 'dotted api with colon scope path',
    input: 'records.read:recordType:customer',
    expected: { ok: true, api: 'records.read', scope: 'recordType:customer' },
  },
  { name: 'net scope', input: 'net:api.acme.com', expected: { ok: true, api: 'net', scope: 'api.acme.com' } },
  { name: 'events scope', input: 'events:acme.sales', expected: { ok: true, api: 'events', scope: 'acme.sales' } },
  { name: 'records.write unscoped', input: 'records.write', expected: { ok: true, api: 'records.write' } },
  { name: 'empty string', input: '', expected: { ok: false, error: 'empty' } },
  { name: 'empty api segment', input: ':scope', expected: { ok: false, error: 'empty-api' } },
  { name: 'unknown api', input: 'filesystem:read', expected: { ok: false, error: 'unknown-api' } },
  { name: 'trailing empty scope', input: 'net:', expected: { ok: false, error: 'empty-scope-segment' } },
  { name: 'empty middle scope segment', input: 'records.read:a::b', expected: { ok: false, error: 'empty-scope-segment' } },
];

/** Capability-object validation vectors (the object form, SPEC §3.1). */
export const capabilityObjectVectors: readonly CapabilityObjectVector[] = [
  { name: 'unscoped valid', capability: { api: 'net' } },
  { name: 'scoped valid', capability: { api: 'records.read', scope: 'recordType:customer' } },
  { name: 'unknown api', capability: { api: 'filesystem' as unknown as CapabilityApi }, error: 'unknown-api' },
  { name: 'empty scope', capability: { api: 'net', scope: '' }, error: 'empty-scope-segment' },
  { name: 'empty scope segment', capability: { api: 'net', scope: 'a::b' }, error: 'empty-scope-segment' },
];

const MANIFEST_KINDS: readonly ManifestKind[] = ['widget', 'plugin', 'page-type', 'layout'];
const REQUIRED_STRING_FIELDS = [
  'formatVersion',
  'tag',
  'kind',
  'name',
  'publisher',
  'version',
  'entry',
] as const;
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  ...REQUIRED_STRING_FIELDS,
  'requiresContext',
  'supportsPages',
  'size',
  'capabilities',
  'props',
  'requires',
  'sharedScope',
  'thumbnail',
  'pageType',
]);
const FORMAT_VERSION_RE = /^\d+\.\d+$/;
const SEMVER_RE =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * A **minimal, dependency-free** structural check the runner uses when a
 * consumer injects no real schema validator. It enforces the top-level rules the
 * negative vectors exercise — required string fields, the `formatVersion` /
 * `version` patterns, the `kind` enum, and `additionalProperties: false` — and
 * nothing deeper. It is deliberately **not** the authoritative schema: for full
 * fidelity, inject a validator compiled against the shipped
 * `@gridmason/protocol/schemas/manifest.json` (see the README). Pure; never throws.
 */
export function defaultValidateManifest(manifest: unknown): boolean {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return false;
  const m = manifest as Record<string, unknown>;

  for (const key of Object.keys(m)) {
    if (!ALLOWED_KEYS.has(key)) return false;
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof m[field] !== 'string') return false;
  }
  if (!FORMAT_VERSION_RE.test(m['formatVersion'] as string)) return false;
  if (!SEMVER_RE.test(m['version'] as string)) return false;
  if (!MANIFEST_KINDS.includes(m['kind'] as ManifestKind)) return false;

  return true;
}
