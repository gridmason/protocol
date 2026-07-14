/**
 * Wire formats for the sign/verify byte path (docs/SPEC.md §4.2): the detached
 * dual-signature envelope over a canonicalized release document. TypeScript is
 * the authoring surface; the JSON Schemas under `schemas/` are generated (FR-5).
 */
export type {
  SignatureAlg,
  SignatureSubject,
  PublisherSignature,
  RegistryCountersignature,
  LogInclusion,
  SignatureEnvelope,
} from './signature.js';
