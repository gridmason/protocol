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
  SIGNATURE_ENVELOPE_SCHEMA_PATH,
  generateSignatureEnvelopeSchema,
} from './signature-schema.mjs';
import {
  REVOCATION_SCHEMA_PATH,
  SIGNED_REVOCATION_SCHEMA_PATH,
  generateRevocationSchema,
  generateSignedRevocationSchema,
} from './revocation-schema.mjs';
import {
  LOG_ENTRY_SCHEMA_PATH,
  generateLogEntrySchema,
} from './log-entry-schema.mjs';
import {
  TRUST_ROOT_SCHEMA_PATH,
  generateTrustRootSchema,
} from './trust-root-schema.mjs';
import {
  GMB_BUNDLE_SCHEMA_PATH,
  generateGmbBundleSchema,
} from './bundle-schema.mjs';
import {
  GATE_SNAPSHOT_SCHEMA_PATH,
  IMPORT_MAP_FRAGMENT_SCHEMA_PATH,
  generateGateSnapshotSchema,
  generateImportMapFragmentSchema,
} from './resolution-schema.mjs';

for (const [schemaPath, schema] of [
  [MANIFEST_SCHEMA_PATH, generateManifestSchema()],
  [SIGNATURE_ENVELOPE_SCHEMA_PATH, generateSignatureEnvelopeSchema()],
  [REVOCATION_SCHEMA_PATH, generateRevocationSchema()],
  [SIGNED_REVOCATION_SCHEMA_PATH, generateSignedRevocationSchema()],
  [LOG_ENTRY_SCHEMA_PATH, generateLogEntrySchema()],
  [TRUST_ROOT_SCHEMA_PATH, generateTrustRootSchema()],
  [GMB_BUNDLE_SCHEMA_PATH, generateGmbBundleSchema()],
  [GATE_SNAPSHOT_SCHEMA_PATH, generateGateSnapshotSchema()],
  [IMPORT_MAP_FRAGMENT_SCHEMA_PATH, generateImportMapFragmentSchema()],
]) {
  mkdirSync(path.dirname(schemaPath), { recursive: true });
  writeFileSync(schemaPath, serializeSchema(schema));
}
