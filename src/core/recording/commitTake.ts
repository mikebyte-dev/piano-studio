import type { Note, Region } from '../domain/types';

/**
 * Commits a finished take into a `Region` (`__tests__/commitTake.test.ts`).
 *
 * Contract:
 * - `notes` are ABSOLUTE-tick notes captured by a `RecordingSession` started at
 *   `sessionStartTick`; the caller guarantees every `note.startTick >=
 *   sessionStartTick` (`RecordingSession` only captures at ticks >= its start).
 * - An empty take returns `null`: no region is created and no `regionIndex` is
 *   consumed.
 * - The region starts at `sessionStartTick` (NOT 0) and its `lengthTick` covers
 *   up to the end of the last note, so it ends at the last note's end; trailing
 *   silence is excluded from the region.
 * - Notes missing a `color` inherit the region `color`; notes that already have
 *   one keep it (a single take can span a mid-take color change).
 * - Pure: the input array and its notes are never mutated and a NEW notes array
 *   is returned, preserving input order (`RecordingSession.stop` already sorts
 *   by `startTick`).
 *
 * This module owns the region/note coordinate invariant shared with
 * `regionEditing.ts`: every note starts at/after the region start and ends at or
 * before `region.startTick + region.lengthTick`.
 */
export function commitTake(
  notes: Note[],
  sessionStartTick: number,
  color: string,
  regionIndex: number,
): Region | null {
  if (notes.length === 0) return null;

  let maxNoteEnd = sessionStartTick;
  const regionNotes = notes.map((note) => {
    maxNoteEnd = Math.max(maxNoteEnd, note.startTick + note.durationTick);
    return { ...note, color: note.color ?? color };
  });

  return {
    id: `region-${regionIndex}`,
    trackId: `track-${regionIndex}`,
    startTick: sessionStartTick,
    lengthTick: Math.max(1, maxNoteEnd - sessionStartTick),
    notes: regionNotes,
    color,
  };
}
