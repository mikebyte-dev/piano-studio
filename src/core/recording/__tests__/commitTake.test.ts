import { describe, expect, it } from '@jest/globals';

import type { Note, Region } from '../../domain/types';
import { commitTake } from '../commitTake';

/**
 * Contract tests for `commitTake` (`src/core/recording/commitTake.ts`).
 *
 * Written test-first. The invariant (see `regionEditing.ts`): notes use
 * ABSOLUTE ticks and a region shares that coordinate space — a region that
 * starts at tick S holds only notes at >= S, and every note ends at or before
 * S + lengthTick. The old inline commit in `useStudio` violated this with
 * `startTick: 0`.
 *
 * Decisions pinned here (flagged for review):
 *  1. `startTick` is `sessionStartTick`, NOT 0.
 *  2. Empty take -> `null` (no region, no regionIndex consumed).
 *  3. `lengthTick = max(1, maxNoteEnd - sessionStartTick)`: the region ends at
 *     the last note's end; trailing silence is not part of the region (the
 *     pure signature takes no rangeEnd — deliberate change from the old
 *     commit, which padded to the recording end).
 *  4. Notes without a `color` inherit the region color; notes that already
 *     have one keep it. Inputs are never mutated; input order is preserved
 *     (`RecordingSession.stop` already sorts by startTick).
 *  5. Caller guarantee: every note has `startTick >= sessionStartTick`
 *     (`RecordingSession` captures at transport ticks >= its startTick).
 */

const makeNote = (
  id: string,
  pitch: number,
  startTick: number,
  durationTick: number,
  velocity = 100,
  color?: string,
): Note => ({ id, pitch, velocity, startTick, durationTick, ...(color ? { color } : {}) });

const must = (region: Region | null): Region => {
  if (region === null) throw new Error('expected a region, got null');
  return region;
};

describe('commitTake', () => {
  it('returns null for an empty take', () => {
    expect(commitTake([], 0, '#22c55e', 1)).toBeNull();
  });

  it('starts the region at sessionStartTick, not at 0', () => {
    const notes = [makeNote('a', 60, 480, 120)];

    const region = must(commitTake(notes, 480, '#3b82f6', 1));

    expect(region.startTick).toBe(480);
  });

  it('derives lengthTick from the last note end relative to the session start', () => {
    const notes = [makeNote('a', 60, 480, 120), makeNote('b', 64, 540, 60)];

    const region = must(commitTake(notes, 480, '#3b82f6', 1));

    // max note end = max(600, 600) = 600 -> 600 - 480 = 120
    expect(region.lengthTick).toBe(120);
  });

  it('clamps lengthTick to at least 1', () => {
    const notes = [makeNote('a', 60, 100, 0)];

    const region = must(commitTake(notes, 100, '#22c55e', 1));

    expect(region.lengthTick).toBe(1);
  });

  it('builds id and trackId from regionIndex', () => {
    const notes = [makeNote('a', 60, 0, 10)];

    const region = must(commitTake(notes, 0, '#22c55e', 7));

    expect(region.id).toBe('region-7');
    expect(region.trackId).toBe('track-7');
  });

  it('stamps the region color on notes that have none', () => {
    const notes = [makeNote('a', 60, 0, 10)];

    const region = must(commitTake(notes, 0, '#a855f7', 1));

    expect(region.color).toBe('#a855f7');
    expect(region.notes[0].color).toBe('#a855f7');
  });

  it('keeps a color already present on a note', () => {
    const notes = [makeNote('a', 60, 0, 10, 100, '#ef4444')];

    const region = must(commitTake(notes, 0, '#a855f7', 1));

    expect(region.notes[0].color).toBe('#ef4444');
  });

  it('preserves the region/note coordinate invariant', () => {
    const notes = [makeNote('a', 60, 960, 120), makeNote('b', 64, 1020, 240)];

    const region = must(commitTake(notes, 960, '#22c55e', 2));

    for (const note of region.notes) {
      expect(note.startTick).toBeGreaterThanOrEqual(region.startTick);
      expect(note.startTick + note.durationTick).toBeLessThanOrEqual(
        region.startTick + region.lengthTick,
      );
    }
  });

  it('does not mutate its inputs', () => {
    const notes = [makeNote('a', 60, 0, 10), makeNote('b', 64, 20, 10, 100, '#ef4444')];
    const snapshot = JSON.parse(JSON.stringify(notes)) as Note[];

    commitTake(notes, 0, '#22c55e', 1);

    expect(notes).toEqual(snapshot);
  });

  it('returns a new notes array (no aliasing of the input)', () => {
    const notes = [makeNote('a', 60, 0, 10)];

    const region = must(commitTake(notes, 0, '#22c55e', 1));

    expect(region.notes).not.toBe(notes);
  });
});
