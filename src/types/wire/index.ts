/**
 * Wire formats (docs/SPEC.md §4): the signed documents Gridmason parts exchange
 * on the sign/verify path — signature envelope, transparency-log entry,
 * revocation & kill feed, trust-root document, offline bundle. TypeScript is the
 * authoring surface; the JSON Schemas under `schemas/` are generated (FR-5).
 *
 * Landed: the dual-signature envelope (§4.2), the revocation & kill feed (§4.3),
 * the transparency-log entry (§4.3), the trust-root document (§4.4), and the
 * offline bundle (§4.5). The remaining wire formats join here as their P-E3/P-E4
 * leaves land.
 */
export type {
  SignatureAlg,
  SignatureSubject,
  PublisherSignature,
  RegistryCountersignature,
  LogInclusion,
  SignatureEnvelope,
} from './signature.js';
export type {
  ArtifactState,
  Cursor,
  RevocationEntry,
  RevocationFeed,
  RevocationSeverity,
} from './revocation.js';
export type { LogInclusionProof, TransparencyLogEntry } from './log-entry.js';
export type { TrustRootDoc } from './trust-root.js';
export type { GmbBundle, GmbPayload, GmbFile } from './bundle.js';
