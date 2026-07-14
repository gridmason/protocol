import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  LOG_ENTRY_SCHEMA_PATH,
  generateLogEntrySchema,
} from '../../scripts/log-entry-schema.mjs';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));
}

// FR-5: TypeScript is the single authoring surface; the emitted JSON Schema is a
// generated artifact. This guard regenerates the log-entry schema from source and
// requires the committed file to be byte-identical — a hand-edited emitted schema
// fails CI.
describe('log-entry schema drift guard', () => {
  const committed = readFileSync(LOG_ENTRY_SCHEMA_PATH, 'utf8');
  const regenerated = `${JSON.stringify(generateLogEntrySchema(), null, 2)}\n`;

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});

// Validate a real recorded entry against the COMMITTED schema artifact: proof the
// shipped schema accepts a Rekor-shaped log entry (the drift guard above proves
// that artifact matches the TypeScript source).
describe('log-entry JSON Schema — recorded fixture', () => {
  const schema = readJson('../../schemas/log-entry.schema.json');
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate: ValidateFunction = ajv.compile(schema as object);

  it('accepts the recorded inclusion fixture', () => {
    const entry = readJson('../vectors/log/inclusion-valid.json');
    expect(validate(entry), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects an entry missing a required field', () => {
    const entry = readJson('../vectors/log/inclusion-valid.json') as Record<string, unknown>;
    delete entry.checkpoint;
    expect(validate(entry)).toBe(false);
  });

  it('rejects an unknown extra property', () => {
    const entry = readJson('../vectors/log/inclusion-valid.json') as Record<string, unknown>;
    entry.extra = true;
    expect(validate(entry)).toBe(false);
  });
});
