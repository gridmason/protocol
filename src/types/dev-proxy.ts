/**
 * The **dev-proxy SDK wire format** (cli FR-5; `gridmason dev --proxy`): the
 * request/response envelope the CLI dev server speaks to a `--proxy` target host
 * when it forwards a widget's gated SDK calls for integration realism. It is
 * pinned here so the CLI's forward leg and a host's future receive endpoint (a
 * `gridmason/dashboard` deliverable) meet on one contract rather than drifting.
 *
 * This is the **forward leg only** — the CLI-internal `/@dev/*` browser routes
 * are out of scope. `method` is a plain `string`: the SDK method vocabulary
 * belongs to `@gridmason/sdk`, and the protocol must not depend on it, so a
 * receiving host maps the string to its own SDK surface.
 */

/** The path a proxied SDK call is POSTed to on a `--proxy` target host. */
export const DEV_PROXY_SDK_PATH = '/__gridmason_dev__/sdk';

/**
 * One SDK call crossing the dev proxy to the target host: the dotted SDK
 * `method` (a plain string — the vocabulary is the SDK's, not the protocol's)
 * and the widget's positional `args` exactly as it passed them.
 */
export interface DevProxySdkRequest {
  readonly method: string;
  readonly args: readonly unknown[];
}

/**
 * The target host's answer to a {@link DevProxySdkRequest}: a discriminated
 * union on `ok` carrying the call's `value` on success or an `error` message on
 * failure.
 */
export type DevProxySdkResponse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

/**
 * Whether `value` is a well-formed {@link DevProxySdkRequest}: a non-null,
 * non-array object with a string `method` and an array `args`. Pure; never
 * throws.
 */
export function isDevProxySdkRequest(value: unknown): value is DevProxySdkRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.method === 'string' && Array.isArray(v.args);
}

/**
 * Whether `value` is a well-formed {@link DevProxySdkResponse}: a non-null
 * object that is either `{ ok: true, … }` or `{ ok: false, error: <string> }`.
 * The success arm does **not** require `value` to be present — JSON serialization
 * drops an `undefined` result, so an empty success arrives as `{ "ok": true }`.
 * Pure; never throws.
 */
export function isDevProxySdkResponse(value: unknown): value is DevProxySdkResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.ok === true) return true;
  if (v.ok === false) return typeof v.error === 'string';
  return false;
}
