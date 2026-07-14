// Types for the plain-ESM revocation-feed schema generator so the TypeScript
// guard test can import it under NodeNext + verbatimModuleSyntax without pulling
// the devDependency generator into the typed source graph.

import type { JsonSchema } from './manifest-schema.d.mts';

export declare const REVOCATION_SCHEMA_PATH: string;
export declare function generateRevocationSchema(): JsonSchema;
