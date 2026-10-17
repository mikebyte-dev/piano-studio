import { describe, expect, it } from '@jest/globals';

import type { Note } from '../../domain/types';
import { commitOverdub, commitReplace } from '../commitModes';

/**
 * Contract tests for the recording commit modes (`src/core/recording/commitModes.ts`).
 *
 * Written from the spec, BEFORE implementation (test-first). Pure logic only:
 * every function takes inputs and returns a new array.
 *
 * Overlap rule (from the spec): two intervals [a1, a1+a2duration) and
 * [b1, b1+b2duration) overlap iff `a1 < b2 && b1 < a2`. The recording range is
 * treated as the half-open interval [rangeStart, rangeEnd).
 *
 * SPEC AMBIGUITIES (decisions taken here, flagged for review):
 *  1. "sorted" means by `startTick` ascending, then `pitch` ascending (ties on
 *     startTick are broken by pitch, matching `commitOverdub`'s description).
 *  2. `commitReplace` appends `incoming` unchanged, even when an incoming note
 *     falls outside [rangeStart, rangeEnd) — the spec says "+ incoming" without
 *     filtering.
 *  3. Purity: inputs are never mutated.
 */
const makeNote = (
  id: string,
  pitch: number,
  startTick: number,
  durationTick: number,
  velocity = 100,
): Note => ({ id, pitch, velocity, startTick, durationTick });

const span = (notes: Note[]): [number, number, number][] =>
  notes.map((n) => [n.startTick, n.pitch, n.durationTick]);

describe('commitOverdub', () => {
  it('returns the incoming notes when there is no existing material', () => {
    const incoming = [makeNote('n1', 60, 0, 10), makeNote('n2', 64, 20, 10)];

    expect(commitOverdub([], incoming)).toEqual(incoming);
  });

  it('returns an empty array when both sides are empty', () => {
    expect(commitOverdub([], [])).toEqual([]);
  });

  it('keeps the existing material untouched', () => {
    const existing = [makeNote('e1', 60, 0, 10), makeNote('e2', 62, 40, 10)];
    const incoming = [makeNote('n1', 64, 20, 10)];

    const result = commitOverdub(existing, incoming);

    expect(result).toHaveLength(3);
    expect(result).toContainEqual(existing[0]);
    expect(result).toContainEqual(existing[1]);
    expect(result).toContainEqual(incoming[0]);
  });

  it('sorts the merged result by startTick then pitch', () => {
    const existing = [makeNote('e1', 60, 100, 10)];
    const incoming = [
      makeNote('n1', 67, 0, 10),
      makeNote('n2', 60, 50, 10),
      makeNote('n3', 62, 50, 10),
    ];

    const result = commitOverdub(existing, incoming);

    expect(span(result)).toEqual([
      [0, 67, 10],
      [50, 60, 10],
      [50, 62, 10],
      [100, 60, 10],
    ]);
  });

  it('does not mutate its inputs', () => {
    const existing = [makeNote('e1', 60, 100, 10)];
    const incoming = [makeNote('n1', 64, 0, 10)];
    const existingSnapshot = JSON.parse(JSON.stringify(existing)) as Note[];
    const incomingSnapshot = JSON.parse(JSON.stringify(incoming)) as Note[];

    commitOverdub(existing, incoming);

    expect(existing).toEqual(existingSnapshot);
    expect(incoming).toEqual(incomingSnapshot);
  });

  it('does not return the same array instance as an input', () => {
    const existing = [makeNote('e1', 60, 100, 10)];
    const incoming = [makeNote('n1', 64, 0, 10)];

    const result = commitOverdub(existing, incoming);

    expect(result).not.toBe(existing);
    expect(result).not.toBe(incoming);
  });
});

