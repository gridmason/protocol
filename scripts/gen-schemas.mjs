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
  TRUST_ROOT_SCHEMA_PATH,
  generateTrustRootSchema,
} from './trust-root-schema.mjs';

mkdirSync(path.dirname(MANIFEST_SCHEMA_PATH), { recursive: true });
writeFileSync(MANIFEST_SCHEMA_PATH, serializeSchema(generateManifestSchema()));
writeFileSync(REVOCATION_SCHEMA_PATH, serializeSchema(generateRevocationSchema()));
writeFileSync(TRUST_ROOT_SCHEMA_PATH, serializeSchema(generateTrustRootSchema()));
