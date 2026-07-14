import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { negotiate } from '../../../src/negotiate/index.js';
import type { NegotiationOutcome } from '../../../src/negotiate/index.js';

// docs/SPEC.md §5, §6 — the shipped negotiation vectors, grouped by expected
// outcome, must hold against the reference `negotiate`. These JSON fixtures are
// the file-form of the `negotiateVectors` corpus exported for consumers.

interface NegotiateFixture {
  readonly name: string;
  readonly note?: string;
  readonly speaks: readonly number[];
  readonly remote: string;
  readonly outcome: NegotiationOutcome;
}

function readVectors(file: string): NegotiateFixture[] {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'),
  ) as NegotiateFixture[];
}

const groups: Record<NegotiationOutcome, NegotiateFixture[]> = {
  ok: readVectors('./ok.json'),
  upgrade: readVectors('./upgrade.json'),
  refuse: readVectors('./refuse.json'),
};

describe('negotiate conformance vectors', () => {
  for (const [outcome, vectors] of Object.entries(groups)) {
    describe(`${outcome}.json`, () => {
      it('is a non-empty vector file', () => {
        expect(vectors.length).toBeGreaterThan(0);
      });

      for (const v of vectors) {
        it(`${v.name} → ${v.outcome}`, () => {
          // Each fixture's declared outcome matches its own file's group.
          expect(v.outcome).toBe(outcome);
          expect(negotiate({ speaks: v.speaks }, v.remote)).toBe(v.outcome);
        });
      }
    });
  }
});
