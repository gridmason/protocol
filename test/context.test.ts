import { describe, expect, test } from 'vitest';

import { isContextSubset } from '../src/types/context.js';
import type { ContextMap } from '../src/types/context.js';

// docs/SPEC.md §3.2 — the subset check `requiresContext ⊆ pageContext`, the one
// implementation picker-gating and layout-resolution share. Positive and
// negative coverage for every primitive and both composites.

// The page from SPEC §3.2: `{ record: record-ref<customer>, team: record-ref<team> }`.
const specPage: ContextMap = {
  record: { type: 'record-ref', recordType: 'customer' },
  team: { type: 'record-ref', recordType: 'team' },
};

describe('primitives', () => {
  test('exact match passes', () => {
    const requires: ContextMap = { record: { type: 'record-ref', recordType: 'customer' } };
    expect(isContextSubset(requires, specPage)).toBe(true);
  });

  test('extra keys on the page pass (surplus context is ignorable)', () => {
    // requires only `record`; page also provides `team` — still a subset.
    const requires: ContextMap = { record: { type: 'record-ref', recordType: 'customer' } };
    expect(isContextSubset(requires, specPage)).toBe(true);
  });

  test('empty requirement is vacuously satisfied by any page', () => {
    expect(isContextSubset({}, specPage)).toBe(true);
    expect(isContextSubset({}, {})).toBe(true);
  });

  test('missing required key fails', () => {
    const requires: ContextMap = {
      record: { type: 'record-ref', recordType: 'customer' },
      account: { type: 'record-ref', recordType: 'account' },
    };
    expect(isContextSubset(requires, specPage)).toBe(false);
  });

  test('record-ref recordType mismatch fails', () => {
    const requires: ContextMap = { record: { type: 'record-ref', recordType: 'team' } };
    expect(isContextSubset(requires, specPage)).toBe(false);
  });

  test('scalar primitives match by type', () => {
    const page: ContextMap = {
      s: { type: 'string' },
      n: { type: 'number' },
      b: { type: 'bool' },
      i: { type: 'id' },
    };
    expect(isContextSubset(page, page)).toBe(true);
    for (const key of ['s', 'n', 'b', 'i'] as const) {
      expect(isContextSubset({ [key]: page[key]! }, page)).toBe(true);
    }
  });

  test('primitive kind mismatch fails', () => {
    const page: ContextMap = { value: { type: 'string' } };
    expect(isContextSubset({ value: { type: 'number' } }, page)).toBe(false);
    expect(isContextSubset({ value: { type: 'id' } }, page)).toBe(false);
    // record-ref required, plain string provided
    expect(
      isContextSubset({ value: { type: 'record-ref', recordType: 'customer' } }, page),
    ).toBe(false);
  });
});

describe('composite: list<T>', () => {
  const listOfCustomers: ContextMap = {
    rows: { type: 'list', element: { type: 'record-ref', recordType: 'customer' } },
  };

  test('matching element type passes', () => {
    expect(isContextSubset(listOfCustomers, listOfCustomers)).toBe(true);
  });

  test('element recordType mismatch fails', () => {
    const page: ContextMap = {
      rows: { type: 'list', element: { type: 'record-ref', recordType: 'team' } },
    };
    expect(isContextSubset(listOfCustomers, page)).toBe(false);
  });

  test('element primitive-kind mismatch fails', () => {
    const requires: ContextMap = { rows: { type: 'list', element: { type: 'string' } } };
    const page: ContextMap = { rows: { type: 'list', element: { type: 'number' } } };
    expect(isContextSubset(requires, page)).toBe(false);
  });

  test('a list requirement is not satisfied by a non-list provided type', () => {
    const page: ContextMap = { rows: { type: 'record-ref', recordType: 'customer' } };
    expect(isContextSubset(listOfCustomers, page)).toBe(false);
  });
});

describe('composite: object<…>', () => {
  const requiresObj: ContextMap = {
    filter: {
      type: 'object',
      fields: {
        owner: { type: 'record-ref', recordType: 'customer' },
        active: { type: 'bool' },
      },
    },
  };

  test('per-field match passes', () => {
    expect(isContextSubset(requiresObj, requiresObj)).toBe(true);
  });

  test('provided object with extra fields passes (structural subset)', () => {
    const page: ContextMap = {
      filter: {
        type: 'object',
        fields: {
          owner: { type: 'record-ref', recordType: 'customer' },
          active: { type: 'bool' },
          since: { type: 'number' },
        },
      },
    };
    expect(isContextSubset(requiresObj, page)).toBe(true);
  });

  test('missing required field fails', () => {
    const page: ContextMap = {
      filter: {
        type: 'object',
        fields: { owner: { type: 'record-ref', recordType: 'customer' } },
      },
    };
    expect(isContextSubset(requiresObj, page)).toBe(false);
  });

  test('field type mismatch fails', () => {
    const page: ContextMap = {
      filter: {
        type: 'object',
        fields: {
          owner: { type: 'record-ref', recordType: 'team' },
          active: { type: 'bool' },
        },
      },
    };
    expect(isContextSubset(requiresObj, page)).toBe(false);
  });

  test('an object requirement is not satisfied by a non-object provided type', () => {
    const page: ContextMap = { filter: { type: 'string' } };
    expect(isContextSubset(requiresObj, page)).toBe(false);
  });

  test('nested composites (list of objects) match recursively', () => {
    const requires: ContextMap = {
      rows: {
        type: 'list',
        element: {
          type: 'object',
          fields: { id: { type: 'id' } },
        },
      },
    };
    const page: ContextMap = {
      rows: {
        type: 'list',
        element: {
          type: 'object',
          fields: { id: { type: 'id' }, label: { type: 'string' } },
        },
      },
    };
    expect(isContextSubset(requires, page)).toBe(true);

    const badPage: ContextMap = {
      rows: {
        type: 'list',
        element: { type: 'object', fields: { id: { type: 'string' } } },
      },
    };
    expect(isContextSubset(requires, badPage)).toBe(false);
  });
});

describe('purity', () => {
  test('does not mutate its inputs', () => {
    const requires: ContextMap = { record: { type: 'record-ref', recordType: 'customer' } };
    const page: ContextMap = {
      record: { type: 'record-ref', recordType: 'customer' },
      team: { type: 'record-ref', recordType: 'team' },
    };
    isContextSubset(requires, page);
    expect(page).toEqual(specPage);
    expect(requires).toEqual({ record: { type: 'record-ref', recordType: 'customer' } });
  });
});
