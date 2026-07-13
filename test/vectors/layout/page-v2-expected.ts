/**
 * The expected result of migrating {@link pageV1} through the test-only v1→v2
 * migrator, whose invented delta adds a `z` (z-order) field to every grid item
 * and bumps `schemaVersion` to 2. This delta is fabricated purely for the
 * migration-chain vectors — the shipped registry has only the v1 schema.
 *
 * Typed loosely (no annotation) because v2 is hypothetical: it is not the
 * exported `LayoutPage`, which always describes the current version.
 */
export const pageV2Expected = {
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
      {
        widgetID: { source: 'local', tag: 'gm-note' },
        i: 'w2',
        x: 4,
        y: 0,
        w: 2,
        h: 2,
        z: 0,
      },
    ],
  },
  tabs: [],
};
