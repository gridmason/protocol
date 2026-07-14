/**
 * Trust-root parsing, pinning, and overlap-window rotation (docs/SPEC.md §4.4,
 * §5) — the pure decision a host runs before it will believe a registry's
 * countersign / publisher / log roots.
 *
 * Two pure functions, no I/O, no key handling, no clock (SPEC §5 — the caller
 * supplies `now` and the out-of-band pins):
 *
 * - {@link parseTrustRoot} narrows an untrusted `unknown` (e.g. a JSON document
 *   just fetched) into the {@link TrustRootDoc} shape the evaluator reads,
 *   rejecting a malformed document with a stable {@link TrustRootParseCode}. The
 *   generated JSON Schema is the strict *wire* gate (FR-5); this narrows the
 *   fields the decision depends on so the pure lib never reads an unchecked value.
 * - {@link evaluateTrustRoot} decides whether a parsed document is trusted, given
 *   the operator's out-of-band {@link TrustRootPin}s and `now`. It never trusts a
 *   document that no pin covers (SPEC §4.4 — "refuses to trust a root supplied
 *   over the network without a pin"), and it accepts a rotation overlap document
 *   for a host pinned to **either** the outgoing or the incoming root.
 *
 * Every failure is a stable enum so hosts render consistent, non-leaky error
 * boundaries and telemetry aggregates cleanly. Held at 100% line/branch coverage
 * (GW-D20 gate).
 */

import type { TrustRootDoc } from '../../types/wire/trust-root.js';

/** The wire-format major version this build understands. */
const SUPPORTED_MAJOR = 1;
/** `major.minor` shape a `formatVersion` must have before its major is read. */
const FORMAT_VERSION_RE = /^\d+\.\d+$/;

/**
 * Why {@link parseTrustRoot} rejected an input. Stable across versions — callers
 * and logs may switch on these.
 *
 * - `not-an-object`               — the input is not a non-null, non-array object.
 * - `malformed-field`             — a field the decision reads is missing or the
 *                                   wrong type (bad `registryId`, a non-`major.minor`
 *                                   `formatVersion`, a non-string-array root list,
 *                                   a non-integer validity instant, a non-string
 *                                   `crossSig`, …).
 * - `unsupported-format-version`  — a well-formed `major.minor` whose major this
 *                                   build does not understand.
 * - `empty-countersign-roots`     — `countersignRoots` is present and well-typed
 *                                   but empty: a document that anchors nothing.
 * - `invalid-validity-window`     — `notAfter` is before `notBefore`.
 */
export type TrustRootParseCode =
  | 'not-an-object'
  | 'malformed-field'
  | 'unsupported-format-version'
  | 'empty-countersign-roots'
  | 'invalid-validity-window';

/**
 * The result of {@link parseTrustRoot}: the narrowed {@link TrustRootDoc} on
 * success, or a stable {@link TrustRootParseCode} on failure. A discriminated
 * union so a consumer switches on `ok` and gets the typed document without a cast.
 */
export type TrustRootParse =
  | { readonly ok: true; readonly doc: TrustRootDoc }
  | { readonly ok: false; readonly reason: TrustRootParseCode };

/**
 * Which of SPEC §4.4's two never-fetch-blind channels supplied a pin. Advisory —
 * both channels are equally trusted; the verdict reports which one matched so an
 * operator can tell a build-time pin from a deploy-time one.
 *
 * - `build-time`  — pinned in the host build (shipped in the bundle).
 * - `deploy-time` — pinned as operator-supplied deploy config / secret.
 */
export type TrustPinChannel = 'build-time' | 'deploy-time';

/**
 * One out-of-band pin: an operator's declaration that `root` is a trusted
 * countersign root for `registryId`. A host ships a set of these (SPEC §4.4); a
 * trust-root document is trusted only when one of its {@link TrustRootDoc.countersignRoots}
 * matches a pin's `root`.
 */
