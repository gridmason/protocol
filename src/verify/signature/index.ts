/**
 * Dual-signature envelope verification (docs/SPEC.md §4.2, §5; FR-9): publisher
 * (Sigstore keyless, OIDC issuer allowlist) + registry countersignature, over the
 * canonicalized release document. Pure, isomorphic, WebCrypto-only, zero runtime
 * dependencies. Part of the security core: held at 100% coverage (GW-D20 gate).
 */
export {
  verifySignatureEnvelope,
  SIGNATURE_FORMAT_MAJOR,
  type SignatureVerdict,
  type SignatureVerdictReason,
  type SignatureTrustInputs,
  type VerifySignatureInput,
} from './signature.js';
export type { CertIdentity } from './der.js';
