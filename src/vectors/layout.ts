/**
 * LayoutDoc migration conformance vectors (docs/SPEC.md §3.3, core §5): the
 * migrate-on-read chain, idempotence, and the unknown-newer `{ readOnly, reason }`
 * branch that must never rewrite the document.
 *
 * The v2 delta (a `z` z-order on every grid item) and the `bump` steps are
 * fabricated purely for these vectors — the shipped registry has only the v1
 * schema and the framework, no historical steps.
 */

import type { LayoutPage, Migrator, VersionedLayout } from '../types/layout.js';
import type { LayoutVector } from './types.js';

/** A well-formed current-version (v1) LayoutDoc — the chain input. */
const pageV1: LayoutPage = {
  schemaVersion: 1,
  page: 'crm.customer-detail',
  name: 'Customer overview',
  default: true,
  hasTabs: false,
  grid: {
    items: [
      {
        widgetID: { source: 'registry.gridmason.dev', tag: 'acme-sales-chart' },
        i: 'w1',
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        props: { range: '90d' },
      },
      { widgetID: { source: 'local', tag: 'gm-note' }, i: 'w2', x: 4, y: 0, w: 2, h: 2 },
    ],
  },
  tabs: [],
};

/** Expected result of migrating {@link pageV1} through {@link v1ToV2}. */
const pageV2Expected = {
  schemaVersion: 2,
  page: 'crm.customer-detail',
  name: 'Customer overview',
  default: true,
  hasTabs: false,
  grid: {
    items: [
      {
        widgetID: { source: 'registry.gridmason.dev', tag: 'acme-sales-chart' },
        i: 'w1',
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        props: { range: '90d' },
        z: 0,
      },
      { widgetID: { source: 'local', tag: 'gm-note' }, i: 'w2', x: 4, y: 0, w: 2, h: 2, z: 0 },
    ],
  },
  tabs: [],
};

/** A document from a hypothetical newer build, carrying an unknown field. */
const pageNewer = {
  schemaVersion: 99,
  page: 'crm.customer-detail',
  name: 'From a newer build',
  default: false,
  hasTabs: false,
  grid: { items: [] },
  tabs: [],
  someUnknownFutureField: 'must survive untouched',
} as VersionedLayout;

/** Test-only v1→v2 step: add a `z` z-order to every grid item. Pure, non-mutating. */
const v1ToV2: Migrator = {
  fromVersion: 1,
  migrate(doc) {
    const page = doc as LayoutPage;
    return {
      ...page,
      schemaVersion: 2,
      grid: { items: page.grid.items.map((item) => ({ ...item, z: 0 })) },
    };
  },
};

/** A trivial version-bump step, for composing multi-step chains. */
const bump = (from: number): Migrator => ({
  fromVersion: from,
  migrate: (doc) => ({ ...doc, schemaVersion: from + 1 }),
});

export const layoutVectors: readonly LayoutVector[] = [
  {
    name: 'current-version document passes through unchanged',
    doc: pageV1,
    migrators: [],
    expected: { readOnly: false, doc: pageV1 },
  },
  {
    name: 'single-step v1→v2 upgrade',
    doc: pageV1,
    migrators: [v1ToV2],
    target: 2,
    expected: { readOnly: false, doc: pageV2Expected },
  },
  {
    name: 'multi-step v1→v4 chain composes every step',
    doc: { schemaVersion: 1 },
    migrators: [bump(1), bump(2), bump(3)],
    target: 4,
    expected: { readOnly: false, doc: { schemaVersion: 4 } },
  },
  {
    name: 'unknown-newer document is read-only and untouched',
    doc: pageNewer,
    migrators: [],
    expected: { readOnly: true, reasonIncludes: 'newer' },
  },
  {
    name: 'missing intermediate migrator is read-only',
    doc: pageV1,
    migrators: [v1ToV2],
    target: 3,
    expected: { readOnly: true, reasonIncludes: '2' },
  },
  {
    name: 'non-integer schemaVersion is read-only',
    doc: { schemaVersion: 1.5 },
    migrators: [],
    expected: { readOnly: true },
  },
];
