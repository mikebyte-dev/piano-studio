import { describe, expect, it } from '@jest/globals';

import type { Note, Region } from '../../domain/types';
import {
  moveRegion,
  resizeRegion,
  trimRegionEnd,
  trimRegionStart,
} from '../regionEditing';

/**
 * Contract tests for region editing (`src/core/recording/regionEditing.ts`).
 *
 * Written from the spec, BEFORE implementation (test-first). Pure logic only:
 * every function returns a NEW Region and must never mutate its input.
 *
 * Notes are stored with ABSOLUTE ticks, so region and note positions stay in the
 * same coordinate space (a region starting at tick 100 holds notes at >= 100).
 *
 * SPEC AMBIGUITIES (decisions taken here, flagged for review):
 *  1. `trimRegionStart` keeps the END fixed: `lengthTick = end - newStart`. A
 *     negative `newStartTick` is clamped to 0.
 *  2. `trimRegionStart` drops notes whose end is <= newStart (boundary case
 *     `noteEnd === newStart` -> dropped) and clips crossing notes so their end is
 *     preserved.
 *  3. `trimRegionEnd` drops notes whose start is >= newEnd and clips crossing
 *     notes at newEnd. `lengthTick` is clamped to a minimum of 1.
 *  4. `resizeRegion` ONLY changes `lengthTick`; notes are left untouched even if
 *     they now fall outside the region.
 *  5. Region identity (`id`, `trackId`) is preserved by every operation.
 */
const makeNote = (
  id: string,
  pitch: number,
  startTick: number,
  durationTick: number,
  velocity = 100,
): Note => ({ id, pitch, velocity, startTick, durationTick });

const makeRegion = (noteList: Note[], startTick = 0, lengthTick = 100): Region => ({
  id: 'region-1',
  trackId: 'track-1',
  startTick,
  lengthTick,
  notes: noteList,
});

const span = (noteList: Note[]): [number, number][] =>
  noteList.map((n) => [n.startTick, n.durationTick]);

describe('moveRegion', () => {
  it('shifts the region and its notes by the delta', () => {
    const region = makeRegion([makeNote('a', 60, 100, 20), makeNote('b', 64, 150, 10)], 100, 200);

    const moved = moveRegion(region, 50);

    expect(moved.startTick).toBe(150);
    expect(moved.lengthTick).toBe(200);
    expect(span(moved.notes)).toEqual([
      [150, 20],
      [200, 10],
    ]);
  });

  it('supports a negative delta', () => {
    const region = makeRegion([makeNote('a', 60, 200, 20)], 200, 100);

    const moved = moveRegion(region, -50);

    expect(moved.startTick).toBe(150);
    expect(span(moved.notes)).toEqual([[150, 20]]);
  });

  it('clamps the region start to 0 and shifts notes by the actual delta', () => {
    const region = makeRegion([makeNote('a', 60, 110, 20)], 100, 100);

    const moved = moveRegion(region, -250);

    expect(moved.startTick).toBe(0);
    // Requested -250, clamped to -100 (100 -> 0), so notes shift by -100.
    expect(span(moved.notes)).toEqual([[10, 20]]);
  });

  it('preserves id and trackId', () => {
    const region = makeRegion([makeNote('a', 60, 10, 5)], 10, 50);

    const moved = moveRegion(region, 5);

    expect(moved.id).toBe('region-1');
    expect(moved.trackId).toBe('track-1');
  });

  it('returns a new region without mutating the original', () => {
    const region = makeRegion([makeNote('a', 60, 100, 20)], 100, 100);
    const originalStart = region.startTick;
    const originalNoteStart = region.notes[0]!.startTick;

    const moved = moveRegion(region, 40);

    expect(moved).not.toBe(region);
    expect(region.startTick).toBe(originalStart);
    expect(region.notes[0]!.startTick).toBe(originalNoteStart);
  });

  it('returns an equivalent region for a zero delta', () => {
    const region = makeRegion([makeNote('a', 60, 100, 20)], 100, 100);

    const moved = moveRegion(region, 0);

    expect(moved).not.toBe(region);
    expect(moved.startTick).toBe(100);
    expect(span(moved.notes)).toEqual([[100, 20]]);
  });
});

