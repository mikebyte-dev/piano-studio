/**
 * Pure geometry for the live-note waterfall (`src/components/Waterfall.tsx`).
 *
 * No React, no timers, no I/O: given a flow-clock tick, `ppq` pulses per
 * quarter and the px size of a quarter note, it returns where a single note
 * should be drawn.
 *
 * The contract (flow-clock ticks, `ppq` pulses per quarter):
 *  1. endTick = open ? flowTick : startTick + durationTick
 *  2. bottom  = max(0, ((flowTick - endTick) / ppq) * pxPerQuarter)
 *  3. height  = max(MIN_NOTE_PX, ((endTick - startTick) / ppq) * pxPerQuarter)
 *  4. opacity = viewHeight <= 0
 *                 ? 1
 *                 : clamp((viewHeight - bottom) / (viewHeight * FADE_PORTION), 0, 1)
 *  5. offscreen = viewHeight > 0 && bottom >= viewHeight
 *  6. invalid ppq (!Number.isFinite(ppq) || ppq <= 0) short-circuits to
 *     { bottom: 0, height: MIN_NOTE_PX, opacity: 1, offscreen: false }
 *  7. negative/non-finite `bottom` clamps to 0; `height` is never below MIN_NOTE_PX.
 *
 * A held (open) note is never pruned: while open, endTick === flowTick, so
 * bottom is always exactly 0 and it can never be offscreen, no matter how long
 * the key is held (it just grows taller than the view).
 */

/** Smallest on-screen length for a note, in px. */
export const MIN_NOTE_PX = 4;

/** Height of one quarter note in px when the caller does not override it. */
export const DEFAULT_PX_PER_QUARTER = 60;

/** Portion of the view height over which a note fades out at the top (0..1). */
export const FADE_PORTION = 0.25;

/** Inputs for {@link liveNoteGeometry}. */
export interface LiveNoteGeometryInput {
  /** Tick at which the note began (on the flow clock). */
  startTick: number;
  /** Held length in ticks; ignored while `open` is true. */
  durationTick: number;
  /** True while the key is still held (note is anchored to the keyboard). */
  open: boolean;
  /** Current value of the continuous flow clock, in ticks. */
  flowTick: number;
  /** Pulses (ticks) per quarter note. Must be finite and > 0. */
  ppq: number;
  /** Height of the view in px; `<= 0` (or non-finite) means "not measured yet". */
  viewHeight: number;
  /** Height of one quarter note in px. Defaults to {@link DEFAULT_PX_PER_QUARTER}. */
  pxPerQuarter?: number;
}

/** Computed on-screen placement of a single note. */
export interface LiveNoteGeometry {
  /** Distance from the bottom (keyboard) edge, in px; always >= 0. */
  bottom: number;
  /** Rendered length in px; always >= {@link MIN_NOTE_PX}. */
  height: number;
  /** Opacity 0..1, ramping across the top {@link FADE_PORTION} of the view. */
  opacity: number;
  /** True once the note has scrolled past the top of the view (safe to prune). */
  offscreen: boolean;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Computes the on-screen geometry for one live note. Pure: the input object is
 * never mutated.
 */
export function liveNoteGeometry(input: LiveNoteGeometryInput): LiveNoteGeometry {
  const { startTick, durationTick, open, flowTick, ppq, viewHeight } = input;
  const pxPerQuarter = input.pxPerQuarter ?? DEFAULT_PX_PER_QUARTER;

  // Guard: an unusable time base cannot produce meaningful geometry. Returning
  // a stable zero-length-at-the-keyboard note also stops a non-finite flowTick
  // from leaking `NaN` into the layout.
  if (
    !Number.isFinite(ppq) ||
    ppq <= 0 ||
    !Number.isFinite(flowTick) ||
    !Number.isFinite(startTick) ||
    !Number.isFinite(durationTick)
  ) {
    return { bottom: 0, height: MIN_NOTE_PX, opacity: 1, offscreen: false };
  }

  const endTick = open ? flowTick : startTick + durationTick;

  const rawBottom = ((flowTick - endTick) / ppq) * pxPerQuarter;
  const bottom = rawBottom > 0 ? rawBottom : 0;

  const rawHeight = ((endTick - startTick) / ppq) * pxPerQuarter;
  const height = rawHeight > MIN_NOTE_PX ? rawHeight : MIN_NOTE_PX;

  const hasView = viewHeight > 0;
  const opacity = hasView
    ? clamp01((viewHeight - bottom) / (viewHeight * FADE_PORTION))
    : 1;
  const offscreen = hasView && bottom >= viewHeight;

  return { bottom, height, opacity, offscreen };
}