export interface TrustRootPin {
  /** The registry this pin authorizes a root for; matched against the document's `registryId`. */
  readonly registryId: string;
  /** The pinned countersign-root identifier, matched verbatim against the document's `countersignRoots`. */
  readonly root: string;
  /** Which never-fetch-blind channel supplied this pin. Advisory; does not change the decision. */
  readonly channel: TrustPinChannel;
}

/**
 * Why {@link evaluateTrustRoot} reached its conclusion. Stable across versions.
 *
 * - `trusted`           — a pin covers one of the document's countersign roots and
 *                         `now` is inside its validity window: the document's roots
 *                         may be believed.
 * - `registry-mismatch` — no supplied pin is for this document's registry. Fail closed.
 * - `unpinned`          — pins exist for this registry but none matches any of the
 *                         document's countersign roots: an unpinned (e.g. rotated-past
 *                         or network-substituted) root. Fail closed (SPEC §4.4).
 * - `not-yet-valid`     — a pin matched but `now` is before `notBefore`. Fail closed.
 * - `expired`           — a pin matched but `now` is past `notAfter`. Fail closed.
 */
export type TrustRootVerdictCode =
  | 'trusted'
  | 'registry-mismatch'
  | 'unpinned'
  | 'not-yet-valid'
  | 'expired';

/**
 * The trust decision for one document. Total: {@link evaluateTrustRoot} never
 * throws — every input yields a verdict.
 */
export interface TrustRootVerdict {
  /** Machine-readable outcome. */
  readonly code: TrustRootVerdictCode;
  /** Convenience gate: `true` iff the document's roots may be believed (`code === 'trusted'`). */
  readonly ok: boolean;
  /** The registry the document (and therefore this verdict) is for. */
  readonly registryId: string;
  /**
   * The countersign root the operator's pin matched — populated whenever a pin
   * matched (`trusted`, `not-yet-valid`, `expired`), `undefined` when no pin
   * covered the document (`registry-mismatch`, `unpinned`).
   */
  readonly matchedRoot: string | undefined;
  /** The channel of the pin that matched, or `undefined` when none matched. */
  readonly matchedChannel: TrustPinChannel | undefined;
  /**
   * Whether the document is in a rotation overlap — it lists more than one
   * countersign root, so a host pinned to either the outgoing or incoming root
   * matches (SPEC §4.4). A document fact, reported on every verdict.
   */
  readonly overlap: boolean;
  /**
   * The document's `crossSig` (the outgoing root's signature over the document),
   * passed through unverified for the `verifyRelease` orchestrator (#20) to check
   * cryptographically. `undefined` outside a rotation.
   */
  readonly crossSig: string | undefined;
}

/** Narrow to a non-null, non-array object without asserting its field types. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether `value` is an array of strings (an empty array qualifies). */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Narrow an untrusted `unknown` into a {@link TrustRootDoc}, validating the fields
 * {@link evaluateTrustRoot} depends on. Total — never throws; a malformed input
 * yields `{ ok: false, reason }` with a stable {@link TrustRootParseCode}.
 *
 * Optional fields (`publisherCARoots`, `crossSig`) are validated only when present
 * and carried through only when present, so the narrowed document round-trips
 * under `exactOptionalPropertyTypes`. Unknown extra properties are ignored here —
 * the generated JSON Schema is the strict wire gate that rejects them (FR-5).
 */
