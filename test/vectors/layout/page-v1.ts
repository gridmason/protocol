import type { LayoutPage } from '../../../src/types/layout.js';

/**
 * A well-formed `LayoutDoc` at the current (v1) schema version — the input to
 * the migration-chain vectors.
 */
export const pageV1: LayoutPage = {
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
      {
        widgetID: { source: 'local', tag: 'gm-note' },
        i: 'w2',
        x: 4,
        y: 0,
        w: 2,
        h: 2,
      },
    ],
  },
  tabs: [],
};
