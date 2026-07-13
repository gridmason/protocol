// Shared schema-generation logic (SPEC §2, FR-5). The TypeScript `Manifest`
// type is the single authoring surface; this module generates the JSON Schema
// from it with ts-json-schema-generator (a devDependency — the published package
// keeps ZERO runtime dependencies). `scripts/gen-schemas.mjs` writes the result
// to schemas/manifest.schema.json; the guard test regenerates and byte-compares,
// so a hand-edited emitted schema fails CI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the committed, generated manifest schema. */
export const MANIFEST_SCHEMA_PATH = path.join(ROOT, 'schemas', 'manifest.schema.json');

/** Generate the manifest JSON Schema from the `Manifest` TypeScript type. */
export function generateManifestSchema() {
  return createGenerator({
    path: path.join(ROOT, 'src', 'types', 'manifest', 'manifest.ts'),
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    type: 'Manifest',
    additionalProperties: false,
    strictTuples: true,
    topRef: true,
    sortProps: true,
    jsDoc: 'extended',
  }).createSchema('Manifest');
}

/** Canonical serialization used for both writing and the drift guard. */
export function serializeSchema(schema) {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
