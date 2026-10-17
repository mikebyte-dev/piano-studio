import type { Note } from '../domain/types';

/**
 * Commit modes for a finished recording take (`__tests__/commitModes.test.ts`).
 *
 * All functions are pure: they never mutate their inputs and always return a
 * new array sorted by `startTick`, then `pitch`.
 *
 * - Overdub: keeps existing material untouched and appends the new notes.
 * - Replace: drops only the existing notes that overlap the recording range
 *   `[rangeStart, rangeEnd)` (half-open) and appends the new notes. Material
 *   outside the range is preserved; incoming notes are never filtered.
 */

/** Two intervals [a1, a1+adur) and [b1, b1+bdur) overlap iff a1 < b2 && b1 < a2. */
export function overlapsRange(note: Note, rangeStart: number, rangeEnd: number): boolean {
  const noteEnd = note.startTick + note.durationTick;
  return note.startTick < rangeEnd && rangeStart < noteEnd;
}

function sortByStartThenPitch(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
}

export function commitOverdub(existing: Note[], incoming: Note[]): Note[] {
  return sortByStartThenPitch([...existing, ...incoming]);
}

export function commitReplace(
  existing: Note[],
  incoming: Note[],
  rangeStart: number,
  rangeEnd: number,
): Note[] {
  const kept = existing.filter((note) => !overlapsRange(note, rangeStart, rangeEnd));
  return sortByStartThenPitch([...kept, ...incoming]);
}
