/**
 * Format-version **negotiation** conformance vectors (docs/SPEC.md §5, §6).
 *
 * Each vector pins the `ok` | `upgrade` | `refuse` verdict a conforming
 * {@link import('../negotiate/negotiate.js').negotiate} must return for a remote
 * `formatVersion` against the majors a build speaks. Consumers (core / cli /
 * registry / dashboard) run these through {@link import('./runner.js').runConformanceVectors}
 * so a divergent handshake fails a shared test rather than production.
 *
 * Vectors are versioned by format major (SPEC §6): the `speaks` set names the
 * majors under test, so adding a new format major adds vectors here without
 * changing the ones already pinned.
 */

import type { NegotiateVector } from './types.js';

/**
 * The negotiation corpus — positive (`ok`), migration (`upgrade`), and refusal
 * (`refuse`) cases, including malformed versions the negotiator must not guess.
 */
export const negotiateVectors: readonly NegotiateVector[] = [
  // ok — the remote is on the current major this build speaks.
  {
    name: 'current-major-exact',
    speaks: [1],
    remote: '1.0',
    outcome: 'ok',
  },
  {
    name: 'current-major-higher-minor-additive',
    speaks: [1],
    remote: '1.7',
    outcome: 'ok',
    note: 'a higher minor is additive/back-compatible, so still read as-is',
  },
  {
    name: 'current-major-is-newest-spoken',
    speaks: [1, 2],
    remote: '2.3',
    outcome: 'ok',
    note: 'newest spoken major (2) is current; a 2.x remote is ok, not upgrade',
  },
  // upgrade — an older major the build still speaks (dual-running window).
  {
    name: 'older-major-still-spoken',
    speaks: [1, 2],
    remote: '1.0',
    outcome: 'upgrade',
    note: 'readable now, but the peer should migrate to the current major',
  },
  {
    name: 'older-major-minor-irrelevant',
    speaks: [1, 2],
    remote: '1.9',
    outcome: 'upgrade',
    note: 'any minor of an older-but-spoken major upgrades',
  },
  {
    name: 'middle-major-still-spoken',
    speaks: [1, 2, 3],
    remote: '2.0',
    outcome: 'upgrade',
  },
  // refuse — never guess.
  {
    name: 'newer-major-than-spoken',
    speaks: [1],
    remote: '2.0',
    outcome: 'refuse',
    note: 'a major newer than any spoken is refused, not assumed compatible',
  },
  {
    name: 'major-no-longer-spoken',
    speaks: [2, 3],
    remote: '1.0',
    outcome: 'refuse',
    note: 'the dual-running window for major 1 has closed — the build stopped speaking it',
  },
  {
    name: 'gap-major-between-spoken',
    speaks: [1, 3],
    remote: '2.0',
    outcome: 'refuse',
  },
  {
    name: 'speaks-nothing',
    speaks: [],
    remote: '1.0',
    outcome: 'refuse',
  },
  {
    name: 'malformed-missing-minor',
    speaks: [1],
    remote: '1',
    outcome: 'refuse',
  },
  {
    name: 'malformed-trailing-dot',
    speaks: [1],
    remote: '1.',
    outcome: 'refuse',
  },
  {
    name: 'malformed-three-part',
    speaks: [1],
    remote: '1.0.0',
    outcome: 'refuse',
  },
  {
    name: 'malformed-prefixed',
    speaks: [1],
    remote: 'v1.0',
    outcome: 'refuse',
  },
  {
    name: 'malformed-empty',
    speaks: [1],
    remote: '',
    outcome: 'refuse',
  },
];
