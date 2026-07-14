# @gridmason/protocol

## 0.0.3

### Patch Changes

- a134158: Add the runtime page-context **value** side to the typed-context contract
  (issue #37, needed by the sdk's `HostSDK.context`): `ContextValue` (with
  `RecordRefValue` and `ObjectValue`) mirroring the `ContextType` grammar,
  `PageContext` as the value-side counterpart of `ContextMap`, and the pure
  conformance helpers `matchesContextType` / `matchesContextMap`. Ships positive
  and negative `context-match` conformance vectors under
  `@gridmason/protocol/vectors`, and documents `WidgetID` (capital `ID`) as the
  canonical spelling.

## 0.0.2

### Patch Changes

- c975763: Contract types (M0a): widget/plugin manifest schema with generated JSON Schemas,
  tag lint rules, and the capability grammar; typed page-context primitives +
  composites with the pure subset check; LayoutDoc with the migrator chain,
  read-only-on-newer semantics, and source-qualified widget identity; the
  s7k-widgets-core POC importer; and the type conformance vector runner at
  `@gridmason/protocol/vectors`.

## 0.0.1

### Patch Changes

- Initial `0.0.x` release. Publishes the package scaffold (ESM output + type declarations) and stands up the changesets + npm Trusted Publishing (OIDC) release pipeline. Contract types, wire formats, and the verify core land in later releases.
