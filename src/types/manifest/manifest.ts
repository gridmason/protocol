/**
 * The widget/plugin manifest (docs/SPEC.md §3.1). TypeScript is the single
 * authoring surface for this shape; the JSON Schema under `schemas/` is
 * generated from these types at build (FR-5) and must never be hand-edited.
 *
 * Loading is native ESM + import maps (GW-D22): `entry` is a plain ES module
 * that registers the custom element, and `sharedScope` declares the import-map
 * ranges the host is expected to satisfy — there is no Module-Federation runtime.
 */

import type { Capability } from './capability.js';

/** A widget's grid footprint as `[columns, rows]` cells. */
export type GridSize = [columns: number, rows: number];

/** Grid footprint constraints for a widget. */
export interface ManifestSize {
  /** Footprint the host uses when first placing the widget. */
  default: GridSize;
  /** Smallest footprint the widget may be resized to. */
  min?: GridSize;
  /** Largest footprint the widget may be resized to. */
  max?: GridSize;
}

/**
 * One entry in `requiresContext`: the shape of a single context slot the widget
 * needs the host page to supply. The full context-type grammar lives in
 * `src/types/context` (issue #7); the manifest only needs the record-type key.
 */
export interface ManifestContextRequirement {
  /** Domain record type the slot must carry (e.g. `"customer"`). */
  recordType?: string;
}

/** One edge of the dependency DAG; the registry rejects cycles at publish. */
export interface ManifestRequirement {
  /** Publisher-prefixed tag of the required artifact. */
  tag: string;
  /** SemVer range the host must satisfy at resolve time. */
  range: string;
}

/**
 * The descriptor carried when `kind` is `page-type` (core §3): the context this
 * page type declares to the widgets placed on it, its default layout, the slots
 * it locks, and whether end users may customize it.
 */
export interface PageTypeDescriptor {
  /** Context slots this page type provides, keyed by slot name. */
  context: Record<string, ManifestContextRequirement>;
  /** Tag or path of the layout applied to new instances of this page type. */
  default_layout?: string;
  /** Slot ids the page type pins so user customization cannot move or remove them. */
  locks?: string[];
  /** Whether end users may add, move, or remove widgets on this page type. */
  allow_user_customization?: boolean;
}

/** What a manifest describes. */
export type ManifestKind = 'widget' | 'plugin' | 'page-type' | 'layout';

/**
 * A widget/plugin manifest. Required fields identify and load the artifact
 * (`formatVersion`, `tag`, `kind`, `name`, `publisher`, `version`, `entry`);
 * the rest describe placement, capabilities, and dependencies.
 */
export interface Manifest {
  /**
   * Wire-format version of this manifest as `major.minor`.
   * @pattern ^\d+\.\d+$
   */
  formatVersion: string;
  /**
   * Custom-element tag. MUST be publisher-prefixed, lowercase, and contain at
   * least one hyphen (validated by `lintTag`).
   */
  tag: string;
  /** What this artifact is. */
  kind: ManifestKind;
  /** Human-readable name. */
  name: string;
  /** Publisher namespace prefix; unique within one registry. */
  publisher: string;
  /**
   * SemVer of this artifact.
   * @pattern ^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$
   */
  version: string;
  /** Context slots the widget needs the host page to supply, keyed by slot name. */
  requiresContext?: Record<string, ManifestContextRequirement>;
  /** Page-type globs this widget may be placed on (e.g. `"dashboards.*"`). */
  supportsPages?: string[];
  /** Grid footprint constraints. */
  size?: ManifestSize;
  /**
   * Declared capabilities. The SDK enforces `min(user permissions, declared)`;
   * a capability increase between versions re-triggers registry review.
   */
  capabilities?: Capability[];
  /** Path to the JSON Schema for this widget's user-facing settings. */
  props?: string;
  /** Dependency DAG edges; the registry rejects cycles at publish. */
  requires?: ManifestRequirement[];
  /**
   * Import-map ranges this widget expects the host to satisfy at resolve time.
   * Omitted = a fully self-contained module graph.
   */
  sharedScope?: Record<string, string>;
  /** ES-module entry that registers the custom element; content-hashed. */
  entry: string;
  /** Path to a thumbnail asset. */
  thumbnail?: string;
  /** Present when `kind` is `page-type` (core §3). */
  pageType?: PageTypeDescriptor;
}
