---
"@gridmason/protocol": patch
---

Pin the **dev-proxy SDK wire format** (issue #42) — the forward-leg contract the
CLI's `gridmason dev --proxy` speaks to a target host, so the CLI's forward leg
and a host's future receive endpoint meet on one type instead of drifting. Adds
`DEV_PROXY_SDK_PATH`, the `DevProxySdkRequest` (`{ method: string; args }`) and
`DevProxySdkResponse` (`{ ok: true; value } | { ok: false; error }`) types, and
the pure guards `isDevProxySdkRequest` / `isDevProxySdkResponse`. `method` stays a
plain `string` — the SDK method vocabulary is `@gridmason/sdk`'s, and the protocol
must not depend on it.

Also promotes the scope-prefix **grant rule** as `grantsCapability(declared,
required)` next to the capability grammar: a declared capability grants a required
one iff the apis match and the declared scope path is a prefix of the required
one. This is the one definition of the `min(user, widget)` containment the host
SDK gate, the CLI `--proxy` enforcement, and the SDK fixture handle all apply.

Ships positive and negative `capability-grant`, `dev-proxy-request`, and
`dev-proxy-response` conformance vectors under `@gridmason/protocol/vectors`.
