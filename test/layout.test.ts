import { describe, expect, test } from 'vitest';

import {
  CURRENT_LAYOUT_SCHEMA_VERSION,
  type LayoutPage,
  type Migrator,
  MigratorRegistry,
  type VersionedLayout,
  layoutMigrators,
  migrate,
} from '../src/types/layout.js';
import { pageNewer } from './vectors/layout/page-newer.js';
import { pageV1 } from './vectors/layout/page-v1.js';
import { pageV2Expected } from './vectors/layout/page-v2-expected.js';

/** Deep clone a plain JSON fixture (no `structuredClone`: ES2022-only surface). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * A test-only v1→v2 migrator. The v2 delta (adding a `z` z-order to each grid
 * item) is invented purely for these fixtures — the shipped registry has only
 * the v1 schema and the framework, no real format change. Pure and non-mutating.
 */
const v1ToV2: Migrator = {
  fromVersion: 1,
  migrate(doc) {
    const page = doc as unknown as LayoutPage;
    return {
      ...page,
      schemaVersion: 2,
      grid: {
        items: page.grid.items.map((item) => ({ ...item, z: 0 })),
      },
    };
  },
};

describe('shipped baseline', () => {
  test('current version is 1 and the shipped registry has no historical steps', () => {
    expect(CURRENT_LAYOUT_SCHEMA_VERSION).toBe(1);
    expect(layoutMigrators.size).toBe(0);
  });

  test('a current-version document passes through unchanged (no migrators needed)', () => {
    const doc = pageV1;
    const result = migrate(doc);
    expect(result.readOnly).toBe(false);
    if (!result.readOnly) expect(result.doc).toBe(doc); // same reference: nothing rewritten
  });
});

describe('MigratorRegistry', () => {
  test('register is chainable and exposes registered steps', () => {
    const registry = new MigratorRegistry().register(v1ToV2);
    expect(registry.size).toBe(1);
    expect(registry.has(1)).toBe(true);
    expect(registry.get(1)).toBe(v1ToV2);
    expect(registry.has(2)).toBe(false);
    expect(registry.get(2)).toBeUndefined();
  });

  test('rejects a duplicate step for the same version', () => {
    const registry = new MigratorRegistry().register(v1ToV2);
    expect(() => registry.register(v1ToV2)).toThrow(RangeError);
  });

  test('rejects a non-positive-integer fromVersion', () => {
    expect(() => new MigratorRegistry().register({ ...v1ToV2, fromVersion: 0 })).toThrow(RangeError);
    expect(() => new MigratorRegistry().register({ ...v1ToV2, fromVersion: 1.5 })).toThrow(RangeError);
  });
});

describe('migrate — the v-chain', () => {
  test('upgrades an older document step-by-step to the target version', () => {
    const registry = new MigratorRegistry().register(v1ToV2);
    const doc = pageV1;

    const result = migrate(doc, { registry, target: 2 });

    expect(result.readOnly).toBe(false);
    if (!result.readOnly) {
      expect(result.doc).toEqual(pageV2Expected);
    }
  });

  test('does not mutate the input document while migrating', () => {
    const registry = new MigratorRegistry().register(v1ToV2);
    const doc = pageV1;
    const snapshot = clone(doc);

    migrate(doc, { registry, target: 2 });

    expect(doc).toEqual(snapshot);
  });

  test('composes multiple steps across several versions', () => {
    const bump = (from: number): Migrator => ({
      fromVersion: from,
      migrate: (doc) => ({ ...doc, schemaVersion: from + 1 }),
    });
    const registry = new MigratorRegistry().register(bump(1)).register(bump(2)).register(bump(3));

    const result = migrate({ schemaVersion: 1 }, { registry, target: 4 });

    expect(result).toEqual({ readOnly: false, doc: { schemaVersion: 4 } });
  });
});

describe('migrate — idempotence', () => {
  test('a document already at the target is returned as-is', () => {
    const doc: VersionedLayout = { schemaVersion: 1 };
    const result = migrate(doc, { target: 1 });
    expect(result).toEqual({ readOnly: false, doc });
    if (!result.readOnly) expect(result.doc).toBe(doc);
  });

  test('re-migrating a migrated result is a no-op', () => {
    const registry = new MigratorRegistry().register(v1ToV2);
    const once = migrate(pageV1, { registry, target: 2 });
    expect(once.readOnly).toBe(false);
    if (!once.readOnly) {
      const twice = migrate(once.doc, { registry, target: 2 });
      expect(twice.readOnly).toBe(false);
      if (!twice.readOnly) expect(twice.doc).toBe(once.doc);
    }
  });
});

describe('migrate — read-only (never throws, never rewrites)', () => {
  test('an unknown NEWER schemaVersion returns { readOnly, reason } without mutating', () => {
    const doc = pageNewer;
    const snapshot = clone(doc);

    let result!: ReturnType<typeof migrate>;
    expect(() => {
      result = migrate(doc); // target defaults to CURRENT (1); doc is v99
    }).not.toThrow();

    expect(result.readOnly).toBe(true);
    if (result.readOnly) {
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.doc).toBe(doc); // exact same reference — not rewritten
    }
    expect(doc).toEqual(snapshot); // deep-unchanged
  });

  test('a missing intermediate migrator yields read-only with the original doc', () => {
    const registry = new MigratorRegistry().register(v1ToV2); // has 1→2 only
    const doc = pageV1;

    const result = migrate(doc, { registry, target: 3 }); // needs 2→3

    expect(result.readOnly).toBe(true);
    if (result.readOnly) {
      expect(result.reason).toContain('2');
      expect(result.doc).toBe(doc); // untouched original, not the partial 1→2 result
    }
  });

  test('a non-integer or non-positive schemaVersion is read-only, never thrown', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      const doc = { schemaVersion: bad } as VersionedLayout;
      const result = migrate(doc);
      expect(result.readOnly).toBe(true);
      if (result.readOnly) expect(result.doc).toBe(doc);
    }
  });
});
