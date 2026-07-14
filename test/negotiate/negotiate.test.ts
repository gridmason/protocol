import { describe, expect, it } from 'vitest';

import {
  negotiate,
  PROTOCOL_FORMAT_SUPPORT,
} from '../../src/negotiate/index.js';
import type { FormatSupport } from '../../src/negotiate/index.js';

// docs/SPEC.md §5, §6 — the format-version handshake. `ok` = current major read
// as-is, `upgrade` = older-but-still-spoken major, `refuse` = malformed / too
// new / no longer spoken. It must never guess.

describe('negotiate — current major (ok)', () => {
  const local: FormatSupport = { speaks: [1] };

  it('accepts the exact current major.minor', () => {
    expect(negotiate(local, '1.0')).toBe('ok');
  });

  it('accepts a higher minor within the current major (additive/back-compatible)', () => {
    expect(negotiate(local, '1.4')).toBe('ok');
    expect(negotiate(local, '1.99')).toBe('ok');
  });

  it('accepts a lower minor within the current major (subset of what we read)', () => {
    expect(negotiate({ speaks: [2] }, '2.0')).toBe('ok');
  });

  it('the newest spoken major is the current one', () => {
    // Speaks 1 and 2; 2 is current, so a 2.x remote is ok (not upgrade).
    expect(negotiate({ speaks: [1, 2] }, '2.1')).toBe('ok');
  });
});

describe('negotiate — older but still spoken (upgrade)', () => {
  it('a still-spoken major below current asks the peer to upgrade', () => {
    expect(negotiate({ speaks: [1, 2] }, '1.0')).toBe('upgrade');
  });

  it('minor is irrelevant for an older major — always upgrade', () => {
    expect(negotiate({ speaks: [1, 2] }, '1.7')).toBe('upgrade');
  });

  it('the oldest of several still-spoken majors upgrades', () => {
    expect(negotiate({ speaks: [1, 2, 3] }, '1.0')).toBe('upgrade');
    expect(negotiate({ speaks: [1, 2, 3] }, '2.0')).toBe('upgrade');
  });

  it('order of the speaks list does not matter', () => {
    expect(negotiate({ speaks: [3, 1, 2] }, '1.0')).toBe('upgrade');
    expect(negotiate({ speaks: [2, 1] }, '2.5')).toBe('ok');
  });
});

describe('negotiate — refuse (never guess)', () => {
  const local: FormatSupport = { speaks: [1, 2] };

  it('refuses a major newer than any spoken', () => {
    expect(negotiate(local, '3.0')).toBe('refuse');
    expect(negotiate({ speaks: [1] }, '2.0')).toBe('refuse');
  });

  it('refuses a major this build no longer speaks (dropped from speaks)', () => {
    // Dual-running window for major 1 has closed: the build stopped speaking it.
    expect(negotiate({ speaks: [2, 3] }, '1.0')).toBe('refuse');
  });

  it('refuses a gap major between spoken ones', () => {
    expect(negotiate({ speaks: [1, 3] }, '2.0')).toBe('refuse');
  });

  it('refuses when the build speaks nothing', () => {
    expect(negotiate({ speaks: [] }, '1.0')).toBe('refuse');
  });

  it('refuses a malformed version rather than guessing the major', () => {
    for (const bad of ['1', 'v1.0', '1.', '.0', '1.0.0', '1.x', '', ' 1.0', '1.0 ', 'abc']) {
      expect(negotiate(local, bad)).toBe('refuse');
    }
  });
});

describe('PROTOCOL_FORMAT_SUPPORT', () => {
  it('speaks exactly major 1, matching the verify hot path', () => {
    expect(PROTOCOL_FORMAT_SUPPORT.speaks).toEqual([1]);
  });

  it('reads current-major artifacts and refuses an unknown newer major', () => {
    expect(negotiate(PROTOCOL_FORMAT_SUPPORT, '1.0')).toBe('ok');
    expect(negotiate(PROTOCOL_FORMAT_SUPPORT, '1.5')).toBe('ok');
    expect(negotiate(PROTOCOL_FORMAT_SUPPORT, '2.0')).toBe('refuse');
  });
});
