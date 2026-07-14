---
"@gridmason/protocol": minor
---

Promote the registry Resolution API wire contract into `@gridmason/protocol`
(`@gridmason/protocol` + `@gridmason/protocol/types`) — the gate-snapshot request
and import-map-fragment response of `POST /v1/resolve` (registry FR-7, FR-10;
GW-D22; cross-repo promotion, issue #66). Adds `GateSnapshot`, `GateModule`,
`SharedOffer`, `ImportMapFragment`, `ResolvedModule`, `SignatureBundle`,
`ExcludedModule`, and the `ExclusionReason` enum, plus generated JSON Schemas at
`@gridmason/protocol/schemas/gate-snapshot.json` and
`.../import-map-fragment.json`.

These shapes were owned by gridmason/registry (`src/resolution/types.ts`, shipped
in registry#13). Now that a second consumer — the Gridmason Dashboard's Phase-B
remote loader (dashboard D-E3.1) — depends on them, they move to the shared
contract; registry and dashboard pin this type and drop their local copies on
their own cadence. Field names, optionality, and semantics match what registry
shipped (a faithful promotion, not a redesign).
