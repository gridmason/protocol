import { describe, expect, test } from 'vitest';

import { widgetIdEqual } from '../src/types/identity.js';
import {
  CURRENT_LAYOUT_SCHEMA_VERSION,
  type LayoutPage,
  type LayoutWidget,
  migrate,
} from '../src/types/layout.js';
import {
  POC_LAYOUTS_STORAGE_KEY,
  POC_SCHEMA_VERSION,
  importS7kLayoutPage,
  importS7kWidgetLayouts,
  s7kImportMigrator,
} from '../src/types/poc-import.js';
import { expectedV1 } from './vectors/s7k-importer/expected-v1.js';
import { pocLayouts } from './vectors/s7k-importer/poc-layouts.js';

/** Deep clone a plain JSON fixture (no `structuredClone`: ES2022-only surface). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Every widget in a page, flattened across the top grid and all tab grids. */
function allWidgets(page: LayoutPage): readonly LayoutWidget[] {
  return [...page.grid.items, ...page.tabs.flatMap((tab) => tab.grid.items)];
}

describe('provenance constants', () => {
  test('exposes the real POC localStorage key and its notional pre-v1 version', () => {
    expect(POC_LAYOUTS_STORAGE_KEY).toBe('$widgetLayouts');
    expect(POC_SCHEMA_VERSION).toBe(0);
    expect(POC_SCHEMA_VERSION).toBe(CURRENT_LAYOUT_SCHEMA_VERSION - 1);
  });
});

