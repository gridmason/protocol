# Security Policy

`@gridmason/protocol` is the **security core of Gridmason**: it defines the wire
formats and ships the pure verification library (`src/verify`, `src/canon`) that
every host, CLI, and registry runs on the security hot path. The platform's
central claim — *"the reviewed hash is the runnable artifact"* — is only true if
this package computes identity, verifies signatures, and checks transparency-log
inclusion correctly and identically everywhere. A defect here is a defect in
every consumer. We treat vulnerability reports accordingly.

## Reporting a Vulnerability

**Do not open a public issue, discussion, or pull request for a suspected
vulnerability.** Public disclosure before a fix is available puts every
downstream host and its users at risk.

Instead, report privately through GitHub's coordinated disclosure workflow:

1. Go to the **[Security Advisories](https://github.com/gridmason/protocol/security/advisories/new)**
   page for this repository (Security tab → Report a vulnerability).
2. Provide as much of the following as you can:
   - Affected version(s) or commit(s), and the affected path (e.g. `verify/`,
     `canon/`, a specific wire format).
   - A description of the issue and its security impact (e.g. signature
     malleability, a tampered artifact that passes verification, an identity
     collision, a freshness/revocation bypass).
   - A minimal reproduction — ideally a failing conformance vector or a short
     script against a published `0.x` build.
   - Any known workarounds.

If you cannot use GitHub Security Advisories, contact an administrator of the
[`gridmason`](https://github.com/gridmason) GitHub organization directly to
arrange a private channel.

## What to Expect

- **Acknowledgement** within **3 business days** of your report.
- An initial **assessment and severity triage** within **10 business days**.
- Ongoing updates through the advisory thread as we investigate and prepare a
  fix.
- **Coordinated disclosure**: we will agree on a disclosure timeline with you.
  Our target is a fix and published advisory within **90 days** of triage;
  actively-exploited issues are handled faster. We will credit you in the
  advisory unless you ask us not to.

We do not currently operate a paid bug-bounty program.

## Supported Versions

Gridmason is pre-1.0. Security fixes land on the latest `0.x` line and are
released as a new patch version; there is no long-term support for older `0.x`
releases. Always verify against the most recent published version.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | :white_check_mark: |
| older `0.x` | :x: |

Once a `1.0` line ships, this table will be updated with a supported-version
window.

## Scope

In scope — anything that lets a consumer accept an artifact it should reject, or
reject one it should accept:

- Signature-verification flaws, canonicalization (JCS / RFC-8785) mismatches, or
  signature malleability in `canon/` or `verify/`.
- Transparency-log inclusion, revocation-feed freshness, or trust-root
  evaluation logic that can be bypassed.
- Identity/hash computation that can be made to collide or diverge between
  consumers.
- Format-negotiation logic that accepts a format major it should refuse.
- Reason-enum / no-tag-echo violations (core §8) that leak the identity of a
  gated-off or unknown widget.
- Supply-chain integrity of the package itself (build, publish provenance,
  dependency pinning on the verify path).

Out of scope:

- Vulnerabilities in downstream Gridmason repos (`core`, `cli`, `registry`,
  `dashboard`) — report those to their respective repositories, unless the root
  cause is in `protocol`.
- Issues requiring a maliciously modified local build of this library.
- Reports generated solely by automated scanners without a demonstrated,
  reproducible security impact on the verification path.

## Disclosure Philosophy

This package is deliberately minimal and auditable — **no network, no
filesystem, no private-key handling, no dynamic code execution.** Verification is
deterministic given `(bytes, roots, clock)`. If you have found a way to violate
that determinism or the integrity guarantees above, we want to hear from you
before anyone else does.
