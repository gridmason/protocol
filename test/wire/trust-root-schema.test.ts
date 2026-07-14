import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

import { serializeSchema } from '../../scripts/manifest-schema.mjs';
import {
  TRUST_ROOT_SCHEMA_PATH,
  generateTrustRootSchema,
} from '../../scripts/trust-root-schema.mjs';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));
}

// Validate against the COMMITTED artifact (not a freshly generated one): this
// proves the schema shipped in the package accepts canonical documents. The drift
// guard separately proves that artifact is byte-identical to what the source
// generates.
const schema = readJson('../../schemas/trust-root.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema as object);

describe('trust-root JSON Schema — valid vectors', () => {
  for (const name of ['valid-doc', 'valid-minimal'] as const) {
    it(`accepts and round-trips ${name}`, () => {
      const doc = readJson(`../vectors/wire/trust-root/${name}.json`);
      expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
      const roundTripped = JSON.parse(JSON.stringify(doc));
      expect(roundTripped).toEqual(doc);
      expect(validate(roundTripped)).toBe(true);
    });
  }
});

describe('trust-root JSON Schema — invalid vectors', () => {
  for (const name of [
    'invalid-extra-property',
    'invalid-missing-registry',
    'invalid-bad-format-version',
    'invalid-non-integer-notbefore',
    'invalid-non-string-root',
  ] as const) {
    it(`rejects ${name}`, () => {
      const doc = readJson(`../vectors/wire/trust-root/${name}.json`);
      expect(validate(doc)).toBe(false);
    });
  }
});

// FR-5: TypeScript is the single authoring surface; the emitted JSON Schema is a
// generated artifact. This guard regenerates from source and requires the
// committed file to be byte-identical, so a hand-edited schema fails CI.
describe('trust-root schema drift guard', () => {
  const committed = readFileSync(TRUST_ROOT_SCHEMA_PATH, 'utf8');
  const regenerated = serializeSchema(generateTrustRootSchema());

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});
