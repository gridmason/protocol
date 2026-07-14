import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { verifyCrossSig } from '../../../src/verify/release/crosssig.js';

// SPEC §4.4 (FR-12/FR-14): the frozen rotation crossSig wire vector. It pins the
// exact preimage the contract ratifies — RFC-8785 canonical bytes of the
// trust-root document with its own `crossSig` field removed — as genuine P-256
// material other implementations (core/cli/registry) can replay, not a runtime
// throwaway. The valid document verifies under the pinned countersign root;
// `mutatedByte` changes one byte of the signed body while keeping the same
// crossSig, so the recomputed preimage no longer matches and it must fail.
interface CrossSigVector {
  readonly countersignRootSpki: string;
  readonly valid: Record<string, unknown> & { crossSig: string };
  readonly mutatedByte: Record<string, unknown> & { crossSig: string };
}

const vector = JSON.parse(
  readFileSync(fileURLToPath(new URL('./crosssig-preimage.json', import.meta.url)), 'utf8'),
) as CrossSigVector;
const spki = new Uint8Array(Buffer.from(vector.countersignRootSpki, 'base64'));

describe('crossSig preimage wire vector (SPEC §4.4)', () => {
  it('accepts the valid crossSig under the pinned countersign root', async () => {
    expect(await verifyCrossSig(vector.valid, vector.valid.crossSig, [spki])).toBe(true);
  });

  it('rejects a single-byte mutation of the signed body under the same crossSig', async () => {
    expect(await verifyCrossSig(vector.mutatedByte, vector.mutatedByte.crossSig, [spki])).toBe(false);
  });

  it('rejects the valid crossSig under an unrelated root (wrong signer)', async () => {
    const otherRoot = new Uint8Array(spki);
    otherRoot.set([(otherRoot.at(-1) ?? 0) ^ 0xff], otherRoot.length - 1);
    expect(await verifyCrossSig(vector.valid, vector.valid.crossSig, [otherRoot])).toBe(false);
  });
});
