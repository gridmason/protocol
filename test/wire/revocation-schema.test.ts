import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  REVOCATION_SCHEMA_PATH,
  generateRevocationSchema,
} from '../../scripts/revocation-schema.mjs';
import { serializeSchema } from '../../scripts/manifest-schema.mjs';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));
}

// Validate against the COMMITTED artifact (not a freshly generated one): this
// proves the schema shipped in the package accepts canonical feeds. The drift
// guard separately proves that artifact is byte-identical to what the source
// generates.
const schema = readJson('../../schemas/revocation-feed.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema as object);

describe('revocation-feed JSON Schema — valid vectors', () => {
  for (const name of ['valid-feed', 'valid-empty-feed'] as const) {
    it(`accepts and round-trips ${name}`, () => {
      const feed = readJson(`../vectors/wire/revocation/${name}.json`);
      expect(validate(feed), JSON.stringify(validate.errors)).toBe(true);
      const roundTripped = JSON.parse(JSON.stringify(feed));
      expect(roundTripped).toEqual(feed);
      expect(validate(roundTripped)).toBe(true);
    });
  }
});

describe('revocation-feed JSON Schema — invalid vectors', () => {
  for (const name of [
    'invalid-extra-property',
    'invalid-unknown-state',
    'invalid-missing-registry',
    'invalid-non-integer-seq',
  ] as const) {
    it(`rejects ${name}`, () => {
      const feed = readJson(`../vectors/wire/revocation/${name}.json`);
      expect(validate(feed)).toBe(false);
    });
  }
});

// FR-5: TypeScript is the single authoring surface; the emitted JSON Schema is a
// generated artifact. This guard regenerates from source and requires the
// committed file to be byte-identical, so a hand-edited schema fails CI.
describe('revocation-feed schema drift guard', () => {
  const committed = readFileSync(REVOCATION_SCHEMA_PATH, 'utf8');
  const regenerated = serializeSchema(generateRevocationSchema());

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});
