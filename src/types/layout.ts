/**
 * `LayoutDoc` contract types + the migrate-on-read framework (docs/SPEC.md §3.3,
 * core §5).
 *
 * A layout document is a versioned JSON page description. Every document carries
 * a numeric `schemaVersion`; this module ships the current ({@link CURRENT_LAYOUT_SCHEMA_VERSION})
 * shape plus a registry of pure per-step migrators. Hosts call {@link migrate} on
 * load: an older document is upgraded step-by-step to the current version, and a
 * document from a *newer* build than this library understands is returned
 * `{ readOnly: true, reason }` — {@link migrate} **never throws and never
 * rewrites** such a document, so the host can render it read-only with a warning
 * rather than risk a destructive downgrade (core §5).
 *
 * No runtime dependencies.
 */

import type { WidgetID } from './identity.js';

/** A layout document schema version: a positive integer, monotonically bumped. */
export type SchemaVersion = number;

/**
 * The current `LayoutDoc` schema version this library reads and writes. A
 * document at this version needs no migration; anything higher is treated as
 * unknown-newer by {@link migrate}.
 */
export const CURRENT_LAYOUT_SCHEMA_VERSION = 1;

/** One placed widget within a grid (docs/SPEC.md §3.3). */
export interface LayoutWidget {
  /** Source-qualified identity of the widget to render (identity.ts). */
  readonly widgetID: WidgetID;
  /** Stable grid-item key (unique within its {@link LayoutGrid}). */
  readonly i: string;
  /** Column of the item's top-left cell. */
  readonly x: number;
  /** Row of the item's top-left cell. */
  readonly y: number;
  /** Width in grid columns. */
  readonly w: number;
  /** Height in grid rows. */
  readonly h: number;
  /** User-configured widget settings (validated against the widget's props schema). */
  readonly props?: Readonly<Record<string, unknown>>;
  /** Named slot this item fills, for slotted page-type layouts. */
  readonly slot?: string;
}

/** A grid: an ordered set of placed widgets (docs/SPEC.md §3.3). */
export interface LayoutGrid {
  readonly items: readonly LayoutWidget[];
}

/** A named tab, each owning its own grid (docs/SPEC.md §3.3). */
export interface LayoutTab {
  readonly name: string;
  readonly grid: LayoutGrid;
}

/**
 * A `LayoutDoc`: the top-level versioned layout for one page (docs/SPEC.md §3.3).
 * When `hasTabs` is false the page renders `grid`; when true it renders `tabs`.
 */
export interface LayoutPage {
  /** Schema version of this document (see {@link CURRENT_LAYOUT_SCHEMA_VERSION}). */
  readonly schemaVersion: SchemaVersion;
  /** Page-type id this layout targets (e.g. `crm.customer-detail`). */
  readonly page: string;
  /** Human-readable name of this layout. */
  readonly name: string;
  /** Whether this is the default layout for its page type. */
  readonly default: boolean;
  /** The single-grid layout, used when `hasTabs` is false. */
  readonly grid: LayoutGrid;
  /** Whether this layout is organized into tabs. */
  readonly hasTabs: boolean;
  /** The tabbed layout, used when `hasTabs` is true. */
  readonly tabs: readonly LayoutTab[];
}

/**
 * The minimal shape every layout document shares regardless of version: a
 * numeric `schemaVersion`. Migrators refine the rest for the version they know.
 * A {@link LayoutPage} is a {@link VersionedLayout}.
 */
export interface VersionedLayout {
  readonly schemaVersion: SchemaVersion;
}

/**
 * A single migration step. Pure and total: given a document at `fromVersion`,
 * `migrate` returns a **new** document at `fromVersion + 1`. It must not mutate
 * its input and must not throw for a well-formed document of its version.
 *
 * A migrator typically narrows its input to the concrete `fromVersion` shape
 * internally (that shape is not the exported {@link LayoutPage}, which always
 * describes the current version).
 */
export interface Migrator {
  /** The version this step upgrades *from*; it produces `fromVersion + 1`. */
  readonly fromVersion: SchemaVersion;
  /** Pure upgrade: returns a new document one version newer than the input. */
  migrate(doc: VersionedLayout): VersionedLayout;
}

/**
 * The result of {@link migrate}.
 *
 * - `readOnly: false` — the document was already current or was upgraded to the
 *   current version; `doc` is the (possibly newly-built) current-version document.
 * - `readOnly: true` — the document could not be safely upgraded (it is newer
 *   than this build understands, or a migration step is missing). `doc` is the
 *   **untouched original** and `reason` explains why; the host should render it
 *   read-only. No rewrite ever occurs on this branch.
 */
