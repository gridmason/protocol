import type { LayoutPage } from '../../../src/types/layout.js';

/**
 * The `LayoutDoc v1` documents {@link pocLayouts} must import to. Each page is at
 * `schemaVersion: 1`; every `widgetID` is source-qualified to `local`; `i` is a
 * `string`; and the POC's per-node `id`s plus each widget's `name`/`moved` are
 * gone. `props` is preserved verbatim where present and absent where the POC
 * omitted it.
 */
export const expectedV1: readonly LayoutPage[] = [
  {
    schemaVersion: 1,
    page: 'crm.customer-detail',
    name: 'Customer overview',
    default: true,
    grid: {
      items: [
        {
          widgetID: { source: 'local', tag: 'sales-chart' },
          i: 'w1',
          x: 0,
          y: 0,
          w: 4,
          h: 3,
          props: { range: '90d' },
        },
        {
          widgetID: { source: 'local', tag: '42' },
          i: '7',
          x: 4,
          y: 0,
          w: 2,
          h: 2,
        },
      ],
    },
    hasTabs: false,
    tabs: [],
  },
  {
    schemaVersion: 1,
    page: 'ops.dashboard',
    name: 'Ops dashboard',
    default: false,
    grid: {
      items: [],
    },
    hasTabs: true,
    tabs: [
      {
        name: 'Health',
        grid: {
          items: [
            {
              widgetID: { source: 'local', tag: 'uptime-gauge' },
              i: 'w-uptime',
              x: 0,
              y: 0,
              w: 2,
              h: 2,
              props: { window: '24h' },
            },
          ],
        },
      },
    ],
  },
];
