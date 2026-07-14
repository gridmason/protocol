/**
 * Dual-signature **envelope** conformance vectors (docs/SPEC.md §4.2, §7; FR-15,
 * P-E4 — the `wrong issuer` negative of the SPEC §7 set).
 *
 * These exercise the release-signature verdict path
 * ({@link import('../verify/signature/signature.js').verifySignatureEnvelope})
 * against a **frozen, recorded** dual-signed envelope: a real ECDSA-P256 publisher
 * leaf (Fulcio-style OIDC-issuer + SAN extensions) countersigned by a registry
 * leaf, over the canonical bytes of a release document. The material was minted
 * once with WebCrypto and recorded here — signing is randomized so a per-run blob
 * could not be reproduced, but **verification is deterministic**, and the
 * signature verifier has no clock, so the frozen fixture verifies identically
 * forever. The production sign path (a DER encoder, key minting) deliberately
 * lives outside this package (SPEC §5); only the recorded outputs ship.
 *
 * The load-bearing negatives are the two shapes of a wrong issuer (SPEC §7):
 * `publisher-issuer-not-allowlisted` (the attested issuer is off the registry's
 * allowlist) and `publisher-issuer-mismatch` (the envelope's declared issuer
 * disagrees with the certificate it presents). A consumer whose runner "passes"
 * either fails its build (SPEC §6, §7).
 */

import type { SignatureEnvelope } from '../types/wire/signature.js';
import type { SignatureTrustInputs } from '../verify/index.js';
import type { SignatureVector } from './types.js';

/** Decode a lowercase-hex fixture string to its bytes. */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// --- the one recorded dual-signed scenario -------------------------------------
// A valid envelope over canonicalize({widget:'acme-chart',version:'2.3.1',entry:
// 'index.js'}); publisher leaf attests issuer https://accounts.google.com + SAN
// dev@acme.com, countersigned by the registry leaf. All negatives below reuse
// these exact bytes and differ only in the trust inputs or the declared issuer,
// so each vector isolates the one check under test.

const releaseBytes = hexToBytes(
  '7b22656e747279223a22696e6465782e6a73222c2276657273696f6e223a22322e332e31222c22776964676574223a2261636d652d6368617274227d',
);

/** SPKI DER (hex) of the root that issued the publisher leaf certificate. */
const publisherCARootHex =
  '3059301306072a8648ce3d020106082a8648ce3d030107034200047161492546b165e21dc11ba8bc29df5f2650427e162501b27295866b4befb2fc024c71707c4c56cc785ed613ef92708bb1694781efe07a1b0a27508fd2c41c72';
/** SPKI DER (hex) of the root that issued the registry countersign leaf. */
const countersignRootHex =
  '3059301306072a8648ce3d020106082a8648ce3d030107034200046c07a910207ecdf7cd7dbb12d440b90bae8131ca28b39e6be96134e33d364023c7f1754a4f39606add5cde2f56b0483846d1918fc6ee53ec6c668c302af271f9';

const ISSUER = 'https://accounts.google.com';

const envelope: SignatureEnvelope = {
  formatVersion: '1.0',
  subject: {
    artifact: 'acme-chart@2.3.1',
    releaseHash: 'sha2-256:32d05fbeb9ac076f2e8d886b0c844db25d62f82915f7226ff7522a51d8dfbf41',
  },
  publisherSig: {
    alg: 'ES256',
    cert: 'MIIBNTCB26ADAgECAgEBMAoGCCqGSM49BAMCMAAwHhcNMjQwMTAxMDAwMDAwWhcNMzQwMTAxMDAwMDAwWjAAMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAECzDtfW0tiJRe7YPQdUgz65mST380WKR2lWmUZhgnCMD1ZPdFFPYRUkjkMFi1jneXrQiIAOXiUZH7Unurac9BtqNGMEQwKQYKKwYBBAGDvzABAQQbaHR0cHM6Ly9hY2NvdW50cy5nb29nbGUuY29tMBcGA1UdEQQQMA6BDGRldkBhY21lLmNvbTAKBggqhkjOPQQDAgNJADBGAiEArR8lsWA6Hen12uLd9MVA68fAAW16DXc1jmOKXie98QUCIQD1SRxkQwZv8V+IE7WGvePR4JytIKcNzmcJJmdQvxnxLA==',
    issuer: ISSUER,
    subjectClaims: { email: 'dev@acme.com' },
    sig: 'poDzjCEMDDbvVIj1/hkc3csEWbEBJXWFEPRbZKUteG8wczGGUN7bH3dcx331bwx7HBM0TYJ/0NmvdALL6HIk1A==',
  },
  registrySig: {
    alg: 'ES256',
    cert: 'MIHsMIGToAMCAQICAQEwCgYIKoZIzj0EAwIwADAeFw0yNDAxMDEwMDAwMDBaFw0zNDAxMDEwMDAwMDBaMAAwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQOLkp9yNXjrZoqLsrqKfeuWfZvokR79k5gk524BRpLME9GtNAUDg79i3EIVdZtY6x3UeSiPGzAobCR4rz190pIMAoGCCqGSM49BAMCA0gAMEUCICXI29dYzDLnbnSdjk/c/XiUXiuVv7LvRkJXRaQzY1EIAiEAvF86iVIvlAQDwcpLIZDkO85/4yKipBA8+ruOEISqgiY=',
    sig: '9yzUErUnjg197hklDkKrtQ5OQ4BtKaXSiY9i0OTlOYDPbRdNvJWOy/9Ahc0P1XpyW87+4PQSzXr9SPc+WVRGgA==',
  },
  logInclusion: { logId: 'rekor.example', index: 88421, proof: [] },
};

/** The pinned trust material that makes the recorded envelope verify. */
const trust: SignatureTrustInputs = {
  issuerAllowlist: [ISSUER],
  publisherCARoots: [hexToBytes(publisherCARootHex)],
  countersignRoots: [hexToBytes(countersignRootHex)],
};

/**
 * The signature corpus: the recorded positive plus the two `wrong issuer`
 * negatives (SPEC §7). Each shares the frozen envelope + release bytes.
 */
export const signatureVectors: readonly SignatureVector[] = [
  {
    name: 'valid dual-signed envelope',
    input: { envelope, releaseBytes, trust },
    reason: 'ok',
    note: 'recorded once; verification is deterministic',
  },
  {
    name: 'attested issuer is not on the registry allowlist',
    input: { envelope, releaseBytes, trust: { ...trust, issuerAllowlist: [] } },
    reason: 'publisher-issuer-not-allowlisted',
    note: 'wrong-issuer negative — a passing consumer fails its build (SPEC §7)',
  },
  {
    name: 'envelope issuer disagrees with the certificate',
    input: {
      envelope: { ...envelope, publisherSig: { ...envelope.publisherSig, issuer: 'https://evil.example' } },
      releaseBytes,
      trust,
    },
    reason: 'publisher-issuer-mismatch',
    note: 'wrong-issuer negative — the declared issuer must match the cert (SPEC §7)',
  },
];