export type MigrateResult =
  | { readonly readOnly: false; readonly doc: LayoutPage }
  | { readonly readOnly: true; readonly reason: string; readonly doc: VersionedLayout };

/**
 * A registry of per-step layout migrators, keyed by `fromVersion`. Holds at most
 * one migrator per version step; the chain runner ({@link migrate}) composes them
 * to upgrade a document across multiple versions.
 *
 * Dependent packages register their steps here — for example the `s7k-widgets-core`
 * POC importer (a declared migrator; core M3) registers into {@link layoutMigrators}.
 *
 * @example
 * ```ts
 * const registry = new MigratorRegistry();
 * registry.register({
 *   fromVersion: 1,
 *   migrate: (doc) => ({ ...doc, schemaVersion: 2 }),
 * });
 * const result = migrate(oldDoc, { registry, target: 2 });
 * ```
 */
export class MigratorRegistry {
  readonly #steps = new Map<SchemaVersion, Migrator>();

  /**
   * Register a migration step. Chainable.
   *
   * @throws RangeError if a migrator is already registered for `fromVersion`, or
   *   if `fromVersion` is not a positive integer.
   */
  register(migrator: Migrator): this {
    const { fromVersion } = migrator;
    if (!Number.isInteger(fromVersion) || fromVersion < 1) {
      throw new RangeError(`migrator fromVersion must be a positive integer, got ${String(fromVersion)}`);
    }
    if (this.#steps.has(fromVersion)) {
      throw new RangeError(`a migrator is already registered for schemaVersion ${fromVersion}`);
    }
    this.#steps.set(fromVersion, migrator);
    return this;
  }

  /** The migrator that upgrades *from* `fromVersion`, if one is registered. */
  get(fromVersion: SchemaVersion): Migrator | undefined {
    return this.#steps.get(fromVersion);
  }

  /** Whether a migrator is registered for `fromVersion`. */
  has(fromVersion: SchemaVersion): boolean {
    return this.#steps.has(fromVersion);
  }

  /** Number of registered steps. */
  get size(): number {
    return this.#steps.size;
  }
}

/**
 * The migrator chain this package ships. `v1` is the baseline schema, so no
 * historical steps are registered yet; dependent packages add steps as the
 * schema evolves (see {@link MigratorRegistry}). {@link migrate} uses this
 * registry by default.
 */
export const layoutMigrators = new MigratorRegistry();

/** Options for {@link migrate}. */
export interface MigrateOptions {
  /** Migrator registry to use. Defaults to {@link layoutMigrators}. */
  readonly registry?: MigratorRegistry;
  /** Target version to upgrade to. Defaults to {@link CURRENT_LAYOUT_SCHEMA_VERSION}. */
  readonly target?: SchemaVersion;
}

/**
 * Upgrade a layout document to the current schema version by composing the
 * registered per-step migrators (migrate-on-read).
 *
 * Guarantees (docs/SPEC.md §3.3, core §5):
 * - **Never throws** on a version-negotiation ground and **never mutates** the
 *   input document.
 * - A document already at `target` is returned as-is (idempotent): calling
 *   `migrate` on a result's `doc` is a no-op.
 * - A document **newer** than `target`, one with an unrecognized `schemaVersion`,
 *   or one that needs a step with no registered migrator, yields
 *   `{ readOnly: true, reason, doc }` with the **original** document untouched.
 *
 * @param doc A layout document at any version.
 * @param options Registry and target overrides (see {@link MigrateOptions}).
 */
export function migrate(doc: VersionedLayout, options: MigrateOptions = {}): MigrateResult {
  const registry = options.registry ?? layoutMigrators;
  const target = options.target ?? CURRENT_LAYOUT_SCHEMA_VERSION;
  const version = doc.schemaVersion;

  if (!Number.isInteger(version) || version < 1) {
    return readOnly(doc, `unrecognized schemaVersion ${String(version)}: expected a positive integer`);
  }
  if (version > target) {
    return readOnly(
      doc,
      `document schemaVersion ${version} is newer than this build understands (max ${target}); rendering read-only`,
    );
  }

  let current: VersionedLayout = doc;
  for (let v = version; v < target; v++) {
    const step = registry.get(v);
    if (step === undefined) {
      return readOnly(
        doc,
        `no migrator registered for schemaVersion ${v} → ${v + 1}; cannot upgrade to ${target}`,
      );
    }
    current = step.migrate(current);
  }

  return { readOnly: false, doc: current as LayoutPage };
}

/** Build the read-only branch of a {@link MigrateResult}, carrying the untouched doc. */
function readOnly(doc: VersionedLayout, reason: string): MigrateResult {
  return { readOnly: true, reason, doc };
}
