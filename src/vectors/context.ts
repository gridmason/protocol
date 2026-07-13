/**
 * Page-context subset conformance vectors (docs/SPEC.md §3.2): the
 * `requiresContext ⊆ pageContext` relation picker-gating and layout-resolution
 * share. Positive and negative coverage for every primitive and both composites,
 * including nesting.
 */

import type { ContextMap } from '../types/context.js';
import type { ContextVector } from './types.js';

/** The page from SPEC §3.2: `{ record: record-ref<customer>, team: record-ref<team> }`. */
const specPage: ContextMap = {
  record: { type: 'record-ref', recordType: 'customer' },
  team: { type: 'record-ref', recordType: 'team' },
};

const listOfCustomers: ContextMap = {
  rows: { type: 'list', element: { type: 'record-ref', recordType: 'customer' } },
};

const requiresFilterObj: ContextMap = {
  filter: {
    type: 'object',
    fields: {
      owner: { type: 'record-ref', recordType: 'customer' },
      active: { type: 'bool' },
    },
  },
};

export const contextVectors: readonly ContextVector[] = [
  {
    name: 'exact record-ref match',
    requires: { record: { type: 'record-ref', recordType: 'customer' } },
    page: specPage,
    subset: true,
  },
  {
    name: 'surplus page keys are ignorable',
    requires: { record: { type: 'record-ref', recordType: 'customer' } },
    page: specPage,
    subset: true,
  },
  { name: 'empty requirement is vacuously satisfied', requires: {}, page: specPage, subset: true },
  {
    name: 'missing required key',
    requires: {
      record: { type: 'record-ref', recordType: 'customer' },
      account: { type: 'record-ref', recordType: 'account' },
    },
    page: specPage,
    subset: false,
  },
  {
    name: 'record-ref recordType mismatch',
    requires: { record: { type: 'record-ref', recordType: 'team' } },
    page: { record: { type: 'record-ref', recordType: 'customer' } },
    subset: false,
  },
  {
    name: 'scalar primitives match by type',
    requires: { s: { type: 'string' }, n: { type: 'number' }, b: { type: 'bool' }, i: { type: 'id' } },
    page: { s: { type: 'string' }, n: { type: 'number' }, b: { type: 'bool' }, i: { type: 'id' } },
    subset: true,
  },
  {
    name: 'primitive kind mismatch (number required, string provided)',
    requires: { value: { type: 'number' } },
    page: { value: { type: 'string' } },
    subset: false,
  },
  { name: 'list matching element type', requires: listOfCustomers, page: listOfCustomers, subset: true },
  {
    name: 'list element recordType mismatch',
    requires: listOfCustomers,
    page: { rows: { type: 'list', element: { type: 'record-ref', recordType: 'team' } } },
    subset: false,
  },
  {
    name: 'list requirement not satisfied by a non-list',
    requires: listOfCustomers,
    page: { rows: { type: 'record-ref', recordType: 'customer' } },
    subset: false,
  },
  { name: 'object per-field match', requires: requiresFilterObj, page: requiresFilterObj, subset: true },
  {
    name: 'object with extra provided fields (structural subset)',
    requires: requiresFilterObj,
    page: {
      filter: {
        type: 'object',
        fields: {
          owner: { type: 'record-ref', recordType: 'customer' },
          active: { type: 'bool' },
          since: { type: 'number' },
        },
      },
    },
    subset: true,
  },
  {
    name: 'object missing required field',
    requires: requiresFilterObj,
    page: {
      filter: { type: 'object', fields: { owner: { type: 'record-ref', recordType: 'customer' } } },
    },
    subset: false,
  },
  {
    name: 'object requirement not satisfied by a non-object',
    requires: requiresFilterObj,
    page: { filter: { type: 'string' } },
    subset: false,
  },
  {
    name: 'nested list-of-objects matches recursively',
    requires: { rows: { type: 'list', element: { type: 'object', fields: { id: { type: 'id' } } } } },
    page: {
      rows: {
        type: 'list',
        element: { type: 'object', fields: { id: { type: 'id' }, label: { type: 'string' } } },
      },
    },
    subset: true,
  },
  {
    name: 'nested list-of-objects field mismatch',
    requires: { rows: { type: 'list', element: { type: 'object', fields: { id: { type: 'id' } } } } },
    page: { rows: { type: 'list', element: { type: 'object', fields: { id: { type: 'string' } } } } },
    subset: false,
  },
];
