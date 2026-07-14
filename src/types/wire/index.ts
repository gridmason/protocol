/**
 * Wire formats (docs/SPEC.md §4): the signed documents Gridmason parts exchange
 * on the sign/verify path — signature envelope, transparency-log entry,
 * revocation & kill feed, trust-root document, offline bundle. TypeScript is the
 * authoring surface; the JSON Schemas under `schemas/` are generated (FR-5).
 *
 * Landed: the revocation & kill feed and the transparency-log entry (§4.3). The
 * remaining wire formats join here as their P-E3 leaves land.
 */
export type {
  ArtifactState,
  Cursor,
  RevocationEntry,
  RevocationFeed,
  RevocationSeverity,
} from './revocation.js';
export type { LogInclusionProof, TransparencyLogEntry } from './log-entry.js';
