import type { Note, Region } from '../domain/types';

/**
 * Region editing operations (`__tests__/regionEditing.test.ts`).
 *
 * Notes use ABSOLUTE ticks, so a region and its notes share one coordinate
 * space (a region starting at tick 100 holds notes at >= 100).
 *
 * Every function is pure: it returns a NEW region and never mutates the input,
 * preserving `id` and `trackId`.
 */

export function regionEndTick(region: Region): number {
  return region.startTick + region.lengthTick;
}

/** Shifts the region and its notes by `deltaTick`; the region start clamps at 0. */
export function moveRegion(region: Region, deltaTick: number): Region {
  const startTick = Math.max(0, region.startTick + deltaTick);
  const appliedDelta = startTick - region.startTick;
  return {
    ...region,
    startTick,
    notes: region.notes.map((note) => ({
      ...note,
      startTick: Math.max(0, note.startTick + appliedDelta),
    })),
  };
}

/** Moves the region start (keeping the end fixed), dropping/clipping notes. */
export function trimRegionStart(region: Region, newStartTick: number): Region {
  const startTick = Math.max(0, newStartTick);
  const end = regionEndTick(region);
  const lengthTick = Math.max(1, end - startTick);

  const notes: Note[] = [];
  for (const note of region.notes) {
    const noteEnd = note.startTick + note.durationTick;
    if (noteEnd <= startTick) continue; // fully before the new start -> dropped
    if (note.startTick < startTick) {
      // Crossing the new start: clip, preserving the note end.
      notes.push({ ...note, startTick, durationTick: noteEnd - startTick });
    } else {
      notes.push({ ...note });
    }
  }

  return { ...region, startTick, lengthTick, notes };
}

/** Moves the region end (keeping the start fixed), dropping/clipping notes. */
export function trimRegionEnd(region: Region, newEndTick: number): Region {
  const lengthTick = Math.max(1, newEndTick - region.startTick);

  const notes: Note[] = [];
  for (const note of region.notes) {
    if (note.startTick >= newEndTick) continue; // starts at/after the new end -> dropped
    const noteEnd = note.startTick + note.durationTick;
    if (noteEnd > newEndTick) {
      notes.push({ ...note, durationTick: newEndTick - note.startTick });
    } else {
      notes.push({ ...note });
    }
  }

  return { ...region, lengthTick, notes };
}

/** Changes only `lengthTick` (clamped to >= 1); notes are left untouched. */
export function resizeRegion(region: Region, newLengthTick: number): Region {
  return { ...region, lengthTick: Math.max(1, newLengthTick), notes: [...region.notes] };
}
