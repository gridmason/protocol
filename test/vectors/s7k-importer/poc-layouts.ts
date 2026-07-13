import type { PocLayoutPage } from '../../../src/types/poc-import.js';

/**
 * A representative `s7k-widgets-core` localStorage payload: the value stored
 * under the `$widgetLayouts` key — an array of saved POC layout pages. Modeled
 * on the real POC shape (github.com/Sniper7Kills-LLC/s7k-widgets-core,
 * `src/types/layout.d.ts` + the `defaultLayout` in `src/managers/layout.ts`):
 * per-node `id` uuids, bare `widgetID` component ids, and widget `name` / `moved`
 * fields — all of which the importer drops or source-qualifies.
 *
 * Exercises: a single-grid page and a tabbed page; a `string` and a `number`
 * `widgetID` and `i` (coercion); a widget with `props` and one without; and the
 * dropped `name`/`moved`/`id` fields.
 */
export const pocLayouts: readonly PocLayoutPage[] = [
  {
    id: '2b0f8c1e-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
    page: 'crm.customer-detail',
    name: 'Customer overview',
    default: true,
    hasTabs: false,
    grid: {
      id: 'a1111111-1111-4111-8111-111111111111',
      items: [
        {
          name: 'Sales chart',
          widgetID: 'sales-chart',
          x: 0,
          y: 0,
          w: 4,
          h: 3,
          i: 'w1',
          props: { range: '90d' },
          moved: false,
        },
        {
          name: 'Note',
          widgetID: 42,
          x: 4,
          y: 0,
          w: 2,
          h: 2,
          i: 7,
          moved: true,
        },
      ],
    },
    tabs: [],
  },
  {
    id: '3c1f9d2f-2b3c-4d5e-9f6a-7b8c9d0e1f2a',
    page: 'ops.dashboard',
    name: 'Ops dashboard',
    default: false,
    hasTabs: true,
    grid: {
      id: 'b2222222-2222-4222-8222-222222222222',
      items: [],
    },
    tabs: [
      {
        id: 'c3333333-3333-4333-8333-333333333333',
        name: 'Health',
        grid: {
          id: 'd4444444-4444-4444-8444-444444444444',
          items: [
            {
              name: 'Uptime',
              widgetID: 'uptime-gauge',
              x: 0,
              y: 0,
              w: 2,
              h: 2,
              i: 'w-uptime',
              props: { window: '24h' },
            },
          ],
        },
      },
    ],
  },
];
