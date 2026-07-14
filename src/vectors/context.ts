/**
 * Page-context conformance vectors (docs/SPEC.md §3.2): the
 * `requiresContext ⊆ pageContext` type-subset relation ({@link contextVectors})
 * and the runtime value-conformance relation ({@link contextValueVectors}) that
 * picker-gating and layout-resolution share. Positive and negative coverage for
 * every primitive and both composites, including nesting.
 */

import type { ContextMap, PageContext } from '../types/context.js';
import type { ContextValueVector, ContextVector } from './types.js';

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

/** The §3.2 page's declared types, satisfied by the runtime context below. */
const specContextMap: ContextMap = {
  record: { type: 'record-ref', recordType: 'customer' },
  team: { type: 'record-ref', recordType: 'team' },
};

/** A runtime context conforming to {@link specContextMap}. */
const specContext: PageContext = {
  record: { recordType: 'customer', id: 'cus_1' },
  team: { recordType: 'team', id: 'team_9' },
};

const scalarMap: ContextMap = {
  s: { type: 'string' },
  n: { type: 'number' },
  b: { type: 'bool' },
  i: { type: 'id' },
};

const filterObjMap: ContextMap = {
  filter: {
    type: 'object',
    fields: {
      owner: { type: 'record-ref', recordType: 'customer' },
      active: { type: 'bool' },
    },
  },
};

/**
 * Runtime value-conformance vectors for {@link import('../types/context.js').matchesContextMap}:
 * does a {@link PageContext} satisfy a declared {@link ContextMap}? Positive and
 * negative coverage for every primitive and both composites, including nesting.
 */
export const contextValueVectors: readonly ContextValueVector[] = [
  {
    name: 'record-ref value matches its declared record kind',
    context: specContext,
    contextMap: { record: { type: 'record-ref', recordType: 'customer' } },
    matches: true,
  },
  {
    name: 'surplus context keys are ignorable',
    context: specContext,
    contextMap: { record: { type: 'record-ref', recordType: 'customer' } },
    matches: true,
  },
  { name: 'empty contextMap is vacuously satisfied', context: specContext, contextMap: {}, matches: true },
  {
    name: 'missing declared key',
    context: { record: { recordType: 'customer', id: 'cus_1' } },
    contextMap: specContextMap,
    matches: false,
  },
  {
    name: 'record-ref recordType mismatch',
    context: { record: { recordType: 'team', id: 'cus_1' } },
    contextMap: { record: { type: 'record-ref', recordType: 'customer' } },
    matches: false,
  },
  {
    name: 'record-ref value missing its id',
    context: { record: { recordType: 'customer' } },
    contextMap: { record: { type: 'record-ref', recordType: 'customer' } },
    matches: false,
  },
  {
    name: 'record-ref requirement not satisfied by a bare string',
    context: { record: 'cus_1' },
    contextMap: { record: { type: 'record-ref', recordType: 'customer' } },
    matches: false,
  },
  {
    name: 'scalar values match by declared type (string, number, bool, id)',
    context: { s: 'hello', n: 42, b: true, i: 'id_7' },
    contextMap: scalarMap,
    matches: true,
  },
  {
    name: 'number requirement not satisfied by a string value',
    context: { n: 'not a number' },
    contextMap: { n: { type: 'number' } },
    matches: false,
  },
  {
    name: 'a number value must be finite (NaN is not conformant)',
    context: { n: Number.NaN },
    contextMap: { n: { type: 'number' } },
    matches: false,
  },
  {
    name: 'bool requirement not satisfied by a string value',
    context: { b: 'true' },
    contextMap: { b: { type: 'bool' } },
    matches: false,
  },
  {
    name: 'string requirement not satisfied by a number value',
    context: { s: 5 },
    contextMap: { s: { type: 'string' } },
    matches: false,
  },
  {
    name: 'list of record-ref values matches list<record-ref>',
    context: {
      rows: [
        { recordType: 'customer', id: 'cus_1' },
        { recordType: 'customer', id: 'cus_2' },
      ],
    },
    contextMap: { rows: { type: 'list', element: { type: 'record-ref', recordType: 'customer' } } },
    matches: true,
  },
  {
    name: 'empty list satisfies any element type (vacuous)',
    context: { rows: [] },
    contextMap: { rows: { type: 'list', element: { type: 'record-ref', recordType: 'customer' } } },
    matches: true,
  },
  {
    name: 'list element recordType mismatch',
    context: { rows: [{ recordType: 'team', id: 'team_1' }] },
    contextMap: { rows: { type: 'list', element: { type: 'record-ref', recordType: 'customer' } } },
    matches: false,
  },
  {
    name: 'list requirement not satisfied by a non-array value',
    context: { rows: { recordType: 'customer', id: 'cus_1' } },
    contextMap: { rows: { type: 'list', element: { type: 'record-ref', recordType: 'customer' } } },
    matches: false,
  },
  {
    name: 'object value matches per field, surplus fields ignored',
    context: { filter: { owner: { recordType: 'customer', id: 'cus_1' }, active: true, since: 2026 } },
    contextMap: filterObjMap,
    matches: true,
  },
  {
    name: 'object missing a declared field',
    context: { filter: { owner: { recordType: 'customer', id: 'cus_1' } } },
    contextMap: filterObjMap,
    matches: false,
  },
  {
    name: 'object field value mismatch',
    context: { filter: { owner: { recordType: 'customer', id: 'cus_1' }, active: 'yes' } },
    contextMap: filterObjMap,
    matches: false,
  },
  {
    name: 'object requirement not satisfied by a non-object value',
    context: { filter: 'nope' },
    contextMap: filterObjMap,
    matches: false,
  },
  {
    name: 'nested list-of-objects matches recursively',
    context: { rows: [{ id: 'id_1', label: 'A' }, { id: 'id_2', label: 'B' }] },
    contextMap: {
      rows: { type: 'list', element: { type: 'object', fields: { id: { type: 'id' } } } },
    },
    matches: true,
  },
  {
    name: 'nested list-of-objects field value mismatch',
    context: { rows: [{ id: 5 }] },
    contextMap: {
      rows: { type: 'list', element: { type: 'object', fields: { id: { type: 'id' } } } },
    },
    matches: false,
  },
];
