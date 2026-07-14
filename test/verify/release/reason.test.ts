import { describe, expect, it } from 'vitest';

import {
  VERIFY_RELEASE_REASONS,
  logReason,
  signatureReason,
  trustParseReason,
  trustVerdictReason,
  type VerifyReleaseReason,
} from '../../../src/verify/release/reason.js';
import type { SignatureVerdictReason } from '../../../src/verify/signature/index.js';
import type { LogVerdictReason } from '../../../src/verify/log/index.js';
import type { TrustRootParseCode, TrustRootVerdictCode } from '../../../src/verify/trust/index.js';

// The canonical stable-enum mapping (docs/SPEC.md §5, §7): a total, stable map
// from every leaf reason into one closed set. Locking the full table here means a
// leaf that adds or renames a reason, or a remap, fails CI — the contract hosts
// switch on cannot drift silently. Also proves the no-tag-echo invariant
// structurally: every canonical value is a fixed literal from the closed set.

const signatureMap: Record<Exclude<SignatureVerdictReason, 'ok'>, VerifyReleaseReason> = {
  'unsupported-format-version': 'unsupported-format',
  'unsupported-signature-alg': 'unsupported-format',
  'subject-hash-mismatch': 'content-hash-mismatch',
  'publisher-cert-malformed': 'publisher-signature-invalid',
  'publisher-cert-untrusted': 'publisher-untrusted',
  'publisher-cert-missing-identity': 'publisher-identity-invalid',
  'publisher-issuer-mismatch': 'publisher-identity-invalid',
  'publisher-issuer-not-allowlisted': 'issuer-not-allowlisted',
  'publisher-identity-mismatch': 'publisher-identity-invalid',
  'publisher-signature-invalid': 'publisher-signature-invalid',
  'registry-signature-missing': 'registry-countersignature-missing',
  'registry-cert-malformed': 'registry-countersignature-invalid',
  'registry-cert-untrusted': 'registry-countersignature-invalid',
  'registry-signature-invalid': 'registry-countersignature-invalid',
};

const logMap: Record<Exclude<LogVerdictReason, 'ok'>, VerifyReleaseReason> = {
  'malformed-checkpoint': 'log-inclusion-invalid',
  'unsupported-key-algorithm': 'log-inclusion-invalid',
  'checkpoint-key-mismatch': 'log-inclusion-invalid',
  'checkpoint-signature-invalid': 'log-inclusion-invalid',
  'checkpoint-mismatch': 'log-inclusion-invalid',
  'malformed-entry': 'log-inclusion-invalid',
  'index-out-of-range': 'log-inclusion-invalid',
  'malformed-inclusion-proof': 'log-inclusion-invalid',
  'inclusion-proof-invalid': 'log-inclusion-invalid',
  'checkpoint-origin-mismatch': 'log-forked',
  'malformed-consistency-proof': 'log-forked',
  'consistency-proof-invalid': 'log-forked',
};

const trustParseMap: Record<TrustRootParseCode, VerifyReleaseReason> = {
  'not-an-object': 'trust-root-malformed',
  'malformed-field': 'trust-root-malformed',
  'unsupported-format-version': 'trust-root-malformed',
  'empty-countersign-roots': 'trust-root-malformed',
  'invalid-validity-window': 'trust-root-malformed',
};

const trustVerdictMap: Record<Exclude<TrustRootVerdictCode, 'trusted'>, VerifyReleaseReason> = {
  'registry-mismatch': 'trust-root-untrusted',
  unpinned: 'trust-root-untrusted',
  'not-yet-valid': 'trust-root-expired',
  expired: 'trust-root-expired',
};

describe('canonical reason mapping', () => {
  it('maps every signature reason to its documented class', () => {
    for (const [reason, canonical] of Object.entries(signatureMap)) {
      const mapped = signatureReason(reason as Exclude<SignatureVerdictReason, 'ok'>);
      expect(mapped).toBe(canonical);
      expect(VERIFY_RELEASE_REASONS).toContain(mapped);
    }
  });

  it('maps every log reason to its documented class (inclusion vs forked)', () => {
    for (const [reason, canonical] of Object.entries(logMap)) {
      const mapped = logReason(reason as Exclude<LogVerdictReason, 'ok'>);
      expect(mapped).toBe(canonical);
      expect(VERIFY_RELEASE_REASONS).toContain(mapped);
    }
  });

  it('maps every trust-root parse failure to trust-root-malformed', () => {
    for (const [reason, canonical] of Object.entries(trustParseMap)) {
      const mapped = trustParseReason(reason as TrustRootParseCode);
      expect(mapped).toBe(canonical);
      expect(VERIFY_RELEASE_REASONS).toContain(mapped);
    }
  });

  it('maps every trust-root verdict failure to its documented class', () => {
    for (const [reason, canonical] of Object.entries(trustVerdictMap)) {
      const mapped = trustVerdictReason(reason as Exclude<TrustRootVerdictCode, 'trusted'>);
      expect(mapped).toBe(canonical);
      expect(VERIFY_RELEASE_REASONS).toContain(mapped);
    }
  });
});
