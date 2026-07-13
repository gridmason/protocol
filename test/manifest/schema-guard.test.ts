import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  MANIFEST_SCHEMA_PATH,
  generateManifestSchema,
  serializeSchema,
} from '../../scripts/manifest-schema.mjs';

// FR-5: TypeScript is the single authoring surface; the emitted JSON Schema is a
// generated artifact. This guard regenerates the schema from source and requires
// the committed file to be byte-identical — so a hand-edited emitted schema (any
// change to schemas/manifest.schema.json that source does not produce) fails CI.
describe('manifest schema drift guard', () => {
  const committed = readFileSync(MANIFEST_SCHEMA_PATH, 'utf8');
  const regenerated = serializeSchema(generateManifestSchema());

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});
