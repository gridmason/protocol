// Types for the plain-ESM schema generator so the TypeScript guard test can
// import it under NodeNext + verbatimModuleSyntax without pulling the
// devDependency generator into the typed source graph.

/** A generated JSON Schema document (draft-07). */
export type JsonSchema = Record<string, unknown>;

export declare const LOG_ENTRY_SCHEMA_PATH: string;
export declare function generateLogEntrySchema(): JsonSchema;