describe('trimRegionStart', () => {
  it('moves the start, keeps the end and clips crossing notes', () => {
    // Region covers [0, 100). Notes: A [0, 10), B [20, 30), C [50, 80).
    const region = makeRegion(
      [makeNote('a', 60, 0, 10), makeNote('b', 62, 20, 10), makeNote('c', 64, 50, 30)],
      0,
      100,
    );

    const trimmed = trimRegionStart(region, 25);

    expect(trimmed.startTick).toBe(25);
    expect(trimmed.lengthTick).toBe(75);
    // A ended at 10 <= 25 -> dropped. B clipped to [25, 30). C untouched.
    expect(span(trimmed.notes)).toEqual([
      [25, 5],
      [50, 30],
    ]);
  });

  it('drops a note that ends exactly at the new start', () => {
    const region = makeRegion([makeNote('a', 60, 50, 20)], 0, 100); // [50, 70)

    const trimmed = trimRegionStart(region, 70);

    expect(trimmed.notes).toEqual([]);
  });

  it('keeps a note that starts exactly at the new start', () => {
    const region = makeRegion([makeNote('a', 60, 40, 20)], 0, 100); // [40, 60)

    const trimmed = trimRegionStart(region, 40);

    expect(span(trimmed.notes)).toEqual([[40, 20]]);
    expect(trimmed.lengthTick).toBe(60);
  });

  it('clamps a negative new start to 0 without changing the length', () => {
    const region = makeRegion([makeNote('a', 60, 0, 10)], 0, 100);

    const trimmed = trimRegionStart(region, -20);

    expect(trimmed.startTick).toBe(0);
    expect(trimmed.lengthTick).toBe(100);
    expect(span(trimmed.notes)).toEqual([[0, 10]]);
  });

  it('does not mutate the original region or its notes', () => {
    const region = makeRegion([makeNote('a', 60, 20, 10), makeNote('b', 62, 50, 30)], 0, 100);
    const snapshot = JSON.parse(JSON.stringify(region)) as Region;

    const trimmed = trimRegionStart(region, 25);

    expect(region).toEqual(snapshot);
    expect(trimmed).not.toBe(region);
  });
});

describe('trimRegionEnd', () => {
  it('sets the length from the new end and clips crossing notes', () => {
    // Region covers [0, 100). Notes: A [0, 10), B [20, 30), C [90, 110).
    const region = makeRegion(
      [makeNote('a', 60, 0, 10), makeNote('b', 62, 20, 10), makeNote('c', 64, 90, 20)],
      0,
      100,
    );

    const trimmed = trimRegionEnd(region, 25);

    expect(trimmed.lengthTick).toBe(25);
    // A untouched, B clipped to [20, 25), C starts past the end -> dropped.
    expect(span(trimmed.notes)).toEqual([
      [0, 10],
      [20, 5],
    ]);
  });

  it('drops notes that start at or after the new end', () => {
    const region = makeRegion([makeNote('a', 60, 50, 10)], 0, 100);

    const trimmed = trimRegionEnd(region, 50);

    expect(trimmed.notes).toEqual([]);
  });

  it('keeps notes that end exactly at the new end', () => {
    const region = makeRegion([makeNote('a', 60, 40, 10)], 0, 100); // ends at 50

    const trimmed = trimRegionEnd(region, 50);

    expect(span(trimmed.notes)).toEqual([[40, 10]]);
    expect(trimmed.lengthTick).toBe(50);
  });

  it('clamps the resulting length to at least 1 tick', () => {
    const region = makeRegion([], 100, 50);

    const trimmed = trimRegionEnd(region, 50);

    expect(trimmed.lengthTick).toBe(1);
  });

  it('does not mutate the original region or its notes', () => {
    const region = makeRegion([makeNote('a', 60, 20, 10), makeNote('b', 62, 90, 20)], 0, 100);
    const snapshot = JSON.parse(JSON.stringify(region)) as Region;

    const trimmed = trimRegionEnd(region, 60);

    expect(region).toEqual(snapshot);
    expect(trimmed).not.toBe(region);
  });
});

describe('resizeRegion', () => {
  it('sets the length to the requested value', () => {
    const region = makeRegion([makeNote('a', 60, 0, 10)], 0, 100);

    const resized = resizeRegion(region, 480);

    expect(resized.lengthTick).toBe(480);
  });

  it('keeps the start, id, trackId and notes untouched', () => {
    const region = makeRegion([makeNote('a', 60, 0, 10), makeNote('b', 62, 500, 10)], 0, 100);

    const resized = resizeRegion(region, 50);

    expect(resized.startTick).toBe(0);
    expect(resized.id).toBe('region-1');
    expect(resized.trackId).toBe('track-1');
    // Spec: resize only changes the length, even if notes fall outside it.
    expect(span(resized.notes)).toEqual([
      [0, 10],
      [500, 10],
    ]);
  });

  it('clamps the length to at least 1 tick', () => {
    const region = makeRegion([], 0, 100);

    expect(resizeRegion(region, 0).lengthTick).toBe(1);
    expect(resizeRegion(region, -50).lengthTick).toBe(1);
  });

  it('does not mutate the original region', () => {
    const region = makeRegion([makeNote('a', 60, 0, 10)], 0, 100);
    const snapshot = JSON.parse(JSON.stringify(region)) as Region;

    const resized = resizeRegion(region, 480);

    expect(region).toEqual(snapshot);
    expect(resized).not.toBe(region);
  });
});
