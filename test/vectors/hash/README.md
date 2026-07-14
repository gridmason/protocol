# SHA-256 known-answer vectors

`sha256-kat.json` — known-answer tests pinning the content-hash primitive
(`src/verify/hash`, docs/SPEC.md §4.1). Each entry supplies input bytes and the
expected multihash-tagged digest `sha2-256:<hex>`.

Each vector has:

- `name` — stable id.
- `note` — provenance / what it exercises.
- exactly one of `inputUtf8` (UTF-8 encode the string) or `inputHex` (decode the
  hex, allowing empty and non-UTF-8 raw bytes).
- `expected` — the `sha2-256:<lowercase-hex>` digest.

## Sources

- **`abc`**, **`two-block-448`** — NIST FIPS 180-2, *Secure Hash Standard*,
  Appendix B.1 / B.2 (SHA-256 examples).
- **`two-block-896`** — NIST CSRC SHA-256 example
  (<https://csrc.nist.gov/csrc/media/projects/cryptographic-standards-and-guidelines/documents/examples/sha256.pdf>).
- **`empty`** — SHA-256 of the empty string, the universally published constant
  `e3b0c442…7852b855`.
- **`raw-byte-00`**, **`raw-bytes-deadbeef`** — arbitrary binary inputs to cover
  non-UTF-8 bytes and leading-zero hex; digests independently reproducible with
  any conforming SHA-256 (`printf '...' | sha256sum`, WebCrypto, etc.).

These are algorithm KATs: they pin the SHA-256 digest itself, independent of the
canonicalizer. The canon→hash composition is exercised in
`test/verify/hash/hash.test.ts`.
