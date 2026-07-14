import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// GW-D20 / SPEC §8: the security core — src/verify and src/canon — is held at
// 100% line AND branch (and function/statement) coverage, and CI fails below it.
// This meta-test guards the *gate itself*: if someone drops a directory from the
// threshold map or lowers any metric below 100, this fails — so the coverage gate
// can never be silently weakened to make a build pass (issue #24 / FR-15). The
// numeric enforcement is vitest's own `coverage.thresholds`; this pins the config.
describe('coverage gate (vitest.config.ts) — never weakened', () => {
  const config = readFileSync(fileURLToPath(new URL('../vitest.config.ts', import.meta.url)), 'utf8');

  it('holds both security-core directories to 100 on every metric', () => {
    // The shared threshold object every gated dir points at.
    const gate = /const securityCore = \{([\s\S]*?)\} as const;/.exec(config);
    expect(gate, 'securityCore threshold block not found').not.toBeNull();
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      expect(gate![1], `${metric} must be pinned to 100`).toMatch(new RegExp(`${metric}:\\s*100`));
    }
  });

  it('applies the gate to src/verify AND src/canon', () => {
    expect(config).toMatch(/['"]\*\*\/src\/verify\/\*\*['"]\s*:\s*securityCore/);
    expect(config).toMatch(/['"]\*\*\/src\/canon\/\*\*['"]\s*:\s*securityCore/);
  });
});
