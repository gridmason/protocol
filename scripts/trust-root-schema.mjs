// Shared schema-generation logic for the trust-root document (SPEC §4.4, FR-5).
// The TypeScript `TrustRootDoc` type is the single authoring surface; this module
// generates the JSON Schema from it with ts-json-schema-generator (a devDependency
// — the published package keeps ZERO runtime dependencies).
// `scripts/gen-schemas.mjs` writes the result to schemas/trust-root.schema.json;
// the guard test regenerates and byte-compares, so a hand-edited emitted schema
// fails CI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the committed, generated trust-root schema. */
export const TRUST_ROOT_SCHEMA_PATH = path.join(ROOT, 'schemas', 'trust-root.schema.json');

/** Generate the trust-root JSON Schema from the `TrustRootDoc` TypeScript type. */
export function generateTrustRootSchema() {
  return createGenerator({
    path: path.join(ROOT, 'src', 'types', 'wire', 'trust-root.ts'),
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    type: 'TrustRootDoc',
    additionalProperties: false,
    strictTuples: true,
    topRef: true,
    sortProps: true,
    jsDoc: 'extended',
  }).createSchema('TrustRootDoc');
}
