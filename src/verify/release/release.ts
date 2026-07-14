/**
 * The public verify orchestration (docs/SPEC.md §5; FR-14) — the capstone that
 * composes the leaf verifiers into the single decision every host runs before it
 * loads a release: {@link verifyRelease}. Plus {@link verifyChunk}, the
 * Service-Worker per-fetch hash check.
 *
 * `verifyRelease` runs the checks in defence-in-depth order, each mapping to one
 * stable {@link VerifyReleaseReason} on refusal (SPEC §7, no-tag-echo — see
 * `./reason.ts`):
 *
 * 1. **Trust root** — parse the (untrusted, network-delivered) trust-root
 *    document and evaluate it against the operator's out-of-band pins and `now`:
 *    pinning, validity window, and — for a rotation-overlap document —
 *    cryptographic `crossSig` verification (`./crosssig.ts`). Nothing downstream
 *    is believed until the roots are.
 * 2. **Release integrity + authorship + approval** — canonicalize the release
 *    document and run the dual-signature envelope check (content hash bound to the
 *    signed subject, publisher Sigstore-keyless signature under a pinned CA root +
 *    allowlisted issuer, registry countersignature). The issuer allowlist comes
 *    from the now-trusted document; the root **keys** are the operator's pinned
 *    material.
 * 3. **Transparency log** — confirm the envelope names the supplied log entry, then
 *    verify its inclusion proof against the pinned checkpoint key.
 *
 * On success it returns the `url → hash` map the Service Worker enforces, plus the
 * verified `issuer` and `subject`. Pure and isomorphic: no I/O, no key handling;
 * the caller supplies the bytes, the pinned roots/keys, the log entry, and `now`
 * (SPEC §5). Held at 100% line/branch coverage (GW-D20 gate).
 */

import { canonicalize } from '../../canon/index.js';
import type { MultihashString, ReleaseHashMap } from '../hash/index.js';
import { verifyHash } from '../hash/index.js';
import { verifySignatureEnvelope } from '../signature/index.js';
import { verifyLogInclusion, type LogPublicKey } from '../log/index.js';
import { evaluateTrustRoot, parseTrustRoot, type TrustRootPin } from '../trust/index.js';
import type {
  SignatureEnvelope,
  SignatureSubject,
  TransparencyLogEntry,
} from '../../types/wire/index.js';
import { verifyCrossSig } from './crosssig.js';
import {
  logReason,
  signatureReason,
  trustParseReason,
  trustVerdictReason,
  type VerifyReleaseReason,
} from './reason.js';

/**
 * A signed release document (docs/SPEC.md §4.1) — the artifact identity plus the
 * `{ url → content-hash }` map of every file the runtime may load. Its
 * canonical bytes (JCS / RFC-8785) are what the signature envelope's
 * `subject.releaseHash` covers, so tampering with any listed hash breaks the
 * signature. `verifyRelease` returns {@link files} as a `Map` only after the whole
 * document is proven to hash to the signed subject.
 */
export interface ReleaseDoc {
  /**
   * Wire-format version as `major.minor`.
   * @pattern ^\d+\.\d+$
   */
  readonly formatVersion: string;
  /** Publisher-prefixed, version-qualified artifact id, e.g. `acme-chart@2.3.1`. */
  readonly artifact: string;
  /** Every servable path/URL mapped to the expected hash of its exact served bytes. */
  readonly files: ReleaseHashMap;
}

/**
 * Everything {@link verifyRelease} needs, all caller-supplied — the lib fetches
 * nothing and holds no key. The **document** (trust root) is untrusted network
 * input gated by the operator's **pins**; the root **keys**, the pinned log
 * checkpoint key, and `now` are out-of-band trusted material (SPEC §4.4, §5).
 */
export interface VerifyReleaseInput {
  /** The release document; canonicalized here and bound to the signed subject. */
  readonly release: ReleaseDoc;
  /** The detached dual-signature envelope over the canonicalized release. */
  readonly envelope: SignatureEnvelope;
  /** The untrusted, network-delivered trust-root document (parsed + pinned here). */
  readonly trustRoot: unknown;
  /** The operator's out-of-band pins that authorize the trust-root document. */
  readonly pins: readonly TrustRootPin[];
  /** Pinned publisher CA root public keys (SPKI DER) that may issue publisher leaf certs. */
  readonly publisherCARoots: readonly Uint8Array[];
  /** Pinned registry countersign root public keys (SPKI DER); also the rotation cross-signers. */
  readonly countersignRoots: readonly Uint8Array[];
  /** The full transparency-log entry (Rekor-shaped) proving the release was logged. */
  readonly logEntry: TransparencyLogEntry;
  /** The pinned transparency-log checkpoint key (GW-D17) the inclusion proof is checked against. */
  readonly logPublicKey: LogPublicKey;
  /** Caller-supplied clock, epoch milliseconds (keeps the lib pure). */
  readonly now: number;
}

