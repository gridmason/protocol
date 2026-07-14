// Shared schema-generation logic for the Resolution API wire contract — the
// gate-snapshot request and the import-map-fragment response of POST /v1/resolve
// (registry FR-7, FR-10; GW-D22; promoted from gridmason/registry, issue #66).
// The TypeScript types in src/types/resolution.ts are the single authoring
// surface; this module generates each JSON Schema from them with
// ts-json-schema-generator (a devDependency — the published package keeps ZERO
// runtime dependencies). `scripts/gen-schemas.mjs` writes the results to
// schemas/gate-snapshot.schema.json and schemas/import-map-fragment.schema.json;
// the guard test regenerates and byte-compares, so a hand-edited emitted schema
// fails CI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESOLUTION_TYPES = path.join(ROOT, 'src', 'types', 'resolution.ts');

/** Absolute path of the committed, generated gate-snapshot schema. */
export const GATE_SNAPSHOT_SCHEMA_PATH = path.join(ROOT, 'schemas', 'gate-snapshot.schema.json');

/** Absolute path of the committed, generated import-map-fragment schema. */
export const IMPORT_MAP_FRAGMENT_SCHEMA_PATH = path.join(
  ROOT,
  'schemas',
  'import-map-fragment.schema.json',
);

/** Generate a resolution-contract schema for `type` from src/types/resolution.ts. */
function generateResolutionSchema(type) {
  return createGenerator({
    path: RESOLUTION_TYPES,
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    type,
    additionalProperties: false,
    strictTuples: true,
    topRef: true,
    sortProps: true,
    jsDoc: 'extended',
  }).createSchema(type);
}

/** Generate the gate-snapshot JSON Schema from the `GateSnapshot` TypeScript type. */
export function generateGateSnapshotSchema() {
  return generateResolutionSchema('GateSnapshot');
}

/** Generate the import-map-fragment JSON Schema from the `ImportMapFragment` TypeScript type. */
export function generateImportMapFragmentSchema() {
  return generateResolutionSchema('ImportMapFragment');
}
