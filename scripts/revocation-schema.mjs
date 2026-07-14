// Shared schema-generation logic for the revocation & kill feed (SPEC §4.3,
// FR-5). The TypeScript `RevocationFeed` type is the single authoring surface;
// this module generates the JSON Schema from it with ts-json-schema-generator (a
// devDependency — the published package keeps ZERO runtime dependencies).
// `scripts/gen-schemas.mjs` writes the result to schemas/revocation-feed.schema.json;
// the guard test regenerates and byte-compares, so a hand-edited emitted schema
// fails CI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the committed, generated revocation-feed schema. */
export const REVOCATION_SCHEMA_PATH = path.join(ROOT, 'schemas', 'revocation-feed.schema.json');

/** Generate the revocation-feed JSON Schema from the `RevocationFeed` TypeScript type. */
export function generateRevocationSchema() {
  return createGenerator({
    path: path.join(ROOT, 'src', 'types', 'wire', 'revocation.ts'),
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    type: 'RevocationFeed',
    additionalProperties: false,
    strictTuples: true,
    topRef: true,
    sortProps: true,
    jsDoc: 'extended',
  }).createSchema('RevocationFeed');
}
