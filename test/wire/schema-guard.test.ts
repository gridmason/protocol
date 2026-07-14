import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { serializeSchema } from '../../scripts/manifest-schema.mjs';
import {
  SIGNATURE_ENVELOPE_SCHEMA_PATH,
  generateSignatureEnvelopeSchema,
} from '../../scripts/signature-schema.mjs';

// FR-5: TypeScript is the single authoring surface; the emitted JSON Schema is a
// generated artifact. This guard regenerates the signature-envelope schema from
// source and requires the committed file to be byte-identical — so a hand-edited
// emitted schema (any change to schemas/signature-envelope.schema.json that
// source does not produce) fails CI.
describe('signature-envelope schema drift guard', () => {
  const committed = readFileSync(SIGNATURE_ENVELOPE_SCHEMA_PATH, 'utf8');
  const regenerated = serializeSchema(generateSignatureEnvelopeSchema());

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});
