// Shared schema-generation logic for the transparency-log entry (SPEC §4.3,
// FR-5). The TypeScript `TransparencyLogEntry` type is the single authoring
// surface; this module generates the JSON Schema from it with
// ts-json-schema-generator (a devDependency — the published package keeps ZERO
// runtime dependencies). `scripts/gen-schemas.mjs` writes the result to
// schemas/log-entry.schema.json; the guard test regenerates and byte-compares,
// so a hand-edited emitted schema fails CI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the committed, generated log-entry schema. */
export const LOG_ENTRY_SCHEMA_PATH = path.join(ROOT, 'schemas', 'log-entry.schema.json');

/** Generate the log-entry JSON Schema from the `TransparencyLogEntry` type. */
export function generateLogEntrySchema() {
  return createGenerator({
    path: path.join(ROOT, 'src', 'types', 'wire', 'log-entry.ts'),
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    type: 'TransparencyLogEntry',
    additionalProperties: false,
    strictTuples: true,
    topRef: true,
    sortProps: true,
    jsDoc: 'extended',
  }).createSchema('TransparencyLogEntry');
}
