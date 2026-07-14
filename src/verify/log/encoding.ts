/**
 * Minimal, in-house base64 and lowercase-hex decoders for the transparency-log
 * verifier (docs/SPEC.md §4.3). Same rationale as the in-house canonicalizer and
 * hash tagging (SPEC §8): the most-pinned package carries **zero** runtime
 * dependencies and no reliance on host globals (`atob` is a DOM API, absent in
 * some edge runtimes), so the byte decoders on the verify path are auditable
 * here. Both return `undefined` on any malformed input — untrusted wire bytes
 * become a stable verdict upstream, never a throw. Held at 100% coverage.
 */

/** Standard base64 alphabet (RFC 4648) → 6-bit value; -1 for non-alphabet bytes. */
const BASE64_DECODE = buildBase64Table();

function buildBase64Table(): Int8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = i;
  return table;
}

/**
 * Decode standard base64 (RFC 4648) to bytes. Accepts canonical padding (`=` to
 * a 4-char boundary) and unpadded input; rejects any non-alphabet character,
 * misplaced padding, and impossible lengths (a lone trailing char). Returns
 * `undefined` on any of these.
 */
export function base64ToBytes(input: string): Uint8Array | undefined {
  // Strip at most two trailing '=' and require the rest to be padding-free.
  let end = input.length;
  let padding = 0;
  while (end > 0 && input.charCodeAt(end - 1) === 0x3d /* '=' */ && padding < 2) {
    end--;
    padding++;
  }
  const core = input.slice(0, end);
  if (core.includes('=')) return undefined;

  const remainder = core.length % 4;
  // A single leftover character can never encode a byte.
  if (remainder === 1) return undefined;
  // Padding, when present, must square the length to a 4-char group.
  if (padding > 0 && remainder + padding !== 4) return undefined;

  const outLength = Math.floor((core.length * 6) / 8);
  const out = new Uint8Array(outLength);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < core.length; i++) {
    const code = core.charCodeAt(i);
    const value = code < 128 ? BASE64_DECODE[code]! : -1;
    if (value === -1) return undefined;
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

/**
 * Decode a lowercase-hex string to bytes. Rejects odd length, uppercase, and any
 * non-hex character (returns `undefined`) — the encoding Rekor uses for Merkle
 * node hashes, kept strict so a malformed proof node is caught before hashing.
 */
export function hexToBytes(input: string): Uint8Array | undefined {
  if (input.length % 2 !== 0) return undefined;
  const out = new Uint8Array(input.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = hexNibble(input.charCodeAt(i * 2));
    const lo = hexNibble(input.charCodeAt(i * 2 + 1));
    if (hi === -1 || lo === -1) return undefined;
    out[i] = (hi << 4) | lo;
  }
  return out;
}

/** A single lowercase-hex digit's value, or -1 if not `[0-9a-f]`. */
function hexNibble(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30; // 0-9
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10; // a-f
  return -1;
}
