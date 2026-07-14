/**
 * Dev-proxy wire-format + capability-grant conformance vectors (cli FR-5;
 * docs/SPEC.md §3.1, §5–§6). Positive and negative coverage for the two wire
 * guards ({@link import('../types/dev-proxy.js').isDevProxySdkRequest} /
 * {@link import('../types/dev-proxy.js').isDevProxySdkResponse}) and the
 * scope-prefix {@link import('../types/manifest/capability.js').grantsCapability}
 * containment rule — the request/response shapes and the grant semantics a
 * `gridmason dev --proxy` target host must match.
 */

import type { Capability } from '../types/manifest/index.js';
import type {
  CapabilityGrantVector,
  DevProxyRequestVector,
  DevProxyResponseVector,
} from './types.js';

/** Wire-request guard vectors: is `value` a `{ method: string; args: [] }`? */
export const devProxyRequestVectors: readonly DevProxyRequestVector[] = [
  { name: 'method with empty args', value: { method: 'records.read', args: [] }, valid: true },
  {
    name: 'method with an argument list',
    value: { method: 'records.read', args: [{ recordType: 'customer', id: 'c1' }] },
    valid: true,
  },
  { name: 'not an object', value: 'records.read', valid: false },
  { name: 'null', value: null, valid: false },
  { name: 'missing method', value: { args: [] }, valid: false },
  { name: 'non-string method', value: { method: 42, args: [] }, valid: false },
  { name: 'missing args', value: { method: 'records.read' }, valid: false },
  { name: 'non-array args', value: { method: 'records.read', args: {} }, valid: false },
];

/** Wire-response guard vectors: is `value` a `{ ok, … }` result envelope? */
export const devProxyResponseVectors: readonly DevProxyResponseVector[] = [
  { name: 'success with a value', value: { ok: true, value: { total: 3 } }, valid: true },
  { name: 'success with an absent value (JSON-dropped undefined)', value: { ok: true }, valid: true },
  { name: 'failure with an error message', value: { ok: false, error: 'not authorized' }, valid: true },
  { name: 'not an object', value: 'ok', valid: false },
  { name: 'null', value: null, valid: false },
  { name: 'missing ok discriminant', value: { value: 1 }, valid: false },
  { name: 'non-boolean ok', value: { ok: 'true', value: 1 }, valid: false },
  { name: 'failure missing error', value: { ok: false }, valid: false },
  { name: 'failure with a non-string error', value: { ok: false, error: 500 }, valid: false },
];

const recordsReadUnscoped: Capability = { api: 'records.read' };
const recordsReadType: Capability = { api: 'records.read', scope: 'recordType' };
const recordsReadCustomer: Capability = { api: 'records.read', scope: 'recordType:customer' };
const netAcme: Capability = { api: 'net', scope: 'api.acme.com' };

/** Scope-prefix grant vectors: does `declared` grant `required`? */
export const capabilityGrantVectors: readonly CapabilityGrantVector[] = [
  { name: 'exact scope match grants', declared: recordsReadCustomer, required: recordsReadCustomer, grants: true },
  {
    name: 'unscoped declaration grants any scope of the same api',
    declared: recordsReadUnscoped,
    required: recordsReadCustomer,
    grants: true,
  },
  {
    name: 'scope-prefix declaration grants a deeper required scope',
    declared: recordsReadType,
    required: recordsReadCustomer,
    grants: true,
  },
  { name: 'unscoped grants unscoped', declared: recordsReadUnscoped, required: recordsReadUnscoped, grants: true },
  { name: 'net host scope grants the same host', declared: netAcme, required: netAcme, grants: true },
  {
    name: 'api mismatch never grants',
    declared: { api: 'records.write', scope: 'recordType:customer' },
    required: recordsReadCustomer,
    grants: false,
  },
  {
    name: 'read does not grant write on the same scope',
    declared: recordsReadCustomer,
    required: { api: 'records.write', scope: 'recordType:customer' },
    grants: false,
  },
  {
    name: 'a deeper declaration does not grant a shallower requirement',
    declared: recordsReadCustomer,
    required: recordsReadType,
    grants: false,
  },
  {
    name: 'a sibling scope does not grant',
    declared: recordsReadCustomer,
    required: { api: 'records.read', scope: 'recordType:team' },
    grants: false,
  },
  {
    name: 'a scoped declaration does not grant an unscoped requirement',
    declared: recordsReadCustomer,
    required: recordsReadUnscoped,
    grants: false,
  },
  {
    name: 'a different net host does not grant',
    declared: netAcme,
    required: { api: 'net', scope: 'api.evil.com' },
    grants: false,
  },
];
