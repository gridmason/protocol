import { expect, test } from 'vitest';

import * as protocol from '../src/index.js';

// Scaffold smoke test: proves the barrel is importable and that vitest +
// coverage reporting run in CI. As the P-E1 contract types land, the barrel
// begins to expose runtime members (e.g. the context subset check);
// canon/verify/negotiate land in later epics.
test('the package barrel is importable', () => {
  expect(protocol).toBeTypeOf('object');
  expect(protocol).not.toBeNull();
});
