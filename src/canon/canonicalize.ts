/**
 * RFC-8785 / JCS deterministic JSON canonicalization.
 *
 * Given a JSON value this emits the single canonical byte sequence that gets
 * hashed and signed (docs/SPEC.md §4, §7): object members ordered by UTF-16
 * code-unit key sort, ECMA-262 `Number::toString` number formatting, minimal
 * string escaping, and no insignificant whitespace. Two values that differ only
 * in key order or whitespace produce byte-identical output, which is what closes
 * the signature-malleability gap — the bytes a publisher signs are the bytes a
 * verifier reconstructs.
 *
 * Dependency decision (SPEC §8 — audited dependency on the verify path): this is
 * an in-house zero-dependency implementation rather than a pinned third-party
 * canonicalizer. RFC-8785 number formatting is defined to be exactly ECMAScript
 * `Number::toString`, which V8/`String(n)` already implements, and RFC-8785
 * string escaping is the same table `JSON.stringify` uses — so the correct
 * surface is small and fully self-contained. It is held at 100% line/branch
 * coverage (GW-D20 gate) and validated against the upstream JCS conformance
 * suite (see `test/vectors/canon/`). Fall back to pinning a reviewed package
 * only if a number-formatting corner is found that `String(n)` gets wrong.
 *
 * Pure and isomorphic: no I/O, no key handling, no clock. Input must be a JSON
 * value (the shape `JSON.parse` produces). Anything outside the JSON data model
 * is rejected rather than silently coerced — the signing path must never sign
 * bytes the caller did not mean: `undefined`, functions, symbols, and `bigint`
 * throw; `NaN`/`Infinity` throw; circular references throw. `-0` canonicalizes
 * to `0` per `Number::toString`.
 */

/** Why a value could not be canonicalized. */
export type CanonicalizationErrorCode =
  | 'unsupported-type'
  | 'non-finite-number'
  | 'circular-reference';

/** Thrown when a value is outside the JSON data model and cannot be canonicalized. */
export class CanonicalizationError extends Error {
  override readonly name = 'CanonicalizationError';
  /** Machine-readable reason. */
  readonly code: CanonicalizationErrorCode;
  /** JSON-pointer-style location of the offending node (`''` is the root). */
  readonly path: string;

  constructor(code: CanonicalizationErrorCode, message: string, path: string) {
    super(path === '' ? message : `${message} (at ${path})`);
    this.code = code;
    this.path = path;
  }
}

// RFC-8785 §3.2.2.2: control characters with a defined two-character escape.
// All other C0 controls (U+0000–U+001F) use the \u00xx form; `"` and `\` are
// escaped; every other code unit — including all non-ASCII — is emitted
// literally and encoded as UTF-8 at the end.
const SHORT_ESCAPES: Readonly<Record<number, string>> = {
  0x08: '\\b',
  0x09: '\\t',
  0x0a: '\\n',
  0x0c: '\\f',
  0x0d: '\\r',
  0x22: '\\"',
  0x5c: '\\\\',
};

function serializeString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const short = SHORT_ESCAPES[code];
    if (short !== undefined) {
      out += short;
    } else if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      out += value.charAt(i);
    }
  }
  return `${out}"`;
}

function serializeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError('non-finite-number', `${String(value)} is not a valid JSON number`, path);
  }
  // ECMA-262 Number::toString(10) is exactly the RFC-8785 §3.2.2.3 number rule,
  // and it maps both +0 and -0 to "0".
  return String(value);
}

function serialize(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return serializeNumber(value, path);
    case 'string':
      return serializeString(value);
    case 'object':
      return serializeContainer(value, path, ancestors);
    default:
      // undefined, function, symbol, bigint — outside the JSON data model.
      throw new CanonicalizationError('unsupported-type', `${typeof value} is not a JSON value`, path);
  }
}

function serializeContainer(value: object, path: string, ancestors: Set<object>): string {
  if (ancestors.has(value)) {
    throw new CanonicalizationError('circular-reference', 'circular reference', path);
  }
  ancestors.add(value);
  let out: string;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      parts.push(serialize(value[i], `${path}/${i}`, ancestors));
    }
    out = `[${parts.join(',')}]`;
  } else {
    const record = value as Record<string, unknown>;
    // Default string sort compares UTF-16 code units, which is the RFC-8785
    // §3.2.3 member ordering.
    const parts = Object.keys(record)
      .sort()
      .map((key) => `${serializeString(key)}:${serialize(record[key], `${path}/${key}`, ancestors)}`);
    out = `{${parts.join(',')}}`;
  }
  ancestors.delete(value);
  return out;
}

/**
 * Canonicalize a JSON value to its RFC-8785 string form.
 *
 * @throws {CanonicalizationError} if the value is outside the JSON data model
 *   (`undefined`/function/symbol/`bigint`), a non-finite number, or contains a
 *   circular reference.
 */
export function canonicalizeToString(value: unknown): string {
  return serialize(value, '', new Set<object>());
}

/**
 * Canonicalize a JSON value to its RFC-8785 canonical bytes (UTF-8). These are
 * the exact bytes to hash and sign.
 *
 * @throws {CanonicalizationError} see {@link canonicalizeToString}.
 */
export function canonicalize(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeToString(value));
}
