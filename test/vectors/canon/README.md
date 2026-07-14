# JCS / RFC-8785 conformance vectors

`input/*.json` are JSON documents; `expected/*.json` are their exact canonical
forms (RFC-8785, no trailing newline). `src/canon/canonicalize.ts` must turn
each input into byte-identical expected output.

## Source & license

Vendored verbatim from the reference JCS test suite:

- Repo: <https://github.com/cyberphone/json-canonicalization> (`testdata/input`, `testdata/output`)
- License: Apache-2.0 (© Anders Rundgren / the RFC-8785 reference implementation authors)
- Retrieved: 2026-07-14, `master`

Files are unmodified. The Apache-2.0 license permits redistribution; this note
preserves attribution. Only the human-authored `input`/`output` pairs are
vendored — the multi-gigabyte generated number-formatting corpus
(`es6testfile100m.txt`) is not; its representative cases live in
`values.json` plus the number edge-case assertions in `src/canon/canonicalize.test.ts`.
