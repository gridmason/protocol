import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { TransparencyLogEntry } from '../../../src/types/wire/index.js';
import {
  verifyLogConsistency,
  verifyLogInclusion,
  type LogConsistencyInput,
  type LogPublicKey,
} from '../../../src/verify/index.js';

// End-to-end transparency-log verification (docs/SPEC.md §4.3) against the
// recorded Rekor-shaped fixtures (test/vectors/log). This nails the acceptance
// criteria — a real inclusion proof verifies, a tampered proof and a forked log
// are each refused with a distinct reason — and drives every orchestration
// branch of src/verify/log/log.ts for the security-core 100% gate. The exhaustive
// Merkle and checkpoint branch coverage lives in merkle.test.ts / checkpoint.test.ts.

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../vectors/log/${name}`, import.meta.url)), 'utf8')) as T;

const pinnedFixture = load<{ name: string; publicKeyHex: string }>('pinned-key.json');
const pinned: LogPublicKey = {
  name: pinnedFixture.name,
  key: new Uint8Array(Buffer.from(pinnedFixture.publicKeyHex, 'hex')),
};

const validEntry = load<TransparencyLogEntry>('inclusion-valid.json');
const tamperedEntry = load<TransparencyLogEntry>('inclusion-tampered-proof.json');
const validConsistency = load<LogConsistencyInput>('consistency-valid.json');
const forkedConsistency = load<LogConsistencyInput>('consistency-forked.json');
const originMismatch = load<LogConsistencyInput>('consistency-origin-mismatch.json');

/** A deep clone of the valid entry to mutate per-case (plain JSON). */
const clone = (): TransparencyLogEntry => JSON.parse(JSON.stringify(validEntry)) as TransparencyLogEntry;
const A_HEX_ROOT = 'a'.repeat(64);

describe('verifyLogInclusion', () => {
  it('verifies a real Rekor-shaped inclusion proof against the pinned checkpoint', async () => {
    expect(await verifyLogInclusion(validEntry, pinned)).toEqual({ reason: 'ok', ok: true });
  });

  it('rejects a tampered inclusion proof with a distinct reason', async () => {
    expect(await verifyLogInclusion(tamperedEntry, pinned)).toEqual({
      reason: 'inclusion-proof-invalid',
      ok: false,
    });
  });

  it('refuses when the checkpoint note does not verify', async () => {
    const entry = clone();
    entry.checkpoint = entry.checkpoint.replace('\n8\n', '\n9\n'); // signature no longer covers body
    expect((await verifyLogInclusion(entry, pinned)).reason).toBe('checkpoint-signature-invalid');
  });

  describe('checkpoint-mismatch: entry disagrees with the signed head', () => {
    it('when the asserted root hash is not hex', async () => {
      const entry = clone();
      entry.inclusionProof.rootHash = 'not-hex';
      expect((await verifyLogInclusion(entry, pinned)).reason).toBe('checkpoint-mismatch');
    });

    it('when the asserted tree size differs', async () => {
      const entry = clone();
      entry.inclusionProof.treeSize = 7;
      expect((await verifyLogInclusion(entry, pinned)).reason).toBe('checkpoint-mismatch');
    });

    it('when the asserted root hash differs from the signed root', async () => {
      const entry = clone();
      entry.inclusionProof.rootHash = A_HEX_ROOT;
      expect((await verifyLogInclusion(entry, pinned)).reason).toBe('checkpoint-mismatch');
    });
  });

  describe('index-out-of-range', () => {
    it('rejects an index at or beyond the tree size', async () => {
      const entry = clone();
      entry.index = 8;
      expect((await verifyLogInclusion(entry, pinned)).reason).toBe('index-out-of-range');
    });

    it('rejects a negative index', async () => {
      const entry = clone();
      entry.index = -1;
      expect((await verifyLogInclusion(entry, pinned)).reason).toBe('index-out-of-range');
    });
  });

  it('rejects an entry whose canonicalBody is not valid base64', async () => {
    const entry = clone();
    entry.canonicalBody = 'not*base64';
    expect((await verifyLogInclusion(entry, pinned)).reason).toBe('malformed-entry');
  });

  describe('malformed-inclusion-proof', () => {
    it('when a node hash is not valid hex', async () => {
      const entry = clone();
      entry.inclusionProof.hashes[0] = 'zz';
      expect((await verifyLogInclusion(entry, pinned)).reason).toBe('malformed-inclusion-proof');
    });

    it('when the proof has the wrong number of nodes', async () => {
      const entry = clone();
      entry.inclusionProof.hashes = entry.inclusionProof.hashes.slice(1); // one short
      expect((await verifyLogInclusion(entry, pinned)).reason).toBe('malformed-inclusion-proof');
    });
  });

  it('rejects a 32-byte-but-non-Ed25519 pinned key length', async () => {
    const short: LogPublicKey = { name: pinned.name, key: pinned.key.subarray(0, 31) };
    expect((await verifyLogInclusion(validEntry, short)).reason).toBe('unsupported-key-algorithm');
  });
});

describe('verifyLogConsistency', () => {
  it('verifies a valid consistency proof (log grew append-only)', async () => {
    expect(await verifyLogConsistency({ ...validConsistency, logPublicKey: pinned })).toEqual({
      reason: 'ok',
      ok: true,
    });
  });

  it('rejects a forked log with a distinct reason', async () => {
    expect(await verifyLogConsistency({ ...forkedConsistency, logPublicKey: pinned })).toEqual({
      reason: 'consistency-proof-invalid',
      ok: false,
    });
  });

  it('rejects two checkpoints that name different logs', async () => {
    expect((await verifyLogConsistency({ ...originMismatch, logPublicKey: pinned })).reason).toBe(
      'checkpoint-origin-mismatch',
    );
  });

  it('refuses when the old checkpoint does not verify', async () => {
    const input = { ...validConsistency, oldCheckpoint: 'garbage', logPublicKey: pinned };
    expect((await verifyLogConsistency(input)).reason).toBe('malformed-checkpoint');
  });

  it('refuses when the new checkpoint does not verify', async () => {
    const input = { ...validConsistency, newCheckpoint: 'garbage', logPublicKey: pinned };
    expect((await verifyLogConsistency(input)).reason).toBe('malformed-checkpoint');
  });

  it('rejects a proof whose node hash is not valid hex', async () => {
    const input = { ...validConsistency, proof: ['zz'], logPublicKey: pinned };
    expect((await verifyLogConsistency(input)).reason).toBe('malformed-consistency-proof');
  });

  it('rejects a proof of the wrong length', async () => {
    const input = {
      ...validConsistency,
      proof: [...validConsistency.proof, 'b'.repeat(64)], // one extra well-formed node
      logPublicKey: pinned,
    };
    expect((await verifyLogConsistency(input)).reason).toBe('malformed-consistency-proof');
  });
});
