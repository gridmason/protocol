/**
 * The `s7k-widgets-core` POC importer (docs/SPEC.md §3.3, FR-6).
 *
 * Converts the proof-of-concept's legacy localStorage layout format into a valid
 * current-version {@link LayoutPage} (`LayoutDoc v1`). The POC is the ancestor of
 * this contract — its shape is documented from the real repository
 * (https://github.com/Sniper7Kills-LLC/s7k-widgets-core, `src/types/layout.d.ts`
 * + `src/managers/layout.ts`): the manager persists **an array of layout pages**
 * under the localStorage key {@link POC_LAYOUTS_STORAGE_KEY}, each page nesting
 * `grid → items[]` and `tabs[] → grid → items[]`.
 *
 * Two shapes differ between the POC and `LayoutDoc v1`:
 *
 * - **Widget identity.** A POC widget is keyed by a *bare* `widgetID` (a component
 *   id — a uuid or name, `string | number`). `LayoutDoc` identity is
 *   source-qualified (core §4): every imported widget maps to
 *   `{ source: 'local', tag }` — the POC has no registry, so its widgets are, by
 *   definition, host-bundled `local` widgets (identity.ts, {@link LOCAL_SOURCE}).
 * - **Dropped fields.** The POC's per-node `id`s (page/grid/tab uuids) and a
 *   widget's `name` / `moved` presentation fields have no home in `LayoutDoc v1`
 *   and are dropped; `i` (the grid-item key) is coerced to the `string` the
 *   contract requires.
 *
 * ## Purity & totality (SPEC §7)
 *
 * The importer is pure: **no `fs`, no `window`/`localStorage`** — the caller reads
 * the string out of storage, `JSON.parse`s it, and passes the parsed value in.
 * The public converters ({@link importS7kLayoutPage}, {@link importS7kWidgetLayouts})
 * are **total**: malformed or partial input yields a typed
 * {@link PocImportError} result, never a throw.
 *
 * ## Relationship to the migrator chain
 *
 * The POC predates `schemaVersion` entirely — notionally {@link POC_SCHEMA_VERSION}
 * (0), one step below the `LayoutDoc v1` baseline. The migrator chain shipped by
 * the framework (layout.ts) is floored at v1: {@link MigratorRegistry.register}
 * and {@link migrate} both reject `schemaVersion < 1`, and the shipped
 * {@link layoutMigrators} carries no historical steps. So this importer is a
 * **declared migrator** ({@link s7kImportMigrator} conforms to {@link Migrator})
 * that a consumer runs at the *boundary* — POC blob → `LayoutDoc v1` — after which
 * the normal migrate-on-read chain takes over. It is deliberately **not**
 * installed into the shipped `layoutMigrators` singleton (that would break the v1
 * baseline); consumers invoke a converter directly.
 *
 * No runtime dependencies.
 */

import { LOCAL_SOURCE } from './identity.js';
import {
  CURRENT_LAYOUT_SCHEMA_VERSION,
  type LayoutGrid,
  type LayoutPage,
  type LayoutTab,
  type LayoutWidget,
  type Migrator,
  type VersionedLayout,
} from './layout.js';

/**
 * The localStorage key the `s7k-widgets-core` POC persists its saved layouts
 * under (`src/managers/layout.ts`). Its value is a JSON-stringified array of
 * {@link PocLayoutPage} — the input to {@link importS7kWidgetLayouts}.
 */
export const POC_LAYOUTS_STORAGE_KEY = '$widgetLayouts';

/**
 * The notional `schemaVersion` of the POC format: 0, one below the `LayoutDoc v1`
 * baseline. The POC carries no version field; this names its place *ahead of* the
 * chain (see the module overview) and is the `fromVersion` of
 * {@link s7kImportMigrator}.
 */
export const POC_SCHEMA_VERSION = 0;

/** A POC widget as persisted by the s7k-widgets-core layout manager. */
export interface PocLayoutWidget {
  /** Bare component id (uuid or name) — mapped to a `local` {@link WidgetID}. */
  readonly widgetID: string | number;
  /** Grid-item key; coerced to `string` on import. */
  readonly i: string | number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Per-instance widget settings; carried through unchanged when present. */
  readonly props?: Record<string, unknown>;
  /** Display name (dropped on import — not part of `LayoutDoc v1`). */
  readonly name?: string;
  /** Grid-library bookkeeping flag (dropped on import). */
  readonly moved?: boolean;
}

/** A POC grid: an `id` (dropped on import) and its placed widgets. */
export interface PocLayoutGrid {
  readonly id: string | number;
  readonly items: readonly PocLayoutWidget[];
}

/** A POC tab: an `id` (dropped on import), a name, and its own grid. */
export interface PocLayoutTab {
  readonly id: string | number;
  readonly name: string;
  readonly grid: PocLayoutGrid;
}

