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

// ---------------------------------------------------------------------------
// Runtime page-context values (the value side of the §3.2 type grammar).
//
// The types above describe the *shape* a slot is declared to hold; the types
// below are the *runtime values* a host actually supplies. A page's declared
// {@link ContextMap} and the {@link PageContext} it hands to a widget are two
// halves of the same contract — {@link matchesContextMap} relates them the way
// {@link isContextSubset} relates two declarations. (Issue #37: `HostSDK.context`
// in the sdk types against {@link PageContext}.)
// ---------------------------------------------------------------------------

/**
 * The runtime value for a `record-ref` slot: a host record identified by its
 * kind and id.
 *
 * As with {@link RecordRefContextType}, `protocol` owns this *shape* only — the
 * host owns the domain vocabulary. `recordType` is the same opaque, host-declared
 * string the matching type carries (matched by equality); `id` is the host's
 * opaque identifier for the record, treated as a plain string here.
 *
 * SPEC §3.2 fixes the type grammar but not a record-ref *value* shape, so this
 * `{ recordType, id }` is protocol's minimal canonical form.
 */
export interface RecordRefValue {
  /** The host-declared record kind; equals the slot type's `recordType`. */
  readonly recordType: string;
  /** The host's opaque identifier for the referenced record. */
  readonly id: string;
}

/**
 * A structural object context *value*: named fields, each itself a
 * {@link ContextValue}. The value counterpart of {@link ObjectContextType}; a
 * value may carry additional fields beyond those its type declares (the same
 * structural rule {@link isContextSubset} applies to declarations).
 */
export type ObjectValue = { readonly [field: string]: ContextValue };

/**
 * A runtime context value: the value side of a {@link ContextType}.
 *
 * The mapping from declared type to runtime value:
 * - `record-ref` → {@link RecordRefValue};
 * - `string` and `id` → a `string` (both are strings at runtime — the declared
 *   type, not the value, distinguishes an opaque identifier from free text);
 * - `number` → a finite `number` (a wire value: no `NaN`/`Infinity`);
 * - `bool` → a `boolean`;
 * - `list<T>` → a `readonly ContextValue[]` whose elements match `T`;
 * - `object<…>` → an {@link ObjectValue} whose fields match.
 */
export type ContextValue =
  | RecordRefValue
  | string
  | number
  | boolean
  | readonly ContextValue[]
  | ObjectValue;

/**
 * The runtime page context a host provides to widgets: a map of slot keys to
 * their {@link ContextValue}. The value-side counterpart of {@link ContextMap}
 * (which declares the *types* of those slots); the sdk's `HostSDK.context` is a
 * `PageContext`. {@link matchesContextMap} checks a `PageContext` against the
 * `ContextMap` a page-type or widget declares.
 */
export type PageContext = { readonly [key: string]: ContextValue };

/**
 * Whether a runtime `value` conforms to a declared context `type` (SPEC §3.2).
 *
 * Discriminates on the declared `type` (never on the value's own shape):
 * - `record-ref` — an object with a matching `recordType` and a string `id`;
 * - `string` / `id` — any string;
 * - `number` — a finite number (`NaN`/`Infinity` are not conformant values);
 * - `bool` — a boolean;
 * - `list<T>` — an array whose every element conforms to `T`;
 * - `object<…>` — an object whose declared fields each conform (surplus fields
 *   are ignored, mirroring {@link isContextSubset}).
 *
 * Pure, total and deterministic: no I/O, and never throws on a well-typed
 * {@link ContextValue}.
 */
export function matchesContextType(value: ContextValue, type: ContextType): boolean {
  switch (type.type) {
    case 'record-ref':
      return isRecordRefValue(value) && value.recordType === type.recordType;
    case 'string':
    case 'id':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'bool':
      return typeof value === 'boolean';
    case 'list':
      return Array.isArray(value) && value.every((element) => matchesContextType(element, type.element));
    case 'object':
      return isObjectValue(value) && matchesContextMap(value, type.fields);
  }
}

/**
 * Whether a runtime {@link PageContext} satisfies a declared {@link ContextMap}
 * — the value-side counterpart of {@link isContextSubset} (SPEC §3.2).
 *
 * Returns `true` when every key `contextMap` declares is present in `context`
 * with a value that {@link matchesContextType matches} its declared type. The
 * context may carry *more* keys than are declared — surplus context is always
 * safe to ignore, so it never fails the check.
 *
 * Pure, total and deterministic: no I/O, and never throws on well-formed input.
 */
export function matchesContextMap(context: PageContext, contextMap: ContextMap): boolean {
  for (const [key, type] of Object.entries(contextMap)) {
    const value = context[key];
    if (value === undefined) return false; // declared key absent from the context
    if (!matchesContextType(value, type)) return false;
  }
  return true;
}

/** Whether a value is a plain (non-array, non-null) object — an {@link ObjectValue}. */
function isObjectValue(value: ContextValue): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a value has the {@link RecordRefValue} shape: string `recordType` and `id`. */
function isRecordRefValue(value: ContextValue): value is RecordRefValue {
  return isObjectValue(value) && typeof value.recordType === 'string' && typeof value.id === 'string';
}
