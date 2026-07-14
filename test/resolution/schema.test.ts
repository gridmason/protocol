import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

import { serializeSchema } from '../../scripts/manifest-schema.mjs';
import {
  GATE_SNAPSHOT_SCHEMA_PATH,
  IMPORT_MAP_FRAGMENT_SCHEMA_PATH,
  generateGateSnapshotSchema,
  generateImportMapFragmentSchema,
} from '../../scripts/resolution-schema.mjs';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));
}

function compile(schemaRelative: string): ValidateFunction {
  const schema = readJson(schemaRelative);
  // A fresh Ajv per schema keeps the two resolution documents isolated (each
  // inlines the shared signed-doc definitions under its own $id-less root).
  return new Ajv({ allErrors: true, strict: false }).compile(schema as object);
}

// Validate against the COMMITTED artifacts (not freshly generated ones): this
// proves the schemas shipped in the package accept the canonical resolution
// documents. The drift guards below separately prove those artifacts are
// byte-identical to what the TypeScript source generates.
const validateGateSnapshot = compile('../../schemas/gate-snapshot.schema.json');
const validateFragment = compile('../../schemas/import-map-fragment.schema.json');

describe('gate-snapshot JSON Schema — valid vectors', () => {
  for (const name of ['valid-snapshot', 'valid-empty'] as const) {
    it(`accepts and round-trips ${name}`, () => {
      const snapshot = readJson(`../vectors/resolution/gate-snapshot/${name}.json`);
      expect(validateGateSnapshot(snapshot), JSON.stringify(validateGateSnapshot.errors)).toBe(true);
      const roundTripped = JSON.parse(JSON.stringify(snapshot));
      expect(roundTripped).toEqual(snapshot);
      expect(validateGateSnapshot(roundTripped)).toBe(true);
    });
  }
});

describe('gate-snapshot JSON Schema — invalid vectors', () => {
  for (const name of [
    'invalid-extra-property',
    'invalid-missing-registry',
    'invalid-non-integer-major',
  ] as const) {
    it(`rejects ${name}`, () => {
      const snapshot = readJson(`../vectors/resolution/gate-snapshot/${name}.json`);
      expect(validateGateSnapshot(snapshot)).toBe(false);
    });
  }
});

describe('import-map-fragment JSON Schema — valid vectors', () => {
  for (const name of ['valid-fragment', 'valid-empty'] as const) {
    it(`accepts and round-trips ${name}`, () => {
      const fragment = readJson(`../vectors/resolution/import-map-fragment/${name}.json`);
      expect(validateFragment(fragment), JSON.stringify(validateFragment.errors)).toBe(true);
      const roundTripped = JSON.parse(JSON.stringify(fragment));
      expect(roundTripped).toEqual(fragment);
      expect(validateFragment(roundTripped)).toBe(true);
    });
  }
});

describe('import-map-fragment JSON Schema — invalid vectors', () => {
  for (const name of [
    'invalid-extra-property',
    'invalid-missing-excluded',
    'invalid-unknown-reason',
    'invalid-module-missing-bundle',
  ] as const) {
    it(`rejects ${name}`, () => {
      const fragment = readJson(`../vectors/resolution/import-map-fragment/${name}.json`);
      expect(validateFragment(fragment)).toBe(false);
    });
  }
});

// FR-5: TypeScript is the single authoring surface; the emitted JSON Schema is a
// generated artifact. These guards regenerate from source and require the
// committed files to be byte-identical, so a hand-edited schema fails CI.
describe('gate-snapshot schema drift guard', () => {
  const committed = readFileSync(GATE_SNAPSHOT_SCHEMA_PATH, 'utf8');
  const regenerated = serializeSchema(generateGateSnapshotSchema());

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});

describe('import-map-fragment schema drift guard', () => {
  const committed = readFileSync(IMPORT_MAP_FRAGMENT_SCHEMA_PATH, 'utf8');
  const regenerated = serializeSchema(generateImportMapFragmentSchema());

  it('committed schema is byte-identical to the schema generated from the TS source', () => {
    expect(committed).toBe(regenerated);
  });

  it('a hand-edited schema would not match the regenerated source', () => {
    const tampered = committed.replace('"type": "object"', '"type": "string"');
    expect(tampered).not.toBe(committed);
    expect(tampered).not.toBe(regenerated);
  });
});