export function parseTrustRoot(input: unknown): TrustRootParse {
  if (!isRecord(input)) return { ok: false, reason: 'not-an-object' };

  if (typeof input.registryId !== 'string') return fail('malformed-field');

  if (typeof input.formatVersion !== 'string' || !FORMAT_VERSION_RE.test(input.formatVersion)) {
    return fail('malformed-field');
  }
  if (Number.parseInt(input.formatVersion, 10) !== SUPPORTED_MAJOR) {
    return fail('unsupported-format-version');
  }

  if (!isStringArray(input.countersignRoots)) return fail('malformed-field');
  if (input.countersignRoots.length === 0) return fail('empty-countersign-roots');

  if (!isStringArray(input.issuerAllowlist)) return fail('malformed-field');
  if (!isStringArray(input.logPublicKeys)) return fail('malformed-field');
  if (input.publisherCARoots !== undefined && !isStringArray(input.publisherCARoots)) {
    return fail('malformed-field');
  }

  if (!Number.isInteger(input.notBefore)) return fail('malformed-field');
  if (!Number.isInteger(input.notAfter)) return fail('malformed-field');
  if ((input.notAfter as number) < (input.notBefore as number)) {
    return fail('invalid-validity-window');
  }

  if (input.crossSig !== undefined && typeof input.crossSig !== 'string') return fail('malformed-field');

  const doc: TrustRootDoc = {
    formatVersion: input.formatVersion,
    registryId: input.registryId,
    countersignRoots: input.countersignRoots,
    issuerAllowlist: input.issuerAllowlist,
    logPublicKeys: input.logPublicKeys,
    notBefore: input.notBefore as number,
    notAfter: input.notAfter as number,
    ...(input.publisherCARoots !== undefined ? { publisherCARoots: input.publisherCARoots } : {}),
    ...(input.crossSig !== undefined ? { crossSig: input.crossSig } : {}),
  };
  return { ok: true, doc };
}

/** Build a parse failure with a stable reason. */
function fail(reason: TrustRootParseCode): TrustRootParse {
  return { ok: false, reason };
}

/**
 * Decide whether a parsed {@link TrustRootDoc} may be trusted, given the
 * operator's out-of-band {@link TrustRootPin}s and the current time `now` (epoch
 * milliseconds, caller-supplied).
 *
 * Checks, in order — the first that fails determines the verdict:
 * 1. **registry** — at least one supplied pin must be for the document's registry,
 *    else `registry-mismatch`.
 * 2. **pinning** — one of those pins must match a `countersignRoots` entry, else
 *    `unpinned` (a network-supplied or rotated-past root the operator never
 *    pinned; SPEC §4.4). A rotation overlap document lists both the outgoing and
 *    incoming roots, so a host pinned to **either** matches here.
 * 3. **validity window** — `now` must be within `[notBefore, notAfter]`, else
 *    `not-yet-valid` (before) or `expired` (after).
 *
 * Passing all three yields `trusted`. Total — never throws.
 */
export function evaluateTrustRoot(
  doc: TrustRootDoc,
  pins: readonly TrustRootPin[],
  now: number,
): TrustRootVerdict {
  const overlap = doc.countersignRoots.length > 1;
  const crossSig = doc.crossSig;

  const forRegistry = pins.filter((pin) => pin.registryId === doc.registryId);
  if (forRegistry.length === 0) {
    return refuse('registry-mismatch', doc.registryId, overlap, crossSig);
  }

  const roots = new Set(doc.countersignRoots);
  const match = forRegistry.find((pin) => roots.has(pin.root));
  if (match === undefined) {
    return refuse('unpinned', doc.registryId, overlap, crossSig);
  }

  if (now < doc.notBefore) {
    return matched('not-yet-valid', doc.registryId, match, overlap, crossSig);
  }
  if (now > doc.notAfter) {
    return matched('expired', doc.registryId, match, overlap, crossSig);
  }
  return matched('trusted', doc.registryId, match, overlap, crossSig);
}

/** A verdict where no pin matched: fail closed, no matched root/channel. */
function refuse(
  code: Extract<TrustRootVerdictCode, 'registry-mismatch' | 'unpinned'>,
  registryId: string,
  overlap: boolean,
  crossSig: string | undefined,
): TrustRootVerdict {
  return { code, ok: false, registryId, matchedRoot: undefined, matchedChannel: undefined, overlap, crossSig };
}

/** A verdict where a pin matched: `trusted`, or a validity-window failure that still names the matched root. */
function matched(
  code: Extract<TrustRootVerdictCode, 'trusted' | 'not-yet-valid' | 'expired'>,
  registryId: string,
  pin: TrustRootPin,
  overlap: boolean,
  crossSig: string | undefined,
): TrustRootVerdict {
  return {
    code,
    ok: code === 'trusted',
    registryId,
    matchedRoot: pin.root,
    matchedChannel: pin.channel,
    overlap,
    crossSig,
  };
}
