import { expect, test } from 'vitest';

import * as protocol from '../src/index.js';

// Scaffold smoke test: proves the barrel is importable and that vitest +
// coverage reporting run in CI. Contract types (P-E1) populate the barrel
// incrementally; canon/verify/negotiate land in later epics.
test('the package barrel is importable', () => {
  expect(protocol).toBeTypeOf('object');
  expect(protocol).not.toBeNull();
});
