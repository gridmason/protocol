/**
 * Type conformance vectors + the vector-runner (docs/SPEC.md §6, §7; FR-15).
 *
 * The published entry point of `@gridmason/protocol/vectors`. A consumer
 * (core / cli / registry / dashboard) imports {@link runConformanceVectors} and
 * runs the shipped type vectors in its own CI with one call, so a divergent
 * implementation fails a shared test rather than production (SPEC §6). See the
 * README for the one-import consumer usage.
 *
 * The raw vector arrays are exported too, for consumers that prefer to drive one
 * test case per vector (e.g. a parameterized `it.each`).
 */

/**
 * The format major these type vectors target. Conformance vectors are versioned
 * by manifest format major (SPEC §6): this tracks the `1` in `formatVersion`
 * `1.x`. Bump alongside a new format major; Phase B wire vectors join the same
 * corpus under this version.
 */
export const CONFORMANCE_VECTORS_VERSION = 1;

export { runConformanceVectors } from './runner.js';
export { defaultValidateManifest } from './manifest.js';
export {
  capabilityObjectVectors,
  capabilityStringVectors,
  manifestVectors,
  tagVectors,
} from './manifest.js';
export { contextVectors } from './context.js';
export { layoutVectors } from './layout.js';

export type {
  CapabilityObjectVector,
  CapabilityStringExpectation,
  CapabilityStringVector,
  ConformanceReport,
  ConformanceSurface,
  ContextVector,
  LayoutExpectation,
  LayoutVector,
  ManifestVector,
  TagVector,
  VectorResult,
} from './types.js';
