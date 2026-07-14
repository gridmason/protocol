// Regenerate the committed JSON Schema artifacts from the TypeScript source
// (SPEC §2, FR-5). Run via `npm run schemas` and as the first step of the build.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  MANIFEST_SCHEMA_PATH,
  generateManifestSchema,
  serializeSchema,
} from './manifest-schema.mjs';
import {
  REVOCATION_SCHEMA_PATH,
  generateRevocationSchema,
} from './revocation-schema.mjs';
import {
  LOG_ENTRY_SCHEMA_PATH,
  generateLogEntrySchema,
} from './log-entry-schema.mjs';
import {
  TRUST_ROOT_SCHEMA_PATH,
  generateTrustRootSchema,
} from './trust-root-schema.mjs';

for (const [schemaPath, schema] of [
  [MANIFEST_SCHEMA_PATH, generateManifestSchema()],
  [REVOCATION_SCHEMA_PATH, generateRevocationSchema()],
  [LOG_ENTRY_SCHEMA_PATH, generateLogEntrySchema()],
  [TRUST_ROOT_SCHEMA_PATH, generateTrustRootSchema()],
]) {
  mkdirSync(path.dirname(schemaPath), { recursive: true });
  writeFileSync(schemaPath, serializeSchema(schema));
}
