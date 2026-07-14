// Types for the plain-ESM resolution-schema generator so the TypeScript guard
// test can import it under NodeNext + verbatimModuleSyntax without pulling the
// devDependency generator into the typed source graph.

import type { JsonSchema } from './manifest-schema.d.mts';

export declare const GATE_SNAPSHOT_SCHEMA_PATH: string;
export declare const IMPORT_MAP_FRAGMENT_SCHEMA_PATH: string;
export declare function generateGateSnapshotSchema(): JsonSchema;
export declare function generateImportMapFragmentSchema(): JsonSchema;
