/**
 * Tag lint rules (docs/SPEC.md §3.1). A manifest `tag` is the widget's
 * custom-element name, so it MUST be publisher-prefixed, lowercase, and contain
 * at least one hyphen. These rules live here — not in the CLI or the registry —
 * so `cli lint` and registry review run the identical check and return the
 * identical, enumerated verdicts.
 */

/** Enumerated tag-lint failures. Callers switch on the code, not the message. */
export type TagViolationCode =
  /** The tag was the empty string. */
  | 'empty'
  /** The tag contains uppercase characters. */
  | 'not-lowercase'
  /** The tag contains no hyphen (a custom-element name requires one). */
  | 'missing-hyphen'
  /** The tag has characters outside `[a-z0-9-]` or does not start with a letter. */
  | 'invalid-characters'
  /** A `publisher` was supplied and the tag is not prefixed with `<publisher>-`. */
  | 'missing-publisher-prefix';

/** A single lint failure: a stable {@link TagViolationCode} plus a human message. */
export interface TagViolation {
  code: TagViolationCode;
  message: string;
}

/** Result of {@link lintTag}: `ok` plus every violation found (not just the first). */
export interface TagLintResult {
  ok: boolean;
  violations: TagViolation[];
}

// A well-formed custom-element name for our purposes: starts with a lowercase
// ASCII letter, then lowercase letters, digits, or hyphens. The `missing-hyphen`
// and `not-lowercase` codes are reported separately so tooling can explain which
// specific rule failed rather than only "invalid".
const WELL_FORMED = /^[a-z][a-z0-9-]*$/;

/**
 * Lint a manifest tag against the SPEC §3.1 rules. Pass the manifest's
 * `publisher` to also enforce the publisher-prefix rule; omit it to check only
 * the structural rules (lowercase, hyphen, character set).
 */
export function lintTag(tag: string, publisher?: string): TagLintResult {
  const violations: TagViolation[] = [];

  if (tag.length === 0) {
    violations.push({ code: 'empty', message: 'tag must not be empty' });
    return { ok: false, violations };
  }

  if (tag !== tag.toLowerCase()) {
    violations.push({ code: 'not-lowercase', message: 'tag must be lowercase' });
  }
  if (!tag.includes('-')) {
    violations.push({ code: 'missing-hyphen', message: 'tag must contain at least one hyphen' });
  }
  if (!WELL_FORMED.test(tag)) {
    violations.push({
      code: 'invalid-characters',
      message: 'tag must start with a lowercase letter and use only [a-z0-9-]',
    });
  }
  if (publisher !== undefined && !tag.startsWith(`${publisher}-`)) {
    violations.push({
      code: 'missing-publisher-prefix',
      message: `tag must be prefixed with the publisher namespace "${publisher}-"`,
    });
  }

  return { ok: violations.length === 0, violations };
}
