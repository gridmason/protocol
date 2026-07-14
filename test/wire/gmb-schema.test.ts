import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { beforeAll, describe, expect, it } from 'vitest';

import { serializeSchema } from '../../scripts/manifest-schema.mjs';
import { GMB_BUNDLE_SCHEMA_PATH, generateGmbBundleSchema } from '../../scripts/bundle-schema.mjs';
import { buildBundleScenario, type BundleScenario } from '../vectors/gmb/build.js';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));
}

// Validate against the COMMITTED artifact (not a freshly generated one): this
// proves the schema shipped in the package accepts a real, canonical bundle. The
// drift guard separately proves that artifact is byte-identical to what the
// source generates.
const schema = readJson('../../schemas/gmb-bundle.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema as object);

describe('gmb-bundle JSON Schema — accepts a real bundle', () => {
  let s: BundleScenario;
  beforeAll(async () => {
    s = await buildBundleScenario();
  });

  it('accepts and round-trips a genuinely-built valid bundle', () => {
    const doc = JSON.parse(JSON.stringify(s.input.bundle)) as unknown;
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects a bundle carrying an unknown top-level property', () => {
    const doc = { ...JSON.parse(JSON.stringify(s.input.bundle)), rogue: true };
    expect(validate(doc)).toBe(false);
  });

  it('rejects a bundle missing its payload', () => {
    const doc = JSON.parse(JSON.stringify(s.input.bundle)) as Record<string, unknown>;
    delete doc.payload;
    expect(validate(doc)).toBe(false);
  });
});

// FR-5: TypeScript is the single authoring surface; the emitted JSON Schema is a
// generated artifact. This guard regenerates from source and requires the
// committed file to be byte-identical, so a hand-edited schema fails CI.
describe('gmb-bundle schema drift guard', () => {
  const committed = readFileSync(GMB_BUNDLE_SCHEMA_PATH, 'utf8');
  const regenerated = serializeSchema(generateGmbBundleSchema());

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});
