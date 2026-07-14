/**
 * Registry **Resolution API** wire contract — the gate-snapshot request and the
 * import-map-fragment response of `POST /v1/resolve` (gridmason/registry FR-7,
 * FR-10; registry SPEC §8, §9; GW-D22). Promoted into `@gridmason/protocol` from
 * gridmason/registry (`src/resolution/types.ts`) once a second consumer — the
 * Gridmason Dashboard's Phase-B remote loader (dashboard D-E3.1) — joined the
 * registry as a user of these shapes (cross-repo promotion, issue #66). The
 * registry and the dashboard now both pin this contract instead of the registry
 * owning it alone.
 *
 * The Resolution API turns a **gate snapshot** — the set of remotes a host shell
 * has enabled — into an **import-map fragment** the shell merges into its native
 * ESM import map (GW-D22: no Module-Federation runtime, see the manifest
 * `sharedScope` note in SPEC §3.1). The fragment carries, per resolved module, a
 * **hash-pinned** entry URL (pointing at the registry serving origin) and the
 * {@link SignatureBundle} the host verifies with this package's `verifyRelease`
 * before it loads a byte, plus `scopes` entries that resolve shared-dependency
 * majors when two widgets need different ones.
 *
 * These are HTTP request/response DTOs (like {@link import('./dev-proxy.js')}),
 * **not** signed wire documents — they carry no `formatVersion` and live beside
 * the other contract types rather than under `types/wire/`. The signed material
 * they transport ({@link SignatureBundle}) is the untrusted, network-delivered
 * input to `verifyRelease`: nothing here is trusted for being in the fragment.
 *
 * **Anonymous.** The API takes no auth and requires no deployment registration —
 * a registry is never a control plane a deployment must phone (registry SPEC §1,
 * §8). The gate snapshot is the *host's* enablement state; the registry only maps
 * it to verifiable URLs.
 *
 * **Source-qualified (registry SPEC §9, FR-10).** Publisher prefixes are unique
 * only within a registry, so every output is qualified by that registry's id: the
 * fragment carries {@link ImportMapFragment.registry}, and each module is keyed by
 * `(registry, publisher, tag)`. A host merging fragments from several registries
 * pins each prefix to one registry and composes absolute URLs by prepending that
 * registry's pinned serving origin to the root-relative paths here.
 *
 * This module defines the wire *shape* only — every field is untrusted input
 * until the consuming host verifies it. Types describe structure, never validity.
 */

import type { ReleaseDoc } from '../verify/release/index.js';
import type { SignatureEnvelope } from './wire/signature.js';
import type { TransparencyLogEntry } from './wire/log-entry.js';

/**
 * One enabled remote in a host's gate snapshot: an exact, source-qualified
 * `(publisher, tag, version)` the host has decided to load. Versions are **exact**
 * — this cut resolves a pinned version, never a version *set* or range (SCOPE cut:
 * no version sets, GW-D19); the host's gate service already chose the version.
 */
export interface GateModule {
  /** Publisher namespace prefix (unique within this registry, registry SPEC §9). */
  readonly publisher: string;
  /** The widget custom-element tag (publisher-prefixed). */
  readonly tag: string;
  /** The exact SemVer of the enabled artifact. */
  readonly version: string;
}

/**
 * One shared-dependency major the host **shell offers** for a bare specifier:
 * the module URL the shell already provides for major `major`. A widget's manifest
 * `sharedScope` declares the *range* it needs (GW-D22); resolution matches that
 * range against these offers and emits a `scopes` entry when a widget needs a
 * non-default major. The shell owns these URLs — the registry never hosts a shared
 * dependency, it only scopes to what the shell declares ("never globals").
 */
export interface SharedOffer {
  /**
   * The SemVer major the shell offers at {@link url}.
   * @asType integer
   */
  readonly major: number;
  /** The module URL the shell serves this major from (host-owned). */
  readonly url: string;
}

/**
 * A gate snapshot: the request body of `POST /v1/resolve`. The enabled modules the
 * host wants URLs for, plus what the shell offers for each shared specifier so
 * resolution can scope different majors. `shared` is optional — a fragment of
 * fully self-contained widgets needs none.
 */
