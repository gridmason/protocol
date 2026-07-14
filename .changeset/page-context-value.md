---
"@gridmason/protocol": patch
---

Add the runtime page-context **value** side to the typed-context contract
(issue #37, needed by the sdk's `HostSDK.context`): `ContextValue` (with
`RecordRefValue` and `ObjectValue`) mirroring the `ContextType` grammar,
`PageContext` as the value-side counterpart of `ContextMap`, and the pure
conformance helpers `matchesContextType` / `matchesContextMap`. Ships positive
and negative `context-match` conformance vectors under
`@gridmason/protocol/vectors`, and documents `WidgetID` (capital `ID`) as the
canonical spelling.
