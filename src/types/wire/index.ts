/**
 * Wire formats (docs/SPEC.md §4): the signed documents Gridmason parts exchange
 * on the sign/verify path — signature envelope, transparency-log entry,
 * revocation & kill feed, trust-root document, offline bundle. TypeScript is the
 * authoring surface; the JSON Schemas under `schemas/` are generated (FR-5).
 *
 * The revocation & kill feed (§4.3) and trust-root document (§4.4) have landed;
 * the remaining wire formats are populated by their P-E3 leaf issues.
 */
export type {
  ArtifactState,
  Cursor,
  RevocationEntry,
  RevocationFeed,
  RevocationSeverity,
} from './revocation.js';
export type { TrustRootDoc } from './trust-root.js';
