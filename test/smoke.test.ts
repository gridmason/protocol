import { expect, test } from 'vitest';

import * as protocol from '../src/index.js';

// Scaffold smoke test: proves the barrel is importable and that vitest +
// coverage reporting run in CI. Contract types, canon, and verify code land
// across the P-E1/P-E2/P-E3 epics; the barrel re-exports each as it arrives.
test('the package barrel is importable', () => {
  expect(protocol).toBeTypeOf('object');
});
