/**
 * Transparency-log **consistency** conformance vectors (docs/SPEC.md §4.3, §7;
 * FR-15, P-E4 — the `forked log` negative of the SPEC §7 set).
 *
 * These exercise
 * {@link import('../verify/log/log.js').verifyLogConsistency} against **recorded,
 * offline** Rekor-shaped fixtures: two c2sp.org/tlog-checkpoint signed notes plus
 * the RFC 6962 consistency proof between them, checked under a pinned Ed25519 log
 * key. The fixtures were generated once by an honest bottom-up prover (the verify
 * lib is pure and never touches the network — spec Risks), so a passing check is
 * real agreement between independent prover and verifier code paths.
 *
 * The load-bearing negative is `forked log` (SPEC §7): two size-8 checkpoints
 * signed by the same key over **different** roots — irreconcilable histories a
 * compromised/split log would present. A conforming verifier returns
 * `consistency-proof-invalid`; a consumer whose runner "passes" it fails CI.
 */

import type { LogPublicKey } from '../verify/index.js';
import type { LogConsistencyVector } from './types.js';

/** Decode a lowercase-hex fixture string to its bytes. */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The log's pinned public key — the raw 32-byte Ed25519 key every note is signed under. */
const logPublicKey: LogPublicKey = {
  name: 'gridmason.test/log',
  key: hexToBytes('3ccd241cffc9b3618044b97d036d8614593d8b017c340f1dee8773385517654b'),
};

// Recorded signed heads. The valid pair grows the honest log 5 → 8 leaves; the
// forked pair is two *size-8* heads over different roots under the same key.
const validOldHead =
  'gridmason.test/log\n5\nz5vWlr1cNhBVhV5doYfY8+jMlRMlPjYa5q9bSDH7Y0k=\n\n— gridmason.test/log FgRm4+bgiQqj+UdXDx4hJqXGKF7hx9/nwYUbq1NhPOsrmp3gfOgKlzPMDSscScrMrJF822bZsA3vmNPPq2mJbR/h5gQ=\n';
const validNewHead =
  'gridmason.test/log\n8\nL3nRXpy1rwukRusX0BP4w/c8+2tWQ7xOcvAm9Oc4nVQ=\n\n— gridmason.test/log FgRm46ytc1tmNups0fT9aRsjJQC7Bl+t8tl/NbnxPR4gj+wr2oJ1n/b+9jX1c+9Tp1ru+sr14wJgwVOjaCbt6hQ4ZQk=\n';
const forkedHeadA = validNewHead;
const forkedHeadB =
  'gridmason.test/log\n8\ni2xYhEknboeAcgeyHicsO7c4xLDZa9bYgKxhFH6QSDo=\n\n— gridmason.test/log FgRm4+BO7Cgu0VZF/zBJNiKEU6tFn6yD0TsT3tCksiBbTY6QnYPrEWno3S7aHSBij5xrCvlqAUmz/PR8mHKk597Gfwk=\n';

/**
 * The log-consistency corpus: the honest 5→8 growth (positive) and the forked
 * same-size heads (the SPEC §7 `forked log` negative).
 */
export const logConsistencyVectors: readonly LogConsistencyVector[] = [
  {
    name: 'honest log growth 5 -> 8 with a valid consistency proof',
    input: {
      oldCheckpoint: validOldHead,
      newCheckpoint: validNewHead,
      proof: [
        '4763094e6b09f7446c57750ad8256f67240d69411f825643624d9411b5fb71e3',
        '6df4f9f12af286ac104e319068051e15f1cf5b4eaaf8d9812bd9e0295e0513d1',
        '718f3e96617b9166338320658e03819076c2806f37747779fbd863ea205780b4',
        '4665508bc23144d0fac8cc908a09de3627559f59c19594e7cbe3d2d10c1e596a',
      ],
      logPublicKey,
    },
    reason: 'ok',
  },
  {
    name: 'forked log: two size-8 heads over different roots, same key',
    input: {
      oldCheckpoint: forkedHeadA,
      newCheckpoint: forkedHeadB,
      proof: [],
      logPublicKey,
    },
    reason: 'consistency-proof-invalid',
    note: 'forked-log negative — a passing consumer fails its build (SPEC §7)',
  },
];
