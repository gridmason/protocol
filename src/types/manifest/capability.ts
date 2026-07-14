/**
 * Capability grammar (docs/SPEC.md §3.1). A capability is `<api>[:<scope>]`,
 * where `scope` is a colon-delimited path (`recordType:customer`,
 * `net:api.acme.com`, `events:acme.sales`). The v1 `api` values are fixed; an
 * unknown api is rejected rather than guessed.
 *
 * This is the single implementation both `cli lint` and registry review import,
 * so its verdicts are stable and enumerated — callers switch on the error codes,
 * they do not parse messages.
 */

/** The `api` values defined in v1. Any other api is rejected. */
export const CAPABILITY_APIS = ['records.read', 'records.write', 'net', 'events'] as const;

/** One of the v1 capability apis. */
export type CapabilityApi = (typeof CAPABILITY_APIS)[number];

/**
 * The object form of a capability as it appears in a manifest's `capabilities`
 * array. The string form `<api>[:<scope>]` is what `parseCapability` reads and
 * `formatCapability` writes.
 */
export interface Capability {
  /** One of the v1 apis (see `CAPABILITY_APIS`). */
  api: CapabilityApi;
  /** Colon-delimited scope path, or omitted for an unscoped capability. */
  scope?: string;
}

/** Enumerated reasons a capability string or object is rejected. */
export type CapabilityError =
  /** The input was the empty string. */
  | 'empty'
  /** The api segment (before the first colon) was empty. */
  | 'empty-api'
  /** The api segment is not one of the v1 {@link CAPABILITY_APIS}. */
  | 'unknown-api'
  /** A scope segment between colons was empty (e.g. `net:`, `records.read:a::b`). */
  | 'empty-scope-segment';

/** Successful parse of a capability string. */
export interface ParsedCapability {
  api: CapabilityApi;
  /** The raw scope path, or `undefined` when the capability is unscoped. */
  scope: string | undefined;
  /** The scope split on `:`; empty when the capability is unscoped. */
  scopePath: string[];
}

/** Result of {@link parseCapability}: a discriminated union, never throws. */
export type CapabilityParseResult =
  | ({ ok: true } & ParsedCapability)
  | { ok: false; error: CapabilityError };

function isCapabilityApi(value: string): value is CapabilityApi {
  return (CAPABILITY_APIS as readonly string[]).includes(value);
}

/**
 * Parse a capability string `<api>[:<scope>]` into its api and scope path.
 * The api is the substring before the first colon (so `records.read`, which
 * contains a dot, is preserved); everything after is the colon-delimited scope.
 */
export function parseCapability(input: string): CapabilityParseResult {
  if (input.length === 0) return { ok: false, error: 'empty' };

  const firstColon = input.indexOf(':');
  const api = firstColon === -1 ? input : input.slice(0, firstColon);
  const scope = firstColon === -1 ? undefined : input.slice(firstColon + 1);

  if (api.length === 0) return { ok: false, error: 'empty-api' };
  if (!isCapabilityApi(api)) return { ok: false, error: 'unknown-api' };

  if (scope === undefined) return { ok: true, api, scope: undefined, scopePath: [] };

  const scopePath = scope.split(':');
  if (scopePath.some((segment) => segment.length === 0)) {
    return { ok: false, error: 'empty-scope-segment' };
  }
  return { ok: true, api, scope, scopePath };
}

/**
 * Validate the object form of a capability. Returns `undefined` when valid, or
 * the enumerated {@link CapabilityError} otherwise — the same codes
 * {@link parseCapability} returns, so both entry points agree.
 */
export function validateCapability(capability: Capability): CapabilityError | undefined {
  if (!isCapabilityApi(capability.api)) return 'unknown-api';
  if (capability.scope === undefined) return undefined;
  if (capability.scope.length === 0) return 'empty-scope-segment';
  if (capability.scope.split(':').some((segment) => segment.length === 0)) {
    return 'empty-scope-segment';
  }
  return undefined;
}

/** Serialize a capability object back to its `<api>[:<scope>]` string form. */
export function formatCapability(capability: Capability): string {
  return capability.scope === undefined
    ? capability.api
    : `${capability.api}:${capability.scope}`;
}

/**
 * Whether a single **declared** capability grants a **required** one under the
 * scope-prefix containment rule (docs/SPEC.md §3.1, §5–§6): the apis must be
 * equal and the declared scope path must be a **prefix** of the required one. An
 * unscoped declaration grants every scope of its api; `records.read:recordType`
 * grants every record type; `records.read:recordType:customer` grants only
 * `customer`. This is `min(user, widget)` containment expressed for one pair —
 * a host's SDK gate, the CLI's `--proxy` enforcement, and the SDK fixture handle
 * all apply it, so promoting the one definition here keeps them from drifting.
 * A caller with a list tests `declared.some((cap) => grantsCapability(cap, req))`.
 * Pure; never throws.
 */
export function grantsCapability(declared: Capability, required: Capability): boolean {
  if (declared.api !== required.api) return false;
  return isScopePrefix(scopePathOf(declared), scopePathOf(required));
}

/** A capability's scope split into a path, or the empty path when unscoped. */
function scopePathOf(capability: Capability): string[] {
  return capability.scope === undefined ? [] : capability.scope.split(':');
}

/** Whether `prefix` is a (possibly equal) leading slice of `path`. */
function isScopePrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, i) => segment === path[i]);
}
