/**
 * Type-conformance vector shapes and the runner's implementation surface
 * (docs/SPEC.md §6, §7; FR-15 — type-vector portion).
 *
 * A *conformance vector* is a versioned, self-describing test case: an input and
 * the outcome any conforming implementation of a Phase-A contract must produce.
 * The vectors ship inside `@gridmason/protocol` and a consumer (core / cli /
 * registry / dashboard) runs them in its own CI with one import
 * ({@link ConformanceSurface}, `runConformanceVectors`), so a divergent
 * implementation fails a shared test rather than production (SPEC §6).
 *
 * This module is Phase A: it carries the **type** vectors (manifest schema +
 * tag/capability grammar, page-context subset, LayoutDoc migration). The
 * security **wire-format** negatives (tampered hash, wrong issuer, expired root,
 * forked log, stale feed) arrive in Phase B via FR-15's wire-vector issues
 * (P-E2 / P-E4) — see the extension note in `runner.ts`.
 */

import type { ContextMap, PageContext } from '../types/context.js';
import type {
  MigrateOptions,
  MigrateResult,
  Migrator,
  SchemaVersion,
  VersionedLayout,
} from '../types/layout.js';
import type {
  Capability,
  CapabilityApi,
  CapabilityError,
  CapabilityParseResult,
  TagLintResult,
  TagViolationCode,
} from '../types/manifest/index.js';

/**
 * The pure-function surface a consumer plugs its own implementation into. Every
 * member is optional: an omitted member falls back to the reference
 * implementation this package exports, so `runConformanceVectors()` with no
 * argument conformance-tests `@gridmason/protocol` against itself (the repo's
 * own self-test), while a consumer passes only the members it re-implements.
 *
 * `validateManifest` is the one member with **no** package default that performs
 * real JSON-Schema validation — the published package carries zero runtime
 * dependencies, so it cannot bundle a validator. Inject one (e.g. `ajv` compiled
 * against the shipped `@gridmason/protocol/schemas/manifest.json`) for full
 * schema fidelity; when omitted, the runner falls back to
 * {@link import('./manifest.js').defaultValidateManifest} — a minimal structural
 * check, not the authoritative schema. See the README.
 */
export interface ConformanceSurface {
  readonly lintTag?: (tag: string, publisher?: string) => TagLintResult;
  readonly parseCapability?: (input: string) => CapabilityParseResult;
  readonly validateCapability?: (capability: Capability) => CapabilityError | undefined;
  readonly isContextSubset?: (requiresContext: ContextMap, pageContext: ContextMap) => boolean;
  readonly matchesContextMap?: (context: PageContext, contextMap: ContextMap) => boolean;
  readonly migrate?: (doc: VersionedLayout, options: MigrateOptions) => MigrateResult;
  readonly validateManifest?: (manifest: unknown) => boolean;
}

/** A manifest schema-validity vector: does the manifest satisfy the schema? */
export interface ManifestVector {
  readonly name: string;
  /** A manifest object, well-formed or deliberately malformed. */
  readonly manifest: unknown;
  /** Whether a conforming validator must accept it. */
  readonly valid: boolean;
  readonly note?: string;
}

/** A tag-lint vector: expected `ok` plus the exact set of violation codes. */
export interface TagVector {
  readonly name: string;
  readonly tag: string;
  readonly publisher?: string;
  readonly ok: boolean;
  /** Every violation code the linter must report (order-independent). */
  readonly codes: readonly TagViolationCode[];
}

/** Expected parse outcome for a capability *string* `<api>[:<scope>]`. */
export type CapabilityStringExpectation =
  | { readonly ok: true; readonly api: CapabilityApi; readonly scope?: string }
  | { readonly ok: false; readonly error: CapabilityError };

/** A capability-string parse vector. */
export interface CapabilityStringVector {
  readonly name: string;
  readonly input: string;
  readonly expected: CapabilityStringExpectation;
}

/** A capability *object* validation vector (`error: undefined` means valid). */
export interface CapabilityObjectVector {
  readonly name: string;
  readonly capability: Capability;
  readonly error?: CapabilityError;
}

/** A page-context subset vector: `requires ⊆ page`? */
export interface ContextVector {
  readonly name: string;
  readonly requires: ContextMap;
  readonly page: ContextMap;
  readonly subset: boolean;
}

/**
 * A page-context value-conformance vector: does the runtime `context` satisfy
 * the declared `contextMap`? Drives {@link import('../types/context.js').matchesContextMap}.
 */
export interface ContextValueVector {
  readonly name: string;
  readonly context: PageContext;
  readonly contextMap: ContextMap;
  readonly matches: boolean;
}

/** Expected outcome of a {@link LayoutVector}. */
export type LayoutExpectation =
  | { readonly readOnly: false; readonly doc: unknown }
  | { readonly readOnly: true; readonly reasonIncludes?: string };

/**
 * A LayoutDoc migration vector. The `migrators` are registered into a fresh
 * {@link import('../types/layout.js').MigratorRegistry} and the document is run
 * to `target` (default {@link import('../types/layout.js').CURRENT_LAYOUT_SCHEMA_VERSION}).
 * A read-only expectation additionally asserts the returned `doc` is the
 * untouched input — the "never rewrites" guarantee (SPEC §3.3, core §5).
 */
export interface LayoutVector {
  readonly name: string;
  readonly doc: VersionedLayout;
  readonly migrators: readonly Migrator[];
  readonly target?: SchemaVersion;
  readonly expected: LayoutExpectation;
}

/** One vector's verdict, collected into a {@link ConformanceReport}. */
export interface VectorResult {
  /** The contract group, e.g. `manifest-schema`, `context-subset`. */
  readonly group: string;
  readonly name: string;
  readonly ok: boolean;
  /** Present only when `ok` is false: what was expected versus produced. */
  readonly detail?: string;
}

/**
 * The result of {@link import('./runner.js').runConformanceVectors}: a
 * framework-agnostic report a consumer asserts on with one `expect`.
 */
export interface ConformanceReport {
  readonly ok: boolean;
  readonly total: number;
  readonly passed: number;
  readonly results: readonly VectorResult[];
  /** One-line human summary, suitable as an assertion message. */
  readonly summary: string;
  /** Newline-joined detail of every failure; empty string when `ok`. */
  readonly failures: string;
}
