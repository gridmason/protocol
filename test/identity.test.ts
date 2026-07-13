import { describe, expect, test } from 'vitest';

import {
  type WidgetID,
  canonicalSource,
  compareSources,
  compareWidgetIds,
  parseSource,
  sourceKind,
  sourcesEqual,
  widgetIdEqual,
  widgetIdKey,
} from '../src/types/identity.js';

describe('parseSource', () => {
  test('classifies the three source kinds', () => {
    expect(parseSource('local')).toEqual({ kind: 'local' });
    expect(parseSource('registry.gridmason.dev')).toEqual({
      kind: 'registry',
      registryId: 'registry.gridmason.dev',
    });
    expect(parseSource('sideload:https://widgets.acme.com')).toEqual({
      kind: 'sideload',
      origin: 'https://widgets.acme.com',
    });
  });

  test('strips a trailing slash on a sideload origin', () => {
    expect(parseSource('sideload:https://widgets.acme.com/')).toEqual({
      kind: 'sideload',
      origin: 'https://widgets.acme.com',
    });
  });

  test('keeps an otherwise-opaque sideload origin verbatim', () => {
    expect(parseSource('sideload:not a url')).toEqual({
      kind: 'sideload',
      origin: 'not a url',
    });
  });

  test('throws on an empty source or an origin-less sideload', () => {
    expect(() => parseSource('')).toThrow(TypeError);
    expect(() => parseSource('sideload:')).toThrow(TypeError);
  });
});

describe('sourceKind', () => {
  test('reports the kind', () => {
    expect(sourceKind('local')).toBe('local');
    expect(sourceKind('sideload:https://a.example')).toBe('sideload');
    expect(sourceKind('registry.example')).toBe('registry');
  });
});

describe('canonicalSource', () => {
  test('reduces equal sources to one representative', () => {
    expect(canonicalSource('local')).toBe('local');
    expect(canonicalSource('registry.example')).toBe('registry.example');
    expect(canonicalSource('sideload:https://a.example/')).toBe('sideload:https://a.example');
  });
});

describe('sourcesEqual', () => {
  test('distinguishes the three kinds even when tags would match', () => {
    expect(sourcesEqual('local', 'registry.example')).toBe(false);
    expect(sourcesEqual('local', 'sideload:https://a.example')).toBe(false);
    expect(sourcesEqual('registry.example', 'sideload:https://a.example')).toBe(false);
  });

  test('registry ids compare exactly', () => {
    expect(sourcesEqual('registry.a.example', 'registry.a.example')).toBe(true);
    expect(sourcesEqual('registry.a.example', 'registry.b.example')).toBe(false);
  });

  test('sideload compares by (normalized) origin', () => {
    expect(sourcesEqual('sideload:https://a.example', 'sideload:https://a.example/')).toBe(true);
    expect(sourcesEqual('sideload:https://a.example', 'sideload:https://b.example')).toBe(false);
  });

  test('is total: malformed sources are equal only to a byte-identical string', () => {
    expect(sourcesEqual('', '')).toBe(true);
    expect(sourcesEqual('', 'local')).toBe(false);
    expect(sourcesEqual('sideload:', 'sideload:')).toBe(true);
  });
});

describe('compareSources', () => {
  test('orders local < registry < sideload, then by identifier', () => {
    const sources = [
      'sideload:https://b.example',
      'registry.b',
      'local',
      'registry.a',
      'sideload:https://a.example',
    ];
    const sorted = [...sources].sort(compareSources);
    expect(sorted).toEqual([
      'local',
      'registry.a',
      'registry.b',
      'sideload:https://a.example',
      'sideload:https://b.example',
    ]);
  });

  test('is a total order and returns 0 for equal sources', () => {
    expect(compareSources('local', 'local')).toBe(0);
    expect(compareSources('sideload:https://a.example', 'sideload:https://a.example/')).toBe(0);
    // malformed sources fall back to raw comparison, still total and antisymmetric
    expect(compareSources('', 'sideload:')).toBeLessThan(0);
    expect(compareSources('sideload:', '')).toBeGreaterThan(0);
  });
});

describe('widgetIdEqual', () => {
  const base: WidgetID = { source: 'registry.gridmason.dev', tag: 'acme-chart' };

  test('same source + tag are equal', () => {
    expect(widgetIdEqual(base, { source: 'registry.gridmason.dev', tag: 'acme-chart' })).toBe(true);
  });

  test('same tag but different source are NOT equal (identity is source-qualified)', () => {
    expect(widgetIdEqual(base, { source: 'local', tag: 'acme-chart' })).toBe(false);
    expect(widgetIdEqual(base, { source: 'sideload:https://a.example', tag: 'acme-chart' })).toBe(false);
    expect(
      widgetIdEqual(
        { source: 'sideload:https://a.example', tag: 'acme-chart' },
        { source: 'sideload:https://b.example', tag: 'acme-chart' },
      ),
    ).toBe(false);
  });

  test('different tag, same source are NOT equal', () => {
    expect(widgetIdEqual(base, { source: 'registry.gridmason.dev', tag: 'acme-table' })).toBe(false);
  });
});

describe('compareWidgetIds', () => {
  test('orders by source then tag', () => {
    const ids: WidgetID[] = [
      { source: 'registry.gridmason.dev', tag: 'b' },
      { source: 'local', tag: 'z' },
      { source: 'registry.gridmason.dev', tag: 'a' },
    ];
    expect([...ids].sort(compareWidgetIds)).toEqual([
      { source: 'local', tag: 'z' },
      { source: 'registry.gridmason.dev', tag: 'a' },
      { source: 'registry.gridmason.dev', tag: 'b' },
    ]);
  });

  test('returns 0 for identical identities', () => {
    const id: WidgetID = { source: 'local', tag: 'x' };
    expect(compareWidgetIds(id, { ...id })).toBe(0);
  });
});

describe('widgetIdKey', () => {
  test('distinct identities get distinct keys; equal identities share a key', () => {
    const a = widgetIdKey({ source: 'local', tag: 'x' });
    const b = widgetIdKey({ source: 'registry.example', tag: 'x' });
    const aAgain = widgetIdKey({ source: 'local', tag: 'x' });
    expect(a).not.toBe(b);
    expect(a).toBe(aAgain);
  });

  test('a bare tag cannot collide across sources when used as a map key', () => {
    const seen = new Map<string, string>();
    seen.set(widgetIdKey({ source: 'local', tag: 'x' }), 'local-x');
    seen.set(widgetIdKey({ source: 'registry.example', tag: 'x' }), 'registry-x');
    expect(seen.size).toBe(2);
  });

  test('falls back to the raw source for a malformed source', () => {
    expect(widgetIdKey({ source: 'sideload:', tag: 'x' })).toContain('sideload:');
  });
});
