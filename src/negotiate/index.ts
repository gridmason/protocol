/**
 * Format-version negotiation (docs/SPEC.md §6): which format majors this build
 * speaks, and whether a remote's `formatVersion` is ok / needs upgrade /
 * must be refused. Refuses unknown majors rather than guessing.
 *
 * The `@gridmason/protocol/negotiate` subpath export (see package.json). The
 * {@link FormatSupport} type declared here is the single description of the
 * majors this build reads, shared with the `verify/` modules (SPEC §6).
 */
export { negotiate, PROTOCOL_FORMAT_SUPPORT } from './negotiate.js';
export type { FormatSupport, FormatVersion, NegotiationOutcome } from './negotiate.js';
