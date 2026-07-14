import { describe, expect, it } from 'vitest';

import {
  DEV_PROXY_SDK_PATH,
  isDevProxySdkRequest,
  isDevProxySdkResponse,
} from '../src/types/dev-proxy.js';

describe('DEV_PROXY_SDK_PATH', () => {
  it('is the pinned forward-leg endpoint path', () => {
    expect(DEV_PROXY_SDK_PATH).toBe('/__gridmason_dev__/sdk');
  });
});

describe('isDevProxySdkRequest', () => {
  it('accepts a well-formed request', () => {
    expect(isDevProxySdkRequest({ method: 'records.read', args: [] })).toBe(true);
    expect(isDevProxySdkRequest({ method: 'net.fetch', args: [{ host: 'api.acme.com' }] })).toBe(true);
  });

  it('rejects non-objects, null, and arrays', () => {
    expect(isDevProxySdkRequest('records.read')).toBe(false);
    expect(isDevProxySdkRequest(null)).toBe(false);
    expect(isDevProxySdkRequest([])).toBe(false);
  });

  it('rejects a missing or non-string method', () => {
    expect(isDevProxySdkRequest({ args: [] })).toBe(false);
    expect(isDevProxySdkRequest({ method: 42, args: [] })).toBe(false);
  });

  it('rejects a missing or non-array args', () => {
    expect(isDevProxySdkRequest({ method: 'records.read' })).toBe(false);
    expect(isDevProxySdkRequest({ method: 'records.read', args: {} })).toBe(false);
  });
});

describe('isDevProxySdkResponse', () => {
  it('accepts a success envelope, with or without a value (JSON drops undefined)', () => {
    expect(isDevProxySdkResponse({ ok: true, value: { total: 3 } })).toBe(true);
    expect(isDevProxySdkResponse({ ok: true })).toBe(true);
  });

  it('accepts a failure envelope with a string error', () => {
    expect(isDevProxySdkResponse({ ok: false, error: 'not authorized' })).toBe(true);
  });

  it('rejects non-objects and null', () => {
    expect(isDevProxySdkResponse('ok')).toBe(false);
    expect(isDevProxySdkResponse(null)).toBe(false);
  });

  it('rejects a missing or non-boolean ok discriminant', () => {
    expect(isDevProxySdkResponse({ value: 1 })).toBe(false);
    expect(isDevProxySdkResponse({ ok: 'true', value: 1 })).toBe(false);
  });

  it('rejects a failure envelope without a string error', () => {
    expect(isDevProxySdkResponse({ ok: false })).toBe(false);
    expect(isDevProxySdkResponse({ ok: false, error: 500 })).toBe(false);
  });
});
