import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));
}

// Validate against the COMMITTED artifact (not a freshly generated one): this
// proves the schema shipped in the package accepts the canonical manifests. The
// schema-guard test separately proves that artifact is byte-identical to what
// the TypeScript source generates.
const schema = readJson('../../schemas/manifest.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema as object);

describe('manifest JSON Schema — valid vectors', () => {
  for (const name of ['valid-widget', 'valid-page-type'] as const) {
    it(`accepts and round-trips ${name}`, () => {
      const manifest = readJson(`../vectors/manifest/${name}.json`);
      // parse → validate → serialize (the round-trip the SPEC §3.1 example must survive).
      expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
      const roundTripped = JSON.parse(JSON.stringify(manifest));
      expect(roundTripped).toEqual(manifest);
      expect(validate(roundTripped)).toBe(true);
    });
  }
});

describe('manifest JSON Schema — invalid vectors', () => {
  for (const name of [
    'invalid-extra-property',
    'invalid-missing-entry',
    'invalid-bad-format-version',
    'invalid-unknown-kind',
  ] as const) {
    it(`rejects ${name}`, () => {
      const manifest = readJson(`../vectors/manifest/${name}.json`);
      expect(validate(manifest)).toBe(false);
    });
  }
});
