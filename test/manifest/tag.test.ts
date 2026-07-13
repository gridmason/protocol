import { describe, expect, it } from 'vitest';

import { lintTag } from '../../src/types/manifest/index.js';
import type { TagViolationCode } from '../../src/types/manifest/index.js';

function codes(tag: string, publisher?: string): TagViolationCode[] {
  return lintTag(tag, publisher).violations.map((v) => v.code);
}

describe('lintTag', () => {
  it('accepts a well-formed publisher-prefixed tag', () => {
    const result = lintTag('acme-sales-chart', 'acme');
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('checks only the structural rules when no publisher is given', () => {
    const result = lintTag('acme-sales-chart');
    expect(result.ok).toBe(true);
  });

  it('rejects the empty tag', () => {
    const result = lintTag('', 'acme');
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toEqual(['empty']);
  });

  it('rejects an uppercase tag', () => {
    expect(codes('Acme-Sales-Chart', 'acme')).toContain('not-lowercase');
  });

  it('rejects a tag with no hyphen', () => {
    expect(codes('acmechart', 'acme')).toContain('missing-hyphen');
  });

  it('rejects a tag not prefixed with the publisher namespace', () => {
    expect(codes('other-widget', 'acme')).toContain('missing-publisher-prefix');
    expect(codes('acme-widget', 'acme')).not.toContain('missing-publisher-prefix');
  });

  it('rejects disallowed characters', () => {
    expect(codes('acme-widget!', 'acme')).toContain('invalid-characters');
    expect(codes('1acme-widget', 'acme')).toContain('invalid-characters');
  });

  it('reports every violation at once, not just the first', () => {
    // uppercase + no publisher prefix + bad start char all hold here.
    const result = lintTag('Widget', 'acme');
    expect(result.violations.length).toBeGreaterThan(1);
    expect(result.ok).toBe(false);
  });
});
