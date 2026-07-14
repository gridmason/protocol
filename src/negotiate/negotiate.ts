/**
 * Format-version negotiation (docs/SPEC.md §5, §6).
 *
 * Every gridmason wire format carries a `formatVersion: major.minor` string —
 * **minor is additive/back-compatible, major is breaking**. A build declares the
 * set of format majors it can read ({@link FormatSupport}); `negotiate` decides
 * whether a remote artifact's `formatVersion` may be read as-is (`ok`), signals a
 * still-readable older major that the peer should migrate off (`upgrade`), or is
 * refused outright (`refuse`). It **never guesses**: an unparseable version, a
 * major newer than any this build speaks, or a major this build no longer speaks
 * all refuse.
 *
 * Pure and isomorphic — no I/O, no clock, no key handling (SPEC §7). The
 * *deprecation / dual-running* policy this encodes is documented in the README:
 * `protocol` defines only when a build **stops speaking** a major (a major leaves
 * {@link FormatSupport.speaks}); *serving* retirement of a retired major is a
 * per-registry decision, out of scope here.
 */

/**
 * A wire `formatVersion` as a `major.minor` string, e.g. `"1.0"`, `"1.3"`. This
 * is the exact shape carried by every format document (manifest, signature
 * envelope, trust root, revocation feed). Anything that is not two
 * dot-separated non-negative integers is malformed and negotiates to `refuse`.
 */
export type FormatVersion = string;

/**
 * The set of format majors a build speaks (docs/SPEC.md §6). This is the single
 * declaration of what `verify/` and `negotiate/` can read; the newest entry is
 * the *current* major that new artifacts should target, and every other entry is
 * an older major still inside its dual-running window.
 *
 * A major is dropped from {@link speaks} exactly when the build **stops speaking**
 * it — the only lifecycle event `protocol` defines (SPEC §6). After that, a
 * remote on the dropped major refuses rather than upgrades.
 */
export interface FormatSupport {
  /**
   * Every format major this build can read. Order-independent; the largest value
   * is treated as the current/preferred major. Must be non-empty for any version
   * to be accepted — a build that speaks nothing refuses everything.
   */
  readonly speaks: readonly number[];
}

/**
 * The verdict of {@link negotiate}. A **stable enum** (SPEC §5) hosts switch on:
 *
 * - `ok`      — the remote major is the current one this build speaks; read it.
 *   Any minor is safe: a higher minor is additive, a lower minor is a subset.
 * - `upgrade` — the remote major is older than current but still spoken (inside
 *   its dual-running window); readable now, but the peer should migrate forward.
 * - `refuse`  — malformed version, a major newer than any spoken, or a major no
 *   longer spoken. Never guessed — the caller must not load the artifact.
 */
export type NegotiationOutcome = 'ok' | 'upgrade' | 'refuse';

/**
 * The format majors `@gridmason/protocol` itself speaks — the canonical
 * {@link FormatSupport} for this build, matching the major the `verify/` modules
 * accept (`1`). A host with its own dual-running policy may pass a different
 * {@link FormatSupport}; this is the default when it simply asks "what does the
 * shipped protocol read?".
 */
export const PROTOCOL_FORMAT_SUPPORT: FormatSupport = { speaks: [1] };

/** `major.minor` shape a `formatVersion` must have before its major is read. */
const FORMAT_VERSION_RE = /^(\d+)\.\d+$/;

/**
 * Major component of a `major.minor` version string, or `undefined` if malformed.
 * Mirrors the parse used on the `verify/` hot path so both halves reject the same
 * strings.
 */
function parseMajor(formatVersion: FormatVersion): number | undefined {
  const match = FORMAT_VERSION_RE.exec(formatVersion);
  return match ? Number(match[1]) : undefined;
}

/**
 * Decide how a build that speaks `local` should treat a remote artifact whose
 * format version is `remote` (docs/SPEC.md §5, §6).
 *
 * @param local  The majors this build speaks; newest is the current major.
 * @param remote The remote artifact's `major.minor` `formatVersion`.
 * @returns `ok` (current major, read as-is), `upgrade` (older but still spoken —
 *   read, but migrate the peer forward), or `refuse` (malformed, too new, or no
 *   longer spoken — never guessed).
 */
export function negotiate(local: FormatSupport, remote: FormatVersion): NegotiationOutcome {
  const major = parseMajor(remote);
  // Unparseable version — never guess what the peer meant.
  if (major === undefined) return 'refuse';

  const { speaks } = local;
  if (speaks.length === 0) return 'refuse';

  const current = Math.max(...speaks);
  // A major newer than anything we speak: refuse rather than assume back-compat.
  if (major > current) return 'refuse';
  // A major we do not (or no longer) speak — including gaps below current.
  if (!speaks.includes(major)) return 'refuse';
  // The current major: any minor is additive/back-compatible, so read as-is.
  if (major === current) return 'ok';
  // An older major we still speak (dual-running window): readable, but migrate.
  return 'upgrade';
}
