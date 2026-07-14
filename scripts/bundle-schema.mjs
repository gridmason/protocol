// Shared schema-generation logic for the offline bundle (`.gmb`, SPEC §4.5,
// FR-5). The TypeScript `GmbBundle` type is the single authoring surface; this
// module generates the JSON Schema from it with ts-json-schema-generator (a
// devDependency — the published package keeps ZERO runtime dependencies).
// `scripts/gen-schemas.mjs` writes the result to schemas/gmb-bundle.schema.json;
// the guard test regenerates and byte-compares, so a hand-edited emitted schema
// fails CI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the committed, generated offline-bundle schema. */
export const GMB_BUNDLE_SCHEMA_PATH = path.join(ROOT, 'schemas', 'gmb-bundle.schema.json');

/** Generate the offline-bundle JSON Schema from the `GmbBundle` TypeScript type. */
export function generateGmbBundleSchema() {
  return createGenerator({
    path: path.join(ROOT, 'src', 'types', 'wire', 'bundle.ts'),
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    type: 'GmbBundle',
    additionalProperties: false,
    strictTuples: true,
    topRef: true,
    sortProps: true,
    jsDoc: 'extended',
  }).createSchema('GmbBundle');
}
