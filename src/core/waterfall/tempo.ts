/**
 * Pure tempo helper for the waterfall flow clock (`src/components/Waterfall.tsx`).
 *
 * Converts a musical tempo (BPM) into the flow-clock speed in quarter notes per
 * second. Display-only: the derived speed never affects the recorded or sounded
 * duration of a note.
 *
 * The contract:
 *  - `flowQuartersPerSecond(tempo) === tempo / 60` for every usable tempo.
 *  - An unusable tempo (non-finite or `<= 0`) falls back to
 *    {@link DEFAULT_QUARTERS_PER_SECOND}.
 */

/** Today's hard-coded flow speed: the fallback for an unusable tempo. */
export const DEFAULT_QUARTERS_PER_SECOND = 1.5;

/**
 * Converts a tempo in BPM to quarter notes per second. Non-finite or `<= 0`
 * tempos fall back to {@link DEFAULT_QUARTERS_PER_SECOND}.
 */
export function flowQuartersPerSecond(tempo: number): number {
  return Number.isFinite(tempo) && tempo > 0 ? tempo / 60 : DEFAULT_QUARTERS_PER_SECOND;
}
