/**
 * Trust-root parsing, pinning, and overlap-window rotation (docs/SPEC.md §4.4,
 * §5) — the pure, caller-clock, out-of-band-pinned decision a host runs before it
 * will believe a registry's roots.
 */
export { evaluateTrustRoot, parseTrustRoot } from './trust.js';
export type {
  TrustPinChannel,
  TrustRootParse,
  TrustRootParseCode,
  TrustRootPin,
  TrustRootVerdict,
  TrustRootVerdictCode,
} from './trust.js';
