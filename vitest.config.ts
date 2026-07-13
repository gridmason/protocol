import { defineConfig } from 'vitest/config';

// GW-D20 hard gate (SPEC §8): the security core — src/verify and src/canon — is
// held at 100% line/branch/function/statement coverage from day one and stays
// enforced as those paths fill in. Other paths carry no coverage threshold yet.
const securityCore = {
  statements: 100,
  branches: 100,
  functions: 100,
  lines: 100,
} as const;

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        '**/src/verify/**': securityCore,
        '**/src/canon/**': securityCore,
      },
    },
  },
});
