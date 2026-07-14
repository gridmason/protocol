/**
 * Widget/plugin manifest contract (docs/SPEC.md §3.1): the TypeScript types
 * (authoring surface for the generated `schemas/manifest.schema.json`), the
 * capability grammar, and the tag lint rules — the one implementation `cli lint`
 * and registry review both import.
 */

export type {
  GridSize,
  Manifest,
  ManifestContextRequirement,
  ManifestKind,
  ManifestRequirement,
  ManifestSize,
  PageTypeDescriptor,
} from './manifest.js';

export type {
  Capability,
  CapabilityApi,
  CapabilityError,
  CapabilityParseResult,
  ParsedCapability,
} from './capability.js';
export {
  CAPABILITY_APIS,
  formatCapability,
  grantsCapability,
  parseCapability,
  validateCapability,
} from './capability.js';

export type { TagLintResult, TagViolation, TagViolationCode } from './tag.js';
export { lintTag } from './tag.js';
