// Shared schema-generation logic for the signature envelope (SPEC §4.2, FR-5).
// The TypeScript `SignatureEnvelope` type is the single authoring surface; this
// module generates the JSON Schema from it with ts-json-schema-generator (a
// devDependency — the published package keeps ZERO runtime dependencies).
// `scripts/gen-schemas.mjs` writes the result to
// schemas/signature-envelope.schema.json; the guard test regenerates and
// byte-compares, so a hand-edited emitted schema fails CI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the committed, generated signature-envelope schema. */
export const SIGNATURE_ENVELOPE_SCHEMA_PATH = path.join(
  ROOT,
  'schemas',
  'signature-envelope.schema.json',
);

/** Generate the signature-envelope JSON Schema from the `SignatureEnvelope` type. */
export function generateSignatureEnvelopeSchema() {
  return createGenerator({
    path: path.join(ROOT, 'src', 'types', 'wire', 'signature.ts'),
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    type: 'SignatureEnvelope',
    additionalProperties: false,
    strictTuples: true,
    topRef: true,
    sortProps: true,
    jsDoc: 'extended',
  }).createSchema('SignatureEnvelope');
}
