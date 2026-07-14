import { describe, expect, test } from 'vitest';

import {
  canonicalize,
  canonicalizeToString,
  CanonicalizationError,
} from '../../src/canon/index.js';

// Unit coverage for the RFC-8785 canonicalizer (docs/SPEC.md §4, §7). The
// vendored JCS suite (vectors.test.ts) pins end-to-end conformance; this file
// nails down each primitive, the escaping/number/ordering rules, and every
// rejection path so the security-core 100% line/branch gate is met.

const utf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('primitives', () => {
  test('null and booleans', () => {
    expect(canonicalizeToString(null)).toBe('null');
    expect(canonicalizeToString(true)).toBe('true');
    expect(canonicalizeToString(false)).toBe('false');
  });

  test('empty containers', () => {
    expect(canonicalizeToString({})).toBe('{}');
    expect(canonicalizeToString([])).toBe('[]');
  });
});

describe('numbers — ECMA-262 Number::toString (RFC-8785 §3.2.2.3)', () => {
  test('integers and simple decimals', () => {
    expect(canonicalizeToString(0)).toBe('0');
    expect(canonicalizeToString(56)).toBe('56');
    expect(canonicalizeToString(-1)).toBe('-1');
    expect(canonicalizeToString(4.5)).toBe('4.5');
  });

  test('-0 canonicalizes to 0', () => {
    expect(canonicalizeToString(-0)).toBe('0');
  });

  test('exponential and precision corners from the JCS number corpus', () => {
    expect(canonicalizeToString(1e30)).toBe('1e+30');
    expect(canonicalizeToString(2e-3)).toBe('0.002');
    expect(canonicalizeToString(1e-27)).toBe('1e-27');
    // Sourced via JSON.parse — the literal loses precision to the shortest
    // round-trip double, which is exactly what Number::toString reproduces.
    expect(canonicalizeToString(JSON.parse('333333333.33333329'))).toBe('333333333.3333333');
  });

  test.each([NaN, Infinity, -Infinity])('non-finite %p is rejected', (value) => {
    expect(() => canonicalizeToString(value)).toThrow(CanonicalizationError);
    try {
      canonicalizeToString(value);
    } catch (err) {
      expect((err as CanonicalizationError).code).toBe('non-finite-number');
    }
  });
});

describe('strings — RFC-8785 §3.2.2.2 minimal escaping', () => {
  test('the short escape set', () => {
    expect(canonicalizeToString('\b\t\n\f\r"\\')).toBe('"\\b\\t\\n\\f\\r\\"\\\\"');
  });

  test('other C0 controls use lowercase \\u00xx; DEL and non-ASCII stay literal', () => {
    // U+000B (vertical tab) has no short escape; U+007F (DEL) is >= 0x20 so it
    // is NOT escaped; U+20AC / emoji are emitted literally as UTF-8.
    expect(canonicalizeToString('\v')).toBe('"\\u000b"');
    expect(canonicalizeToString('\x00')).toBe('"\\u0000"');
    expect(canonicalizeToString('\x7f')).toBe('"\x7f"');
    expect(canonicalizeToString('€')).toBe('"€"');
    expect(canonicalizeToString('/')).toBe('"/"');
    expect(canonicalizeToString('\u{1f602}')).toBe('"\u{1f602}"');
  });

  test('no Unicode normalization — combining marks pass through', () => {
    // "A" + U+030A (combining ring), NOT folded to the precomposed U+00C5.
    expect(canonicalizeToString('Å')).toBe('"Å"');
  });
});

describe('object member ordering — UTF-16 code-unit key sort (§3.2.3)', () => {
  test('numeric-looking and lexical keys sort by code unit, not value', () => {
    expect(canonicalizeToString({ b: 1, a: 2, '10': 3, '1': 4 })).toBe('{"1":4,"10":3,"a":2,"b":1}');
  });

  test('key order and whitespace do not change the bytes', () => {
    const a = JSON.parse('{ "b": 1, "a": [2,   3] , "c": {"y":1,"x":2} }') as unknown;
    const b = JSON.parse('{"c":{"x":2,"y":1},"a":[2,3],"b":1}') as unknown;
    expect(canonicalizeToString(a)).toBe(canonicalizeToString(b));
    expect(Buffer.from(canonicalize(a)).equals(Buffer.from(canonicalize(b)))).toBe(true);
  });

  test('nested arrays and objects', () => {
    expect(canonicalizeToString([1, { z: [true, null], a: 'x' }])).toBe('[1,{"a":"x","z":[true,null]}]');
  });
});

describe('canonicalize — byte output', () => {
  test('returns UTF-8 bytes matching the string form', () => {
    const value = { greeting: 'héllo', n: [1, 2] };
    const bytes = canonicalize(value);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(utf8(bytes)).toBe(canonicalizeToString(value));
    expect(utf8(bytes)).toBe('{"greeting":"héllo","n":[1,2]}');
  });
});

describe('rejections — values outside the JSON data model', () => {
  test.each([
    ['undefined', undefined],
    ['function', () => 0],
    ['symbol', Symbol('s')],
    ['bigint', 10n],
  ])('%s at the root throws unsupported-type', (_label, value) => {
    try {
      canonicalizeToString(value);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalizationError);
      expect((err as CanonicalizationError).code).toBe('unsupported-type');
      expect((err as CanonicalizationError).path).toBe('');
    }
  });

  test('unsupported value inside an object reports its path', () => {
    try {
      canonicalizeToString({ ok: 1, bad: undefined });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalizationError);
      const e = err as CanonicalizationError;
      expect(e.code).toBe('unsupported-type');
      expect(e.path).toBe('/bad');
      expect(e.message).toContain('/bad');
    }
  });

  test('unsupported value inside an array reports its index path', () => {
    try {
      canonicalizeToString([1, undefined]);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as CanonicalizationError).path).toBe('/1');
    }
  });
});

describe('rejections — circular references', () => {
  test('self-referential object', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    try {
      canonicalizeToString(obj);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as CanonicalizationError).code).toBe('circular-reference');
      expect((err as CanonicalizationError).path).toBe('/self');
    }
  });

  test('cycle through an array', () => {
    const arr: unknown[] = [1];
    arr.push(arr);
    expect(() => canonicalizeToString(arr)).toThrow(CanonicalizationError);
  });

  test('a shared but acyclic reference (DAG) is allowed', () => {
    const shared = { v: 1 };
    expect(canonicalizeToString({ a: shared, b: shared })).toBe('{"a":{"v":1},"b":{"v":1}}');
    expect(canonicalizeToString([shared, shared])).toBe('[{"v":1},{"v":1}]');
  });
});

describe('CanonicalizationError', () => {
  test('is an Error with a stable name and no path prefix at the root', () => {
    const err = new CanonicalizationError('unsupported-type', 'boom', '');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CanonicalizationError');
    expect(err.message).toBe('boom');
    expect(err.path).toBe('');
  });

  test('appends the path to the message when nested', () => {
    const err = new CanonicalizationError('circular-reference', 'boom', '/a/0');
    expect(err.message).toBe('boom (at /a/0)');
  });
});