/** A POC layout page, as stored in the {@link POC_LAYOUTS_STORAGE_KEY} array. */
export interface PocLayoutPage {
  /** Page uuid (dropped on import — `LayoutDoc v1` has no page id). */
  readonly id: string | number;
  readonly page: string;
  readonly name: string;
  readonly default: boolean;
  readonly grid: PocLayoutGrid;
  readonly hasTabs: boolean;
  readonly tabs: readonly PocLayoutTab[];
}

/** Why a POC value could not be imported. A small, stable set (see the codes). */
export type PocImportErrorCode =
  /** The value (or a nested node) was not the object shape expected here. */
  | 'not-an-object'
  /** The top-level `$widgetLayouts` value was not an array. */
  | 'not-an-array'
  /** A required field was absent. */
  | 'missing-field'
  /** A field was present but of the wrong type. */
  | 'wrong-type'
  /** A `widgetID` coerced to the empty string — not a usable identity. */
  | 'empty-widget-id';

/** A typed, non-throwing import failure. */
export interface PocImportError {
  /** Stable machine-readable cause (see {@link PocImportErrorCode}). */
  readonly code: PocImportErrorCode;
  /** Human-readable explanation; safe to log (echoes no widget identity). */
  readonly message: string;
  /**
   * Location of the offending node, as a dotted/indexed path from the input root
   * (e.g. `grid.items[2].x`, or `[0].tabs[1].name` for the array input). `''` is
   * the root.
   */
  readonly path: string;
}

/** The result of {@link importS7kLayoutPage}. */
export type PocImportResult =
  | { readonly ok: true; readonly doc: LayoutPage }
  | { readonly ok: false; readonly error: PocImportError };

/** The result of {@link importS7kWidgetLayouts}. */
export type PocImportBatchResult =
  | { readonly ok: true; readonly docs: readonly LayoutPage[] }
  | { readonly ok: false; readonly error: PocImportError };

/**
 * Import a single POC layout page into a `LayoutDoc v1`. Total: malformed or
 * partial input returns `{ ok: false, error }`, never throws.
 *
 * @param input The parsed POC page object (caller-supplied; no I/O here).
 */
export function importS7kLayoutPage(input: unknown): PocImportResult {
  try {
    return { ok: true, doc: toPage(input, '') };
  } catch (err) {
    if (err instanceof ConversionError) return { ok: false, error: err.detail };
    /* c8 ignore next */ throw err; // not a malformed-input path: a genuine bug
  }
}

/**
 * Import the full `s7k-widgets-core` localStorage payload — the array of saved
 * layout pages stored under {@link POC_LAYOUTS_STORAGE_KEY} — into `LayoutDoc v1`
 * documents. Total: any malformed entry (or a non-array input) returns
 * `{ ok: false, error }` with the offending `path`, never throws.
 *
 * @param input The parsed `$widgetLayouts` value (an array of POC pages).
 */
export function importS7kWidgetLayouts(input: unknown): PocImportBatchResult {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      error: {
        code: 'not-an-array',
        path: '',
        message: `expected the "${POC_LAYOUTS_STORAGE_KEY}" value to be an array of POC layout pages`,
      },
    };
  }
  const pages: readonly unknown[] = input;
  const docs: LayoutPage[] = [];
  try {
    for (let idx = 0; idx < pages.length; idx++) {
      docs.push(toPage(pages[idx], `[${idx}]`));
    }
  } catch (err) {
    if (err instanceof ConversionError) return { ok: false, error: err.detail };
    /* c8 ignore next */ throw err;
  }
  return { ok: true, docs };
}

/**
 * The POC importer as a declared {@link Migrator} (docs/SPEC.md §3.3). Its
 * `fromVersion` is {@link POC_SCHEMA_VERSION} (0), marking it as the pre-v1
 * boundary step; `migrate` narrows its input to the POC shape and returns the
 * `LayoutDoc v1` document.
 *
 * Unlike the total converters, `migrate` **throws** on malformed input (an
 * `Error` whose message names the offending path) — it upholds the {@link Migrator}
 * contract of not throwing for a *well-formed* document, and callers that need
 * totality use {@link importS7kLayoutPage} instead. This object is registrable
 * into a caller's own {@link MigratorRegistry}-style flow, but is not placed in
 * the shipped `layoutMigrators` chain (which is floored at v1).
 */
export const s7kImportMigrator: Migrator = {
  fromVersion: POC_SCHEMA_VERSION,
  migrate(doc: VersionedLayout): LayoutPage {
    return toPage(doc, '');
  },
};

/**
 * Internal signal carrying a {@link PocImportError}. Thrown by the pure `to*`
 * builders and caught at the public boundary so the converters stay total; the
 * declared migrator lets it propagate as a real `Error`.
 */
class ConversionError extends Error {
  constructor(readonly detail: PocImportError) {
    super(detail.message);
    this.name = 'ConversionError';
  }
}

