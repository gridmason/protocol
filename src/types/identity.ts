/**
 * Source-qualified widget identity (docs/SPEC.md §3.3, core §4).
 *
 * A widget is identified by a `(source, tag)` pair — **never by `tag` alone**.
 * The same custom-element `tag` served by two different sources is two distinct
 * widgets, so every comparison in this module keys on both halves. `source` is a
 * structured string with three kinds:
 *
 * - `local`                     — bundled with the host; no registry.
 * - `sideload:<origin>`         — loaded ad hoc from `<origin>` (dev / trusted side-load).
 * - `<registry id>`             — published to and resolved from a named registry
 *                                 (e.g. `registry.gridmason.dev`).
 *
 * These are pure functions with no runtime dependencies.
 */

/** The three kinds a widget `source` string can denote. */
export type SourceKind = 'local' | 'sideload' | 'registry';

/** A `source` string parsed into its kind and identifying component. */
export type ParsedSource =
  | { readonly kind: 'local' }
  | { readonly kind: 'sideload'; readonly origin: string }
  | { readonly kind: 'registry'; readonly registryId: string };

/**
 * A source-qualified widget identity: the `widgetID` carried by every
 * {@link LayoutWidget}. Equality and ordering treat `source` and `tag` together
 * (see {@link widgetIdEqual}); a bare `tag` is not an identity.
 */
export interface WidgetID {
  /** A `local` / `sideload:<origin>` / registry-id source string. */
  readonly source: string;
  /** The custom-element tag (publisher-prefixed, lowercase — manifest §3.1). */
  readonly tag: string;
}

/** The literal `source` value for a host-bundled widget. */
export const LOCAL_SOURCE = 'local';

/** Prefix marking a `sideload:<origin>` source. */
export const SIDELOAD_PREFIX = 'sideload:';

/** Stable ordering of the three source kinds, used by {@link compareSources}. */
const KIND_RANK: Readonly<Record<SourceKind, number>> = {
  local: 0,
  registry: 1,
  sideload: 2,
};

/**
 * Parse a `source` string into its {@link ParsedSource} form.
 *
 * `sideload` origins are canonicalized by stripping any trailing slash so that
 * `sideload:https://a.example` and `sideload:https://a.example/` compare equal.
 * Registry ids are returned unchanged.
 *
 * @throws TypeError if `source` is empty, or a `sideload:` prefix with no origin.
 */
export function parseSource(source: string): ParsedSource {
  if (source === LOCAL_SOURCE) return { kind: 'local' };
  if (source.startsWith(SIDELOAD_PREFIX)) {
    const raw = source.slice(SIDELOAD_PREFIX.length);
    if (raw === '') {
      throw new TypeError(`sideload source has no origin: ${JSON.stringify(source)}`);
    }
    return { kind: 'sideload', origin: normalizeOrigin(raw) };
  }
  if (source === '') throw new TypeError('widget source must be a non-empty string');
  return { kind: 'registry', registryId: source };
}

/**
 * Classify a `source` string.
 *
 * @throws TypeError on a malformed source (see {@link parseSource}).
 */
export function sourceKind(source: string): SourceKind {
  return parseSource(source).kind;
}

/**
 * Canonical string form of a `source`: the input reduced to a stable
 * representative (`sideload` origins normalized). Two equal sources share one
 * canonical form, so it is safe to use as a map/set key component.
 *
 * @throws TypeError on a malformed source (see {@link parseSource}).
 */
export function canonicalSource(source: string): string {
  const parsed = parseSource(source);
  switch (parsed.kind) {
    case 'local':
      return LOCAL_SOURCE;
    case 'sideload':
      return SIDELOAD_PREFIX + parsed.origin;
    case 'registry':
      return parsed.registryId;
  }
}

/**
 * Whether two `source` strings denote the same source. Total — never throws:
 * identical strings are equal by fast path, and any source that cannot be parsed
 * is equal only to a byte-identical string.
 */
export function sourcesEqual(a: string, b: string): boolean {
  if (a === b) return true;
  let pa: ParsedSource;
  let pb: ParsedSource;
  try {
    pa = parseSource(a);
    pb = parseSource(b);
  } catch {
    return false;
  }
  if (pa.kind !== pb.kind) return false;
  switch (pa.kind) {
    case 'local':
      return true;
    case 'sideload':
      return pa.origin === (pb as { origin: string }).origin;
    case 'registry':
      return pa.registryId === (pb as { registryId: string }).registryId;
  }
}

/** The identifying component of a parsed source (`''` for `local`). */
function identifierOf(parsed: ParsedSource): string {
  switch (parsed.kind) {
    case 'local':
      return '';
    case 'sideload':
      return parsed.origin;
    case 'registry':
      return parsed.registryId;
  }
}

/**
 * Total ordering over `source` strings: by kind (`local` < `registry` <
 * `sideload`), then by identifying component. Never throws; unparseable sources
 * fall back to raw string comparison.
 */
export function compareSources(a: string, b: string): number {
  if (a === b) return 0;
  let pa: ParsedSource | undefined;
  let pb: ParsedSource | undefined;
  try {
    pa = parseSource(a);
  } catch {
    pa = undefined;
  }
  try {
    pb = parseSource(b);
  } catch {
    pb = undefined;
  }
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0;
  if (pa.kind !== pb.kind) return KIND_RANK[pa.kind] - KIND_RANK[pb.kind];
  const ia = identifierOf(pa);
  const ib = identifierOf(pb);
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

/**
 * Whether two widget identities are the same: equal `tag` **and** equal
 * `source`. Two widgets sharing a `tag` but differing in `source` (e.g. `local`
 * vs a registry, or two different `sideload` origins) are **not** the same
 * identity. Total — never throws.
 */
export function widgetIdEqual(a: WidgetID, b: WidgetID): boolean {
  return a.tag === b.tag && sourcesEqual(a.source, b.source);
}

/**
 * Total ordering over widget identities: by `source` (see
 * {@link compareSources}), then by `tag`. Suitable for `Array.prototype.sort`.
 */
export function compareWidgetIds(a: WidgetID, b: WidgetID): number {
  const bySource = compareSources(a.source, b.source);
  if (bySource !== 0) return bySource;
  return a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0;
}

/**
 * A stable string key for a widget identity, for use in `Map`/`Set`. Encodes
 * both `source` (canonicalized) and `tag` separated by NUL so distinct
 * identities can never collide — reinforcing that `tag` alone is not identity.
 */
export function widgetIdKey(id: WidgetID): string {
  let source: string;
  try {
    source = canonicalSource(id.source);
  } catch {
    source = id.source;
  }
  return `${source}\u0000${id.tag}`;
}

/** Canonicalize a `sideload` origin: strip any trailing slash. Pure, no globals. */
function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}
