/**
 * A layout document from a hypothetical future build: `schemaVersion` far beyond
 * what this library understands, plus an unknown field. Feeds the read-only
 * (unknown-newer) vector — {@link migrate} must return it untouched, never throw.
 *
 * Typed loosely (no annotation) so the unknown future field is permitted.
 */
export const pageNewer = {
  schemaVersion: 99,
  page: 'crm.customer-detail',
  name: 'From a newer build',
  default: false,
  hasTabs: false,
  grid: { items: [] },
  tabs: [],
  someUnknownFutureField: 'must survive untouched',
};