/** Build a {@link ConversionError} for `throw`. */
function conv(code: PocImportErrorCode, path: string, message: string): ConversionError {
  return new ConversionError({ code, path, message });
}

/** A plain (non-array) object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extend a path with a named field. */
function field(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/** A required string field. */
function requireString(obj: Record<string, unknown>, key: string, path: string): string {
  const value = obj[key];
  if (value === undefined) throw conv('missing-field', field(path, key), `missing required field "${key}"`);
  if (typeof value !== 'string') throw conv('wrong-type', field(path, key), `field "${key}" must be a string`);
  return value;
}

/** A required boolean field. */
function requireBoolean(obj: Record<string, unknown>, key: string, path: string): boolean {
  const value = obj[key];
  if (value === undefined) throw conv('missing-field', field(path, key), `missing required field "${key}"`);
  if (typeof value !== 'boolean') throw conv('wrong-type', field(path, key), `field "${key}" must be a boolean`);
  return value;
}

/** A required finite-number field (grid geometry). */
function requireNumber(obj: Record<string, unknown>, key: string, path: string): number {
  const value = obj[key];
  if (value === undefined) throw conv('missing-field', field(path, key), `missing required field "${key}"`);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw conv('wrong-type', field(path, key), `field "${key}" must be a finite number`);
  }
  return value;
}

/** Convert one POC page to a current-version {@link LayoutPage}. */
function toPage(input: unknown, path: string): LayoutPage {
  if (!isObject(input)) throw conv('not-an-object', path, 'expected a POC layout page object');
  const page = requireString(input, 'page', path);
  const name = requireString(input, 'name', path);
  const isDefault = requireBoolean(input, 'default', path);
  const hasTabs = requireBoolean(input, 'hasTabs', path);
  const grid = toGrid(input['grid'], field(path, 'grid'));
  const tabs = toTabs(input['tabs'], field(path, 'tabs'));
  return {
    schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
    page,
    name,
    default: isDefault,
    grid,
    hasTabs,
    tabs,
  };
}

/** Convert a POC grid (dropping its `id`). */
function toGrid(input: unknown, path: string): LayoutGrid {
  if (!isObject(input)) throw conv('not-an-object', path, 'expected a POC grid object');
  const items = input['items'];
  if (!Array.isArray(items)) throw conv('wrong-type', field(path, 'items'), 'grid "items" must be an array');
  const itemsPath = field(path, 'items');
  const list: readonly unknown[] = items;
  return { items: list.map((item, idx) => toWidget(item, `${itemsPath}[${idx}]`)) };
}

/** Convert a POC page's `tabs` array (dropping each tab's `id`). */
function toTabs(input: unknown, path: string): readonly LayoutTab[] {
  if (!Array.isArray(input)) throw conv('wrong-type', path, 'page "tabs" must be an array');
  const list: readonly unknown[] = input;
  return list.map((tab, idx) => toTab(tab, `${path}[${idx}]`));
}

/** Convert a POC tab (dropping its `id`). */
function toTab(input: unknown, path: string): LayoutTab {
  if (!isObject(input)) throw conv('not-an-object', path, 'expected a POC tab object');
  const name = requireString(input, 'name', path);
  const grid = toGrid(input['grid'], field(path, 'grid'));
  return { name, grid };
}

/** Convert a POC widget: source-qualify its identity, coerce `i`, drop extras. */
function toWidget(input: unknown, path: string): LayoutWidget {
  if (!isObject(input)) throw conv('not-an-object', path, 'expected a POC widget object');

  const rawId = input['widgetID'];
  if (rawId === undefined) throw conv('missing-field', field(path, 'widgetID'), 'missing required field "widgetID"');
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    throw conv('wrong-type', field(path, 'widgetID'), 'field "widgetID" must be a string or number');
  }
  const tag = String(rawId);
  if (tag === '') throw conv('empty-widget-id', field(path, 'widgetID'), 'field "widgetID" must not be empty');

  const rawKey = input['i'];
  if (rawKey === undefined) throw conv('missing-field', field(path, 'i'), 'missing required field "i"');
  if (typeof rawKey !== 'string' && typeof rawKey !== 'number') {
    throw conv('wrong-type', field(path, 'i'), 'field "i" must be a string or number');
  }
  const i = String(rawKey);

  const x = requireNumber(input, 'x', path);
  const y = requireNumber(input, 'y', path);
  const w = requireNumber(input, 'w', path);
  const h = requireNumber(input, 'h', path);

  let props: Readonly<Record<string, unknown>> | undefined;
  const rawProps = input['props'];
  if (rawProps !== undefined) {
    if (!isObject(rawProps)) throw conv('wrong-type', field(path, 'props'), 'field "props" must be an object');
    props = rawProps;
  }

  return {
    widgetID: { source: LOCAL_SOURCE, tag },
    i,
    x,
    y,
    w,
    h,
    ...(props !== undefined ? { props } : {}),
  };
}
