// Public barrel for @gridmason/protocol. Each subpath is also a package export
// (see package.json "exports"); this root re-exports them for convenience.
// Subtrees are placeholders until the P-E1/P-E2/P-E3 epics land (docs/SPEC.md §2).
export * from './types/index.js';
export * from './canon/index.js';
export * from './verify/index.js';
export * from './negotiate/index.js';
