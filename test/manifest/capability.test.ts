import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_APIS,
  formatCapability,
  grantsCapability,
  parseCapability,
  validateCapability,
} from '../../src/types/manifest/index.js';
import type { Capability } from '../../src/types/manifest/index.js';

describe('parseCapability', () => {
  it('accepts each v1 api with no scope', () => {
    for (const api of CAPABILITY_APIS) {
      const result = parseCapability(api);
      expect(result).toEqual({ ok: true, api, scope: undefined, scopePath: [] });
    }
  });

  it('accepts each v1 api with a scope path', () => {
    expect(parseCapability('records.read:recordType:customer')).toEqual({
      ok: true,
      api: 'records.read',
      scope: 'recordType:customer',
      scopePath: ['recordType', 'customer'],
    });
    expect(parseCapability('records.write:recordType:customer')).toMatchObject({
      ok: true,
      api: 'records.write',
    });
    expect(parseCapability('net:api.acme.com')).toEqual({
      ok: true,
      api: 'net',
      scope: 'api.acme.com',
      scopePath: ['api.acme.com'],
    });
    expect(parseCapability('events:acme.sales')).toEqual({
      ok: true,
      api: 'events',
      scope: 'acme.sales',
      scopePath: ['acme.sales'],
    });
  });

  it('keeps the dotted api intact and splits only the scope on colons', () => {
    const result = parseCapability('records.read:a:b:c');
    expect(result).toMatchObject({ ok: true, api: 'records.read', scopePath: ['a', 'b', 'c'] });
  });

  it('rejects an unknown api', () => {
    expect(parseCapability('records.delete:x')).toEqual({ ok: false, error: 'unknown-api' });
    expect(parseCapability('files')).toEqual({ ok: false, error: 'unknown-api' });
    expect(parseCapability('NET')).toEqual({ ok: false, error: 'unknown-api' });
  });

  it('rejects the empty string', () => {
    expect(parseCapability('')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects an empty api segment', () => {
    expect(parseCapability(':recordType:customer')).toEqual({ ok: false, error: 'empty-api' });
  });

  it('rejects empty scope segments', () => {
    expect(parseCapability('net:')).toEqual({ ok: false, error: 'empty-scope-segment' });
    expect(parseCapability('records.read:a::b')).toEqual({
      ok: false,
      error: 'empty-scope-segment',
    });
    expect(parseCapability('events:acme.sales:')).toEqual({
      ok: false,
      error: 'empty-scope-segment',
    });
  });
});

describe('validateCapability', () => {
  it('accepts scoped and unscoped valid capabilities', () => {
    expect(validateCapability({ api: 'net' })).toBeUndefined();
    expect(validateCapability({ api: 'records.read', scope: 'recordType:customer' })).toBeUndefined();
  });

  it('rejects an unknown api', () => {
    expect(validateCapability({ api: 'records.delete' as Capability['api'] })).toBe('unknown-api');
  });

  it('rejects an empty or malformed scope', () => {
    expect(validateCapability({ api: 'net', scope: '' })).toBe('empty-scope-segment');
    expect(validateCapability({ api: 'net', scope: 'a::b' })).toBe('empty-scope-segment');
  });
});

describe('formatCapability', () => {
  it('round-trips through parseCapability', () => {
    const cases: Capability[] = [
      { api: 'net' },
      { api: 'records.read', scope: 'recordType:customer' },
      { api: 'events', scope: 'acme.sales' },
    ];
    for (const capability of cases) {
      const formatted = formatCapability(capability);
      const parsed = parseCapability(formatted);
      expect(parsed).toMatchObject({ ok: true, api: capability.api });
      if (parsed.ok) expect(parsed.scope).toBe(capability.scope);
    }
  });
});

describe('grantsCapability', () => {
  it('grants when the declared scope is a prefix of (or equal to) the required scope', () => {
    const required: Capability = { api: 'records.read', scope: 'recordType:customer' };
    expect(grantsCapability({ api: 'records.read' }, required)).toBe(true);
    expect(grantsCapability({ api: 'records.read', scope: 'recordType' }, required)).toBe(true);
    expect(grantsCapability({ api: 'records.read', scope: 'recordType:customer' }, required)).toBe(true);
  });

  it('does not grant across a different api', () => {
    expect(
      grantsCapability(
        { api: 'records.write', scope: 'recordType:customer' },
        { api: 'records.read', scope: 'recordType:customer' },
      ),
    ).toBe(false);
  });

  it('does not grant a shallower or sibling required scope', () => {
    const declared: Capability = { api: 'records.read', scope: 'recordType:customer' };
    expect(grantsCapability(declared, { api: 'records.read', scope: 'recordType' })).toBe(false);
    expect(grantsCapability(declared, { api: 'records.read' })).toBe(false);
    expect(grantsCapability(declared, { api: 'records.read', scope: 'recordType:team' })).toBe(false);
  });

  it('matches a single-segment net host exactly', () => {
    expect(grantsCapability({ api: 'net', scope: 'api.acme.com' }, { api: 'net', scope: 'api.acme.com' })).toBe(true);
    expect(grantsCapability({ api: 'net', scope: 'api.acme.com' }, { api: 'net', scope: 'api.evil.com' })).toBe(false);
  });
});
