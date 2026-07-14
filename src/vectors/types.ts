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
 * Phase A carries the **type** vectors (manifest schema + tag/capability
 * grammar, page-context subset, LayoutDoc migration). Phase B (P-E2) adds the
 * **wire-format** vectors for the sign/verify byte path — canonical-bytes
 * ({@link CanonWireVector}, {@link CanonMalleabilityVector}) and content-hash
 * ({@link HashWireVector}, including the tampered `hash-mismatch` negative). The
 * later signature/log/root/freshness negatives (P-E4) join the same corpus.
 */

import type { ContextMap, PageContext } from '../types/context.js';
import type { HashVerdict, MultihashString } from '../verify/index.js';
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
  readonly grantsCapability?: (declared: Capability, required: Capability) => boolean;
  readonly isDevProxySdkRequest?: (value: unknown) => boolean;
  readonly isDevProxySdkResponse?: (value: unknown) => boolean;
  /**
   * Canonicalize a JSON value to its RFC-8785 bytes. Drives the sync canon-wire
   * group; defaults to {@link import('../canon/canonicalize.js').canonicalize}.
   */
  readonly canonicalize?: (value: unknown) => Uint8Array;
  /**
   * SHA-256 the exact bytes to a `sha2-256:<hex>` multihash. Used for the
   * positive digest assertion of the hash-wire group (async); defaults to
   * {@link import('../verify/hash/hash.js').hashBytes}.
   */
  readonly hashBytes?: (bytes: Uint8Array) => Promise<MultihashString>;
  /**
   * Check bytes against an untrusted expected hash, returning a stable verdict.
   * Drives the hash-wire group (async — see `runConformanceVectorsAsync`);
   * defaults to {@link import('../verify/hash/hash.js').verifyHash}.
   */
  readonly verifyHash?: (bytes: Uint8Array, expected: string) => Promise<HashVerdict>;
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

/**
 * A scope-prefix **grant** vector: does a single `declared` capability grant
 * `required` under {@link import('../types/manifest/capability.js').grantsCapability}?
 */
export interface CapabilityGrantVector {
  readonly name: string;
  readonly declared: Capability;
  readonly required: Capability;
  readonly grants: boolean;
}

/**
 * A dev-proxy wire-**request** guard vector: is `value` a well-formed
 * {@link import('../types/dev-proxy.js').DevProxySdkRequest}?
 */
export interface DevProxyRequestVector {
  readonly name: string;
  readonly value: unknown;
  readonly valid: boolean;
}

/**
 * A dev-proxy wire-**response** guard vector: is `value` a well-formed
 * {@link import('../types/dev-proxy.js').DevProxySdkResponse}?
 */
export interface DevProxyResponseVector {
  readonly name: string;
  readonly value: unknown;
  readonly valid: boolean;
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

/**
 * A canonicalization **wire** vector: a JSON `value` and the exact canonical
 * bytes it must produce, hex-encoded (lowercase, UTF-8) so the fixture pins the
 * signed byte form byte-for-byte. Drives `canonicalize` in the runner.
 */
export interface CanonWireVector {
  readonly name: string;
  readonly value: unknown;
  /** Lowercase-hex UTF-8 of the RFC-8785 canonical form of `value`. */
  readonly canonicalHex: string;
  readonly note?: string;
}

/**
 * A canonicalization **malleability** vector: several source JSON *texts* that
 * differ only in key order, insignificant whitespace, or escape spelling and so
 * must all `JSON.parse` + `canonicalize` to the single byte sequence
 * `canonicalHex`. The guard that closes signature malleability (SPEC §4).
 */
export interface CanonMalleabilityVector {
  readonly name: string;
  /** Source JSON documents, each parsed then canonicalized. */
  readonly jsonVariants: readonly string[];
  /** The one canonical form every variant must collapse to (lowercase-hex UTF-8). */
  readonly canonicalHex: string;
  readonly note?: string;
}

/**
 * A content-hash **wire** vector: bytes (`inputHex`) checked against an untrusted
 * `expected` hash string, asserting the required {@link HashVerdictReason}. A
 * `reason: 'ok'` vector additionally pins `hashBytes(bytes) === expected`; the
 * `reason: 'hash-mismatch'` vector is the tampered-byte negative (SPEC §7).
 */
export interface HashWireVector {
  readonly name: string;
  /** Lowercase-hex of the exact bytes to hash (allows empty and non-UTF-8). */
  readonly inputHex: string;
  /** The untrusted expected hash string checked against `inputHex`. */
  readonly expected: string;
  /** The stable verdict a conforming `verifyHash` must return. */
  readonly reason: HashVerdict['reason'];
  readonly note?: string;
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
