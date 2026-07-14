/**
 * Revocation-feed freshness evaluation (docs/SPEC.md §4.3, §5) — the load gate a
 * host runs, per registry, before loading that registry's remotes.
 *
 * The rule is **fail-closed, scoped to the stale registry only**: while a
 * registry's feed is within its TTL the host may load that registry's remotes
 * (fail-open, minus any individually revoked/killed artifacts); once the feed is
 * past its TTL the host MUST re-check *that* feed before loading *its* remotes —
 * but the block is scoped to that one registry. Every other registry, and all
 * non-registry content, is unaffected: a host achieves the scoping by calling
 * {@link evaluateFreshness} once per registry and acting on each verdict
 * independently (see the multi-registry vectors).
 *
 * Pure and isomorphic: no I/O, no key handling, no clock — the caller supplies
 * `now` (SPEC §5). Every outcome is a stable {@link FreshnessVerdictCode} so
 * hosts render consistent error boundaries and telemetry aggregates cleanly.
 * Held at 100% line/branch coverage (GW-D20 gate).
 */

import type { Cursor, RevocationEntry, RevocationFeed } from '../../types/wire/revocation.js';

/**
 * Why {@link evaluateFreshness} reached its conclusion. Stable across versions —
 * callers and logs may switch on these.
 *
 * - `fresh`             — feed within TTL and not rolled back: this registry's
 *                         remotes may load, except any artifact named in
 *                         {@link FreshnessVerdict.blocked}.
 * - `stale`             — `now` is past `issuedAt + ttlSeconds`: fail closed for
 *                         this registry only. Its remotes are blocked until the
 *                         host re-checks the feed.
 * - `rolled-back`       — the feed's `seq` is below the cursor's: an older feed
 *                         replayed. Rejected regardless of TTL.
 * - `registry-mismatch` — the feed and cursor are for different registries: the
 *                         caller paired the wrong cursor. Fail closed.
 */
export type FreshnessVerdictCode = 'fresh' | 'stale' | 'rolled-back' | 'registry-mismatch';

/**
 * An artifact the host must not load even though the registry is fresh, because
 * the feed revoked or killed it. Carries the {@link RevocationEntry} `state` so
 * a host can additionally force-unload the `killed` ones (SPEC §4.3).
 */
export interface BlockedArtifact {
  /** The artifact id from the feed entry, matched verbatim by the host. */
  readonly artifact: RevocationEntry['artifact'];
  /** Whether the artifact was revoked (block new loads) or killed (also unload). */
  readonly state: RevocationEntry['state'];
  /** The entry's advisory severity, passed through for host triage. */
  readonly severity: RevocationEntry['severity'];
}

/**
 * The per-registry load decision. Total: {@link evaluateFreshness} never throws —
 * every input yields a verdict.
 */
export interface FreshnessVerdict {
  /** Machine-readable outcome. */
  readonly code: FreshnessVerdictCode;
  /** Convenience gate: `true` iff this registry's remotes may load (`code === 'fresh'`). */
  readonly ok: boolean;
  /**
   * The registry this verdict governs. The host applies the decision (and, when
   * `code` is `stale`, the fail-closed block) to **only** this registry's
   * remotes — everything else stays fail-open.
   */
  readonly registryId: string;
  /**
   * Artifacts individually blocked by revoked/killed entries. Populated only when
   * `code` is `fresh` (when the whole registry is blocked the per-artifact list
   * is moot); one item per feed entry, in feed order.
   */
  readonly blocked: readonly BlockedArtifact[];
  /**
   * The `seq` the host should store to its cursor when it accepts a fresh feed
   * (`undefined` on every non-`fresh` outcome, since nothing is accepted).
   */
  readonly nextSeq: number | undefined;
}

/** Number of milliseconds in one second — `ttlSeconds` is a duration; `now`/`issuedAt` are ms. */
const MS_PER_SECOND = 1000;

/**
 * Decide whether one registry's remotes may load, given that registry's
 * already-authenticated {@link RevocationFeed}, the host's {@link Cursor} for it,
 * and the current time `now` (epoch milliseconds, caller-supplied).
 *
 * Checks, in order — the first that fails determines the verdict:
 * 1. **registry match** — feed and cursor must name the same registry.
 * 2. **monotonicity** — `feed.seq` must be ≥ `cursor.seq` (a lower seq is a
 *    replayed older feed → `rolled-back`), regardless of the feed's TTL.
 * 3. **freshness** — `now` must not be past `issuedAt + ttlSeconds * 1000`.
 *
 * Passing all three yields `fresh`: the registry's remotes may load, minus the
 * artifacts named in `blocked` (its revoked/killed entries).
 */
export function evaluateFreshness(feed: RevocationFeed, cursor: Cursor, now: number): FreshnessVerdict {
  if (feed.registryId !== cursor.registryId) {
    return refuse('registry-mismatch', feed.registryId);
  }
  if (feed.seq < cursor.seq) {
    return refuse('rolled-back', feed.registryId);
  }
  if (now > feed.issuedAt + feed.ttlSeconds * MS_PER_SECOND) {
    return refuse('stale', feed.registryId);
  }
  return {
    code: 'fresh',
    ok: true,
    registryId: feed.registryId,
    blocked: feed.entries.map((entry) => ({
      artifact: entry.artifact,
      state: entry.state,
      severity: entry.severity,
    })),
    nextSeq: feed.seq,
  };
}

/** Build a fail-closed verdict: not ok, nothing accepted, no per-artifact list. */
function refuse(code: Exclude<FreshnessVerdictCode, 'fresh'>, registryId: string): FreshnessVerdict {
  return { code, ok: false, registryId, blocked: [], nextSeq: undefined };
}