describe('importS7kWidgetLayouts — the $widgetLayouts array', () => {
  test('converts the sample payload to the expected LayoutDoc v1 documents', () => {
    const result = importS7kWidgetLayouts(pocLayouts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.docs).toEqual(expectedV1);
  });

  test('does not mutate the input payload', () => {
    const snapshot = clone(pocLayouts);
    importS7kWidgetLayouts(pocLayouts);
    expect(pocLayouts).toEqual(snapshot);
  });

  test('every imported document is a valid current-version LayoutDoc', () => {
    const result = importS7kWidgetLayouts(pocLayouts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const doc of result.docs) {
      // Schema version is the current baseline, so the migrate-on-read chain
      // accepts it as-is (same reference, nothing rewritten) — i.e. it is a
      // well-formed v1 document, not something the chain flags read-only.
      expect(doc.schemaVersion).toBe(CURRENT_LAYOUT_SCHEMA_VERSION);
      const migrated = migrate(doc);
      expect(migrated.readOnly).toBe(false);
      if (!migrated.readOnly) expect(migrated.doc).toBe(doc);

      // Identity is source-qualified and `i` is a string on every widget.
      for (const widget of allWidgets(doc)) {
        expect(widget.widgetID.source).toBe('local');
        expect(typeof widget.widgetID.tag).toBe('string');
        expect(widget.widgetID.tag.length).toBeGreaterThan(0);
        expect(typeof widget.i).toBe('string');
      }
    }
  });

  test('maps a bare component id to a source-qualified local widgetID', () => {
    const result = importS7kWidgetLayouts(pocLayouts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [salesChart] = result.docs[0]!.grid.items;
    expect(widgetIdEqual(salesChart!.widgetID, { source: 'local', tag: 'sales-chart' })).toBe(true);
  });

  test('coerces a numeric widgetID and i to strings', () => {
    const result = importS7kWidgetLayouts(pocLayouts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const note = result.docs[0]!.grid.items[1]!;
    expect(note.widgetID).toEqual({ source: 'local', tag: '42' });
    expect(note.i).toBe('7');
  });

  test('drops POC-only fields (per-node id, widget name/moved) and preserves props', () => {
    const result = importS7kWidgetLayouts(pocLayouts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = result.docs[0]!;
    expect(doc).not.toHaveProperty('id');
    expect(doc.grid).not.toHaveProperty('id');
    const [salesChart, note] = doc.grid.items;
    expect(salesChart).not.toHaveProperty('name');
    expect(salesChart).not.toHaveProperty('moved');
    expect(salesChart!.props).toEqual({ range: '90d' });
    expect(note).not.toHaveProperty('props'); // POC omitted it → stays absent
  });

  test('rejects a non-array payload with a not-an-array error', () => {
    const result = importS7kWidgetLayouts({ not: 'an array' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-an-array');
      expect(result.error.path).toBe('');
    }
  });

  test('reports the failing array index in the error path', () => {
    const bad = [clone(pocLayouts[0]), { page: 'x', name: 'y', default: true, hasTabs: false, grid: {}, tabs: [] }];
    const result = importS7kWidgetLayouts(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('wrong-type');
      expect(result.error.path).toBe('[1].grid.items');
    }
  });
});

describe('importS7kLayoutPage — a single page', () => {
  test('converts one page to the expected LayoutDoc v1', () => {
    const result = importS7kLayoutPage(pocLayouts[0]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(expectedV1[0]);
  });

  test('is total: malformed input yields a typed error, never throws', () => {
    const cases: ReadonlyArray<{ input: unknown; code: string; path: string }> = [
      { input: null, code: 'not-an-object', path: '' },
      { input: 42, code: 'not-an-object', path: '' },
      { input: [], code: 'not-an-object', path: '' }, // an array is not a page object
      { input: {}, code: 'missing-field', path: 'page' },
      { input: { page: 1, name: 'n', default: true, hasTabs: false, grid: { items: [] }, tabs: [] }, code: 'wrong-type', path: 'page' },
      { input: { page: 'p', name: 'n', default: 'yes', hasTabs: false, grid: { items: [] }, tabs: [] }, code: 'wrong-type', path: 'default' },
      { input: { page: 'p', name: 'n', default: true, hasTabs: false, grid: { items: [{}] }, tabs: [] }, code: 'missing-field', path: 'grid.items[0].widgetID' },
      { input: { page: 'p', name: 'n', default: true, hasTabs: false, grid: { items: [{ widgetID: '', i: 'a', x: 0, y: 0, w: 1, h: 1 }] }, tabs: [] }, code: 'empty-widget-id', path: 'grid.items[0].widgetID' },
      { input: { page: 'p', name: 'n', default: true, hasTabs: false, grid: { items: [{ widgetID: 'w', i: 'a', x: 'nope', y: 0, w: 1, h: 1 }] }, tabs: [] }, code: 'wrong-type', path: 'grid.items[0].x' },
      { input: { page: 'p', name: 'n', default: true, hasTabs: false, grid: { items: [{ widgetID: 'w', i: 'a', x: Number.NaN, y: 0, w: 1, h: 1 }] }, tabs: [] }, code: 'wrong-type', path: 'grid.items[0].x' },
      { input: { page: 'p', name: 'n', default: true, hasTabs: false, grid: { items: [{ widgetID: 'w', x: 0, y: 0, w: 1, h: 1 }] }, tabs: [] }, code: 'missing-field', path: 'grid.items[0].i' },
      { input: { page: 'p', name: 'n', default: true, hasTabs: false, grid: { items: [{ widgetID: 'w', i: 'a', x: 0, y: 0, w: 1, h: 1, props: 5 }] }, tabs: [] }, code: 'wrong-type', path: 'grid.items[0].props' },
      { input: { page: 'p', name: 'n', default: true, hasTabs: true, grid: { items: [] }, tabs: [{ name: 1, grid: { items: [] } }] }, code: 'wrong-type', path: 'tabs[0].name' },
      { input: { page: 'p', name: 'n', default: true, hasTabs: true, grid: { items: [] }, tabs: 'nope' }, code: 'wrong-type', path: 'tabs' },
    ];
    for (const { input, code, path } of cases) {
      let result!: ReturnType<typeof importS7kLayoutPage>;
      expect(() => {
        result = importS7kLayoutPage(input);
      }).not.toThrow();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(code);
        expect(result.error.path).toBe(path);
      }
    }
  });
});

describe('s7kImportMigrator — the declared migrator', () => {
  test('conforms to the Migrator interface and is keyed at the pre-v1 version', () => {
    expect(s7kImportMigrator.fromVersion).toBe(POC_SCHEMA_VERSION);
    expect(typeof s7kImportMigrator.migrate).toBe('function');
  });

  test('migrate() produces the same document as the total converter', () => {
    const viaMigrator = s7kImportMigrator.migrate(pocLayouts[0] as never);
    expect(viaMigrator).toEqual(expectedV1[0]);
  });

  test('migrate() throws on malformed input (totality lives in the converter)', () => {
    expect(() => s7kImportMigrator.migrate({} as never)).toThrow(/page/);
  });
});