describe('commitReplace', () => {
  it('returns the incoming notes when there is no existing material', () => {
    const incoming = [makeNote('n1', 60, 20, 10)];

    expect(commitReplace([], incoming, 0, 100)).toEqual(incoming);
  });

  it('returns an empty array when both sides are empty', () => {
    expect(commitReplace([], [], 0, 100)).toEqual([]);
  });

  it('removes only the existing notes that overlap the range', () => {
    const existing = [
      makeNote('a', 60, 0, 10), // [0, 10)   -> outside
      makeNote('b', 62, 20, 10), // [20, 30) -> inside
      makeNote('c', 64, 40, 20), // [40, 60) -> outside (starts at rangeEnd)
      makeNote('d', 65, 100, 10), // [100, 110) -> outside
    ];
    const incoming = [makeNote('n1', 72, 22, 4)];

    const result = commitReplace(existing, incoming, 20, 40);

    expect(span(result)).toEqual([
      [0, 60, 10],
      [22, 72, 4],
      [40, 64, 20],
      [100, 65, 10],
    ]);
  });

  it('keeps a note that ends exactly at rangeStart (no overlap)', () => {
    const existing = [makeNote('a', 60, 10, 10)]; // [10, 20)

    const result = commitReplace(existing, [], 20, 40);

    expect(span(result)).toEqual([[10, 60, 10]]);
  });

  it('keeps a note that starts exactly at rangeEnd (no overlap)', () => {
    const existing = [makeNote('a', 60, 40, 10)]; // [40, 50)

    const result = commitReplace(existing, [], 20, 40);

    expect(span(result)).toEqual([[40, 60, 10]]);
  });

  it('removes a note that only partially overlaps the range', () => {
    const existing = [makeNote('a', 60, 10, 20)]; // [10, 30) vs [20, 25)

    const result = commitReplace(existing, [], 20, 25);

    expect(result).toEqual([]);
  });

  it('removes a note that fully contains the range', () => {
    const existing = [makeNote('a', 60, 0, 200)]; // [0, 200) vs [20, 40)

    const result = commitReplace(existing, [], 20, 40);

    expect(result).toEqual([]);
  });

  it('keeps incoming notes even when they fall outside the range', () => {
    const existing = [makeNote('a', 60, 20, 10)];
    const incoming = [makeNote('n1', 64, 500, 10)];

    const result = commitReplace(existing, incoming, 20, 40);

    expect(span(result)).toEqual([[500, 64, 10]]);
  });

  it('sorts the merged result by startTick then pitch', () => {
    const existing = [
      makeNote('a', 62, 100, 10),
      makeNote('b', 60, 100, 10),
      makeNote('c', 64, 0, 10),
    ];
    const incoming = [makeNote('n1', 70, 50, 10)];

    const result = commitReplace(existing, incoming, 40, 60);

    expect(span(result)).toEqual([
      [0, 64, 10],
      [50, 70, 10],
      [100, 60, 10],
      [100, 62, 10],
    ]);
  });

  it('leaves non-overlapping existing material in place when there is no incoming', () => {
    const existing = [makeNote('a', 60, 0, 10), makeNote('b', 62, 30, 10)];

    const result = commitReplace(existing, [], 20, 40);

    expect(span(result)).toEqual([[0, 60, 10]]);
  });

  it('does not mutate its inputs', () => {
    const existing = [makeNote('a', 60, 20, 10), makeNote('b', 62, 80, 10)];
    const incoming = [makeNote('n1', 64, 25, 5)];
    const existingSnapshot = JSON.parse(JSON.stringify(existing)) as Note[];
    const incomingSnapshot = JSON.parse(JSON.stringify(incoming)) as Note[];

    commitReplace(existing, incoming, 20, 40);

    expect(existing).toEqual(existingSnapshot);
    expect(incoming).toEqual(incomingSnapshot);
  });

  it('does not return the same array instance as an input', () => {
    const existing = [makeNote('a', 60, 20, 10)];
    const incoming = [makeNote('n1', 64, 25, 5)];

    const result = commitReplace(existing, incoming, 20, 40);

    expect(result).not.toBe(existing);
    expect(result).not.toBe(incoming);
  });
});
