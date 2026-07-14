import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyCheckpoint, type LogPublicKey } from '../../../src/verify/log/checkpoint.js';

// verifyCheckpoint (docs/SPEC.md §4.3): parsing + Ed25519 verification of a c2sp
// signed-note checkpoint against a pinned key. An in-test node:crypto signer lets
// us mint valid notes and every malformed / invalid variant, so each parse
// branch and each stable reason is pinned for the security-core 100% gate.

const ORIGIN = 'gridmason.test/log';

/** A deterministic Ed25519 key pair from a fixed seed, plus signed-note helpers. */
function keyFromSeed(seedHex: string): { priv: KeyObject; pub: Uint8Array } {
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const priv = createPrivateKey({
    key: Buffer.concat([prefix, Buffer.from(seedHex, 'hex')]),
    format: 'der',
    type: 'pkcs8',
  });
  const pub = createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { priv, pub: new Uint8Array(pub) };
}

const SEED = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
const { priv, pub } = keyFromSeed(SEED);
const pinned: LogPublicKey = { name: ORIGIN, key: pub };

const ROOT_B64 = Buffer.alloc(32, 7).toString('base64');

function keyId(name: string, publicKey: Uint8Array): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(name, 'utf8'), Buffer.from([0x0a, 0x01]), publicKey]))
    .digest()
    .subarray(0, 4);
}

/** Assemble a signed note from a body + signature blob under `sigName`. */
function note(body: string, blob: Buffer, sigName = ORIGIN): string {
  return `${body}\n— ${sigName} ${blob.toString('base64')}\n`;
}

/** A validly-signed checkpoint note for the pinned key. */
function signedNote(body: string, signer: KeyObject = priv, sigName = ORIGIN): string {
  const signature = sign(null, Buffer.from(body, 'utf8'), signer);
  return note(body, Buffer.concat([keyId(sigName, pub), signature]), sigName);
}

const validBody = `${ORIGIN}\n8\n${ROOT_B64}\n`;

describe('verifyCheckpoint — success', () => {
  it('parses the body and returns it when the pinned key verifies', async () => {
    const result = await verifyCheckpoint(signedNote(validBody), pinned);
    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') throw new Error('unreachable');
    expect(result.checkpoint.origin).toBe(ORIGIN);
    expect(result.checkpoint.treeSize).toBe(8n);
    expect(Buffer.from(result.checkpoint.rootHash).toString('base64')).toBe(ROOT_B64);
  });

  it('accepts a note whose final signature line has no trailing newline', async () => {
    const signed = signedNote(validBody).replace(/\n$/, '');
    expect((await verifyCheckpoint(signed, pinned)).outcome).toBe('ok');
  });

  it('ignores extension lines and picks the pinned key among cosignatures', async () => {
    const body = `${ORIGIN}\n8\n${ROOT_B64}\nsome extension\n`;
    const signature = sign(null, Buffer.from(body, 'utf8'), priv);
    const mine = Buffer.concat([keyId(ORIGIN, pub), signature]);
    // A foreign cosignature line precedes the pinned one.
    const withCosig = `${body}\n— other.log AAAAAAAAAAAA\n— ${ORIGIN} ${mine.toString('base64')}\n`;
    const result = await verifyCheckpoint(withCosig, pinned);
    expect(result.outcome).toBe('ok');
  });
});

