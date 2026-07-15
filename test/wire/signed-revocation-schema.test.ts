import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  SIGNED_REVOCATION_SCHEMA_PATH,
  generateSignedRevocationSchema,
} from '../../scripts/revocation-schema.mjs';
import { serializeSchema } from '../../scripts/manifest-schema.mjs';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));
}

// Validate against the COMMITTED artifact (not a freshly generated one): this
// proves the schema shipped in the package accepts a canonical signed feed. The
// drift guard separately proves that artifact is byte-identical to what the
// source generates.
const schema = readJson('../../schemas/signed-revocation-feed.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema as object);

describe('signed-revocation-feed JSON Schema — valid vectors', () => {
  for (const name of ['valid-signed-feed', 'valid-empty-signed-feed'] as const) {
    it(`accepts and round-trips ${name}`, () => {
      const signed = readJson(`../vectors/wire/signed-revocation/${name}.json`);
      expect(validate(signed), JSON.stringify(validate.errors)).toBe(true);
      const roundTripped = JSON.parse(JSON.stringify(signed));
      expect(roundTripped).toEqual(signed);
      expect(validate(roundTripped)).toBe(true);
    });
  }
});

describe('signed-revocation-feed JSON Schema — invalid vectors', () => {
  for (const name of [
    'invalid-extra-property',
    'invalid-missing-signature',
    'invalid-unknown-alg',
    'invalid-missing-cert',
  ] as const) {
    it(`rejects ${name}`, () => {
      const signed = readJson(`../vectors/wire/signed-revocation/${name}.json`);
      expect(validate(signed)).toBe(false);
    });
  }
});

// FR-5: TypeScript is the single authoring surface; the emitted JSON Schema is a
// generated artifact. This guard regenerates from source and requires the
// committed file to be byte-identical, so a hand-edited schema fails CI.
describe('signed-revocation-feed schema drift guard', () => {
  const committed = readFileSync(SIGNED_REVOCATION_SCHEMA_PATH, 'utf8');
  const regenerated = serializeSchema(generateSignedRevocationSchema());

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});