/**
 * The verdict of {@link verifyRelease}. A discriminated union: on success the
 * `url → hash` map plus the verified `issuer` and `subject`; on failure a single
 * stable {@link VerifyReleaseReason} (never an input-derived identifier, SPEC §7).
 */
export type VerifyReleaseResult =
  | {
      readonly ok: true;
      /** Every servable URL mapped to its verified content hash — the Service Worker's enforcement table. */
      readonly urlHashes: Map<string, MultihashString>;
      /** The verified OIDC issuer of the publisher. */
      readonly issuer: string;
      /** The signed subject (artifact id + release hash) the signatures cover. */
      readonly subject: SignatureSubject;
    }
  | { readonly ok: false; readonly reason: VerifyReleaseReason };

/** Assemble a stable-reason refusal. */
function refuse(reason: VerifyReleaseReason): VerifyReleaseResult {
  return { ok: false, reason };
}

/**
 * Decide whether a release may load. Composes the trust-root, dual-signature, and
 * transparency-log leaf checks; returns the enforceable `url → hash` map on
 * success or a single stable reason on the first failure. Never throws.
 */
export async function verifyRelease(input: VerifyReleaseInput): Promise<VerifyReleaseResult> {
  // 1. Trust root: parse, then pin/validity, then rotation cross-signature.
  const parsed = parseTrustRoot(input.trustRoot);
  if (!parsed.ok) return refuse(trustParseReason(parsed.reason));

  const trust = evaluateTrustRoot(parsed.doc, input.pins, input.now);
  if (!trust.ok) return refuse(trustVerdictReason(trust.code as Exclude<typeof trust.code, 'trusted'>));

  if (trust.overlap) {
    if (trust.crossSig === undefined) return refuse('trust-root-rotation-invalid');
    const crossSigOk = await verifyCrossSig(
      input.trustRoot as Record<string, unknown>,
      trust.crossSig,
      input.countersignRoots,
    );
    if (!crossSigOk) return refuse('trust-root-rotation-invalid');
  }

  // 2. Release integrity + authorship + approval.
  let releaseBytes: Uint8Array;
  try {
    releaseBytes = canonicalize(input.release);
  } catch {
    return refuse('release-malformed');
  }

  const signature = await verifySignatureEnvelope({
    envelope: input.envelope,
    releaseBytes,
    trust: {
      issuerAllowlist: parsed.doc.issuerAllowlist,
      publisherCARoots: input.publisherCARoots,
      countersignRoots: input.countersignRoots,
    },
  });
  if (!signature.ok) return refuse(signatureReason(signature.reason as Exclude<typeof signature.reason, 'ok'>));

  // 3. Transparency log: the envelope must name the supplied entry, which must include.
  const declared = input.envelope.logInclusion;
  if (declared.logId !== input.logEntry.logId || declared.index !== input.logEntry.index) {
    return refuse('log-inclusion-mismatch');
  }
  const log = await verifyLogInclusion(input.logEntry, input.logPublicKey);
  if (!log.ok) return refuse(logReason(log.reason as Exclude<typeof log.reason, 'ok'>));

  // The signed subject binds the canonical release bytes, so `files` is now trusted.
  return {
    ok: true,
    urlHashes: new Map<string, MultihashString>(Object.entries(input.release.files)),
    issuer: input.envelope.publisherSig.issuer,
    subject: input.envelope.subject,
  };
}

/**
 * The Service-Worker per-fetch check (docs/SPEC.md §5): does `bytes` hash to
 * `expectedHash`? Thin gate over `src/verify/hash`; `expectedHash` is one entry of
 * a {@link verifyRelease} `urlHashes` map. Async because the hash primitive is
 * WebCrypto (`subtle.digest`) — the SPEC's synchronous sketch is not achievable
 * without a `node:crypto` import, which would break the package's isomorphism.
 */
export async function verifyChunk(bytes: Uint8Array, expectedHash: string): Promise<boolean> {
  return (await verifyHash(bytes, expectedHash)).ok;
}

/*
 * The fourth member of SPEC §5's public verify API, `negotiate(local, remote)` —
 * the format-version handshake that decides `ok` | `upgrade` | `refuse` — is
 * reserved in its own module, `src/negotiate` (docs/SPEC.md §6), and joins the
 * public surface when that epic lands. It is deliberately not defined here so the
 * package's root barrel never exports two competing negotiate surfaces.
 */