describe('verifyCheckpoint — key and signature failures', () => {
  it('rejects a pinned key that is not 32 bytes', async () => {
    const result = await verifyCheckpoint(signedNote(validBody), { name: ORIGIN, key: pub.subarray(0, 31) });
    expect(result.outcome).toBe('unsupported-key-algorithm');
  });

  it('reports key-mismatch when no signature is under the pinned key', async () => {
    const other = keyFromSeed('02'.repeat(32));
    // Signed by a different key: its key id will not match the pinned key's.
    const signed = note(
      validBody,
      Buffer.concat([keyId(ORIGIN, other.pub), sign(null, Buffer.from(validBody, 'utf8'), other.priv)]),
    );
    expect((await verifyCheckpoint(signed, pinned)).outcome).toBe('checkpoint-key-mismatch');
  });

  it('reports signature-invalid when a matching key id signs the wrong bytes', async () => {
    // Correct pinned key id, but 64 bytes of garbage where the signature goes.
    const blob = Buffer.concat([keyId(ORIGIN, pub), Buffer.alloc(64, 0)]);
    expect((await verifyCheckpoint(note(validBody, blob), pinned)).outcome).toBe('checkpoint-signature-invalid');
  });

  it('reports signature-invalid when the blob is not a 64-byte signature', async () => {
    const blob = Buffer.concat([keyId(ORIGIN, pub), Buffer.alloc(10, 0)]);
    expect((await verifyCheckpoint(note(validBody, blob), pinned)).outcome).toBe('checkpoint-signature-invalid');
  });

  it('rejects a signature over a tampered body', async () => {
    const good = signedNote(validBody);
    // Flip the tree size in the body after signing; the signature no longer covers it.
    const tampered = good.replace(`${ORIGIN}\n8\n`, `${ORIGIN}\n9\n`);
    expect((await verifyCheckpoint(tampered, pinned)).outcome).toBe('checkpoint-signature-invalid');
  });
});

describe('verifyCheckpoint — malformed notes', () => {
  const blob = Buffer.concat([keyId(ORIGIN, pub), Buffer.alloc(64, 0)]);

  it('no blank-line separator', async () => {
    expect((await verifyCheckpoint(validBody, pinned)).outcome).toBe('malformed-checkpoint');
  });

  it('no signature lines after the separator', async () => {
    expect((await verifyCheckpoint(`${validBody}\n`, pinned)).outcome).toBe('malformed-checkpoint');
  });

  it('a signature line not starting with the em-dash marker', async () => {
    expect((await verifyCheckpoint(`${validBody}\nx ${ORIGIN} AAAA\n`, pinned)).outcome).toBe(
      'malformed-checkpoint',
    );
  });

  it('a signature line with no name/blob separator', async () => {
    expect((await verifyCheckpoint(`${validBody}\n— nameonly\n`, pinned)).outcome).toBe('malformed-checkpoint');
  });

  it('a signature blob that is not valid base64', async () => {
    expect((await verifyCheckpoint(`${validBody}\n— ${ORIGIN} not*base64\n`, pinned)).outcome).toBe(
      'malformed-checkpoint',
    );
  });

  it('a signature blob shorter than a key id', async () => {
    // "AAA" decodes to 2 bytes (< 4-byte key id).
    expect((await verifyCheckpoint(`${validBody}\n— ${ORIGIN} AAA\n`, pinned)).outcome).toBe(
      'malformed-checkpoint',
    );
  });

  it('a body with fewer than three lines', async () => {
    expect((await verifyCheckpoint(note('onlyone\n', blob), pinned)).outcome).toBe('malformed-checkpoint');
  });

  it('an empty origin line', async () => {
    expect((await verifyCheckpoint(note(`\n8\n${ROOT_B64}\n`, blob), pinned)).outcome).toBe(
      'malformed-checkpoint',
    );
  });

  it('a non-decimal tree size', async () => {
    expect((await verifyCheckpoint(note(`${ORIGIN}\neight\n${ROOT_B64}\n`, blob), pinned)).outcome).toBe(
      'malformed-checkpoint',
    );
  });

  it('a tree size with a leading zero', async () => {
    expect((await verifyCheckpoint(note(`${ORIGIN}\n08\n${ROOT_B64}\n`, blob), pinned)).outcome).toBe(
      'malformed-checkpoint',
    );
  });

  it('a root hash that is not valid base64', async () => {
    expect((await verifyCheckpoint(note(`${ORIGIN}\n8\nnot*base64\n`, blob), pinned)).outcome).toBe(
      'malformed-checkpoint',
    );
  });
});

// Guard against a silently-broken in-test signer: a freshly generated key must
// also round-trip, proving the success path isn't an artifact of the fixed seed.
describe('verifyCheckpoint — generated key round-trip', () => {
  it('verifies a note signed by a fresh Ed25519 key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const raw = new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
    const body = `${ORIGIN}\n3\n${ROOT_B64}\n`;
    const blob = Buffer.concat([keyId(ORIGIN, raw), sign(null, Buffer.from(body, 'utf8'), privateKey)]);
    expect((await verifyCheckpoint(note(body, blob), { name: ORIGIN, key: raw })).outcome).toBe('ok');
  });
});
