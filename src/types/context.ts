/**
 * Typed page-context contracts (docs/SPEC.md §3.2).
 *
 * `protocol` owns the *shape* of a context type, never the domain vocabulary:
 * hosts declare their own `recordType` strings (`customer`, `team`, …) and this
 * package treats them as opaque, caller-supplied identifiers.
 *
 * Both a page-type's provided context and a widget's `requiresContext` are
 * values of the same shape — a {@link ContextMap}. The exported
 * {@link isContextSubset} relates the two (`requiresContext ⊆ pageContext`) and
 * is the single implementation picker-gating and layout-resolution share
 * (docs/SPEC.md §3.2, core §6).
 */

/** A context slot typed as a reference to a host-declared record kind. */
export interface RecordRefContextType {
  readonly type: 'record-ref';
  /**
   * Host-declared domain vocabulary. Protocol owns the shape, not the value —
   * any non-empty string a host registers is accepted; matching is by equality.
   */
  readonly recordType: string;
}

/** A context slot typed as a plain string value. */
export interface StringContextType {
  readonly type: 'string';
}

/** A context slot typed as a numeric value. */
export interface NumberContextType {
  readonly type: 'number';
}

/** A context slot typed as a boolean value. */
export interface BoolContextType {
  readonly type: 'bool';
}

/** A context slot typed as an opaque identifier. */
export interface IdContextType {
  readonly type: 'id';
}

/** The scalar context type primitives (SPEC §3.2). */
export type PrimitiveContextType =
  | RecordRefContextType
  | StringContextType
  | NumberContextType
  | BoolContextType
  | IdContextType;

/**
 * Composite: a homogeneous list. Matched by its element type — a required
 * `list<T>` is satisfied by a provided `list<U>` iff `T ⊆ U`.
 */
export interface ListContextType {
  readonly type: 'list';
  readonly element: ContextType;
}

/**
 * Composite: a structural record of named fields. Matched per field using the
 * same subset rule as a top-level {@link ContextMap} — the provided object may
 * declare additional fields.
 */
export interface ObjectContextType {
  readonly type: 'object';
  readonly fields: ContextMap;
}

/** The composite context types (SPEC §3.2). */
export type CompositeContextType = ListContextType | ObjectContextType;

/** Any declared context type: a primitive or a composite. */
export type ContextType = PrimitiveContextType | CompositeContextType;

/**
 * A map of context keys to their declared types. A page-type declares the
 * context it provides as a `ContextMap`; a widget declares the context it needs
 * (`requiresContext`) as a `ContextMap`. {@link isContextSubset} relates them.
 */
export type ContextMap = { readonly [key: string]: ContextType };

/**
 * `requiresContext ⊆ pageContext` — the page-context subset check (SPEC §3.2).
 *
 * Returns `true` when every key `requiresContext` declares is present in
 * `pageContext` with a matching type. The page may declare *more* keys (and its
 * objects *more* fields) than are required — surplus context is always safe to
 * ignore, so it never fails the check.
 *
 * Type matching per SPEC §3.2:
 * - primitives must share the same `type`;
 * - `record-ref` additionally requires an equal `recordType`;
 * - `list<T>` matches by element type (`T` must be a subset of the provided
 *   element type);
 * - `object<…>` matches per field (each required field must be a subset of the
 *   provided object's same-named field).
 *
 * Pure, total and deterministic: no I/O, and never throws on well-formed input.
 */
export function isContextSubset(requiresContext: ContextMap, pageContext: ContextMap): boolean {
  for (const [key, required] of Object.entries(requiresContext)) {
    const provided = pageContext[key];
    if (provided === undefined) return false; // required key absent from the page
    if (!isContextTypeSubset(required, provided)) return false;
  }
  return true;
}

/** Single-slot subset relation; recurses through composites. */
function isContextTypeSubset(required: ContextType, provided: ContextType): boolean {
  switch (required.type) {
    case 'record-ref':
      return provided.type === 'record-ref' && required.recordType === provided.recordType;
    case 'string':
    case 'number':
    case 'bool':
    case 'id':
      return provided.type === required.type;
    case 'list':
      return provided.type === 'list' && isContextTypeSubset(required.element, provided.element);
    case 'object':
      return provided.type === 'object' && isContextSubset(required.fields, provided.fields);
  }
}