export interface GateSnapshot {
  /**
   * The registry this snapshot targets — must equal the registry's id (registry
   * SPEC §9: the host pins each prefix to one registry, so a snapshot is
   * single-registry). A mismatch is a configuration error, refused typed.
   */
  readonly registry: string;
  /** The enabled remotes to resolve. May be empty (nothing enabled ⇒ empty fragment). */
  readonly modules: readonly GateModule[];
  /** Shared-dependency majors the shell offers, keyed by bare specifier. */
  readonly shared?: Readonly<Record<string, readonly SharedOffer[]>>;
}

/**
 * The signature bundle a host verifies before loading a module (registry SPEC §8,
 * §10) — exactly the material this package's `verifyRelease` consumes as its
 * *untrusted, network-delivered* inputs (the host supplies the pinned trust roots,
 * CA/countersign roots, log key, and clock out of band). Identical in shape to the
 * registry serving surface's `GET /v1/releases/:hash` body, so a host verifies a
 * fragment entry with no second fetch.
 */
export interface SignatureBundle {
  /** The signed release document ({ path → hash }); canonicalized + bound to the subject. */
  readonly release: ReleaseDoc;
  /** The completed dual-signature envelope (publisher + registry countersignature). */
  readonly envelope: SignatureEnvelope;
  /** The transparency-log inclusion entry the release was anchored in. */
  readonly logEntry: TransparencyLogEntry;
}

/**
 * One resolved module in a fragment: its source-qualified identity, the bare
 * `specifier` it is mapped under in {@link ImportMapFragment.imports}, its
 * hash-pinned entry URL, and the {@link SignatureBundle} that proves the URL.
 */
export interface ResolvedModule {
  /** Source registry id — the `source` half of source-qualified identity (registry SPEC §9). */
  readonly source: string;
  /** Publisher prefix that owns the tag on this registry. */
  readonly publisher: string;
  /** The widget custom-element tag. */
  readonly tag: string;
  /** The exact resolved version. */
  readonly version: string;
  /** The bare import-map specifier this module is bound to (`<registry>/<tag>`). */
  readonly specifier: string;
  /** The hash-pinned, root-relative serving URL of the entry module (`/v1/artifacts/:hash`). */
  readonly url: string;
  /** The verification material for {@link url}. */
  readonly bundle: SignatureBundle;
}

/** Why a requested module was not placed in the fragment. Stable machine codes. */
export type ExclusionReason =
  /** No publisher owns that prefix on this registry. */
  | 'unknown_publisher'
  /** No `(publisher, tag, version)` artifact exists. */
  | 'unknown_module'
  /** The artifact is not in a loadable state (revoked, killed, or never approved). */
  | 'not_distributable'
  /** The artifact has no countersigned release document (not yet published). */
  | 'no_release'
  /** The release document or its manifest is internally inconsistent (missing entry/manifest). */
  | 'unresolvable_release'
  /** No shell offer satisfies a widget's `sharedScope` range (GW-D22 resolve-time check). */
  | 'unsatisfied_shared_scope';

/**
 * A module the host asked for that did not enter the fragment, with the reason.
 * Reported rather than silently dropped so the host can render the registry SPEC
 * §6/§8 fallback card — but a revoked/killed/unknown remote **never enters the
 * import map** (registry SPEC §6). Echoes only the identity the host itself sent.
 */
export interface ExcludedModule {
  readonly publisher: string;
  readonly tag: string;
  readonly version: string;
  readonly reason: ExclusionReason;
}

/**
 * The import-map fragment: the response body of `POST /v1/resolve`. A native-ESM
 * import map (`imports` + `scopes`, GW-D22) extended with the per-module signature
 * bundles and the excluded list, all qualified by {@link registry} (FR-10).
 */
export interface ImportMapFragment {
  /** This registry's id — qualifies every entry for source-qualified merging (registry SPEC §9). */
  readonly registry: string;
  /** Bare specifier → hash-pinned entry URL, one per resolved module. */
  readonly imports: Readonly<Record<string, string>>;
  /**
   * Import-map `scopes`: keyed by a resolved module's entry URL, mapping a shared
   * specifier to the module-specific major URL. Emitted **only** when a widget
   * needs a different major than the shell's default (the highest offered) — never
   * a global override (GW-D22).
   */
  readonly scopes: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** The resolved modules, carrying their signature bundles. */
  readonly modules: readonly ResolvedModule[];
  /** Requested modules that did not resolve, with reasons (never in `imports`). */
  readonly excluded: readonly ExcludedModule[];
}
