import { expect, test } from 'vitest';

import * as protocol from '../src/index.js';

// Scaffold smoke test: proves the barrel is importable and that vitest +
// coverage reporting run in CI. The package intentionally exports no runtime
// members yet — the contract types, canon, and verify code land in later epics.
test('the package barrel is importable and currently exports no runtime members', () => {
  expect(protocol).toBeTypeOf('object');
  expect(Object.keys(protocol)).toHaveLength(0);
});
