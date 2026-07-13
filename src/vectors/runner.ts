/**
 * The conformance-vector runner (docs/SPEC.md §6, §7; FR-15 — type portion).
 *
 * `runConformanceVectors` applies an implementation surface to every shipped
 * type vector and reports each verdict. A consumer (core / cli / registry /
 * dashboard) runs it in its own CI with one import so a divergent implementation
 * fails a shared test, not production — and a self-test in this repo runs it
 * against `@gridmason/protocol`'s own exported functions.
 *
 * Framework-agnostic: it returns a {@link ConformanceReport} rather than calling
 * any test framework, so the caller asserts with its own `expect`.
 *
 * Phase A ships the **type** vectors below. The security **wire-format**
 * negatives (tampered hash, wrong issuer, expired root, forked log, stale feed)
 * are Phase B (FR-15, P-E2 / P-E4): add a `wire-*` group here and the matching
 * verify members to {@link ConformanceSurface} — the report shape does not change.
 */

import { isContextSubset } from '../types/context.js';
import { MigratorRegistry, migrate } from '../types/layout.js';
import type { MigrateOptions } from '../types/layout.js';
import { parseCapability, validateCapability } from '../types/manifest/capability.js';
import { lintTag } from '../types/manifest/tag.js';
import {
  capabilityObjectVectors,
  capabilityStringVectors,
  defaultValidateManifest,
  manifestVectors,
  tagVectors,
} from './manifest.js';
import { contextVectors } from './context.js';
import { layoutVectors } from './layout.js';
import type { ConformanceReport, ConformanceSurface, VectorResult } from './types.js';

/**
 * Run every shipped type-conformance vector against `surface`, defaulting each
 * unspecified member to `@gridmason/protocol`'s own implementation.
 *
 * @param surface Consumer implementations to test; omit for the package's own.
 * @returns A {@link ConformanceReport}; assert on `report.ok` with `report.summary`.
 */
export function runConformanceVectors(surface: ConformanceSurface = {}): ConformanceReport {
  const results: VectorResult[] = [];

  const lint = surface.lintTag ?? lintTag;
  const parseCap = surface.parseCapability ?? parseCapability;
  const validateCap = surface.validateCapability ?? validateCapability;
  const subset = surface.isContextSubset ?? isContextSubset;
  const migrateFn = surface.migrate ?? migrate;
  const validateManifest = surface.validateManifest ?? defaultValidateManifest;

  for (const v of manifestVectors) {
    const actual = validateManifest(v.manifest);
    results.push(record('manifest-schema', v.name, actual === v.valid, `valid expected ${v.valid}, got ${actual}`));
  }

  for (const v of tagVectors) {
    const r = lint(v.tag, v.publisher);
    const codes = r.violations.map((violation) => violation.code);
    const ok = r.ok === v.ok && sameSet(codes, v.codes);
    results.push(record('manifest-tag', v.name, ok, `expected ok=${v.ok} codes=[${[...v.codes].sort().join(',')}], got ok=${r.ok} codes=[${[...codes].sort().join(',')}]`));
  }

  for (const v of capabilityStringVectors) {
    const r = parseCap(v.input);
    const ok = v.expected.ok
      ? r.ok && r.api === v.expected.api && r.scope === v.expected.scope
      : !r.ok && r.error === v.expected.error;
    results.push(record('capability-string', v.name, ok, `expected ${JSON.stringify(v.expected)}, got ${JSON.stringify(r)}`));
  }

  for (const v of capabilityObjectVectors) {
    const actual = validateCap(v.capability);
    results.push(record('capability-object', v.name, actual === v.error, `expected error=${String(v.error)}, got ${String(actual)}`));
  }

  for (const v of contextVectors) {
    const actual = subset(v.requires, v.page);
    results.push(record('context-subset', v.name, actual === v.subset, `expected subset=${v.subset}, got ${actual}`));
  }

  for (const v of layoutVectors) {
    const registry = new MigratorRegistry();
    for (const step of v.migrators) registry.register(step);
    const options: MigrateOptions = v.target === undefined ? { registry } : { registry, target: v.target };
    const result = migrateFn(v.doc, options);

    let ok: boolean;
    let detail: string;
    if (v.expected.readOnly) {
      const reasonOk =
        result.readOnly &&
        (v.expected.reasonIncludes === undefined || result.reason.includes(v.expected.reasonIncludes));
      // Read-only must return the untouched input — the "never rewrites" guarantee.
      ok = reasonOk && deepEqual(result.doc, v.doc);
      detail = `expected read-only (reason ~ ${String(v.expected.reasonIncludes)}) with untouched doc, got ${JSON.stringify(result)}`;
    } else {
      ok = !result.readOnly && deepEqual(result.doc, v.expected.doc);
      detail = `expected migrated doc ${JSON.stringify(v.expected.doc)}, got ${JSON.stringify(result)}`;
    }
    results.push(record('layout-migrate', v.name, ok, detail));
  }

  return report(results);
}

/** Build a {@link VectorResult}, attaching `detail` only on failure. */
function record(group: string, name: string, ok: boolean, detail: string): VectorResult {
  return ok ? { group, name, ok } : { group, name, ok, detail };
}

/** Assemble the summary/failures strings from collected results. */
function report(results: VectorResult[]): ConformanceReport {
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  const ok = passed === total;
  const failures = results
    .filter((r) => !r.ok)
    .map((r) => `[${r.group}] ${r.name}: ${r.detail ?? ''}`)
    .join('\n');
  const summary = ok
    ? `${passed}/${total} conformance vectors passed`
    : `${total - passed}/${total} conformance vectors FAILED`;
  return { ok, total, passed, results, summary, failures };
}

/** Order-independent equality of two code lists. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

/** Structural deep equality for plain JSON values (no deps, key-order agnostic). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(bo, key) && deepEqual(ao[key], bo[key]));
}
