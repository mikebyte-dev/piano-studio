import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_PX_PER_QUARTER,
  DEFAULT_QUARTERS_PER_SECOND,
  FADE_PORTION,
  MIN_NOTE_MS,
  MIN_NOTE_PX,
  liveNoteGeometry,
} from '../noteGeometry';
import type { LiveNoteGeometryInput } from '../noteGeometry';

/**
 * Contract tests for the live-note waterfall geometry
 * (`src/core/waterfall/noteGeometry.ts`).
 *
 * Written from the spec, BEFORE implementation (test-first). Pure math only:
 * no React, no timers, no I/O.
 *
 * The contract tested here (flow-clock ticks, `ppq` pulses per quarter):
 *  1. endTick = open ? flowTick : startTick + durationTick
 *  2. bottom  = max(0, ((flowTick - endTick) / ppq) * pxPerQuarter)
 *  3. height  = max(minHeight, ((endTick - startTick) / ppq) * pxPerQuarter)
 *     where   minHeight = max(MIN_NOTE_PX, (MIN_NOTE_MS / 1000) * qps * pxPerQuarter)
 *     and     qps       = (Number.isFinite(quartersPerSecond) && quartersPerSecond > 0)
 *                           ? quartersPerSecond
 *                           : DEFAULT_QUARTERS_PER_SECOND
 *     i.e. a note is never shorter than MIN_NOTE_MS of flow time (100 ms) at the
 *     current flow speed, nor shorter than MIN_NOTE_PX, whichever is taller.
 *     A very short tap therefore cannot render as a sliver. With the documented
 *     defaults (ppq 480, pxPerQuarter 60) that floor is 9 px.
 *  4. opacity = viewHeight <= 0
 *                 ? 1
 *                 : clamp((viewHeight - bottom) / (viewHeight * FADE_PORTION), 0, 1)
 *  5. offscreen = viewHeight > 0 && bottom >= viewHeight
 *  6. invalid ppq (!Number.isFinite(ppq) || ppq <= 0) short-circuits to
 *     { bottom: 0, height: MIN_NOTE_PX, opacity: 1, offscreen: false }
 *  7. negative/non-finite `bottom` clamps to 0; `height` is never below the
 *     time-based minimum (`>= MIN_NOTE_PX`).
 *
 * A held (open) note is never pruned: while open, endTick === flowTick, so
 * bottom is always exactly 0 and it can never be offscreen, no matter how long
 * the key is held (it just grows taller than the view).
 */

type Input = LiveNoteGeometryInput;

/** Baseline input: one closed quarter note (480 ticks @ ppq 480) at the keyboard line. */
function input(overrides: Partial<Input> = {}): Input {
  return {
    startTick: 0,
    durationTick: 480,
    open: false,
    flowTick: 0,
    ppq: 480,
    viewHeight: 600,
    ...overrides,
  };
}

describe('liveNoteGeometry', () => {
  describe('constants', () => {
    it('exposes the documented defaults', () => {
      expect(MIN_NOTE_PX).toBe(4);
      expect(MIN_NOTE_MS).toBe(100);
      expect(DEFAULT_QUARTERS_PER_SECOND).toBe(1.5);
      expect(DEFAULT_PX_PER_QUARTER).toBe(60);
      expect(FADE_PORTION).toBe(0.25);
    });

    it('falls back to DEFAULT_PX_PER_QUARTER when pxPerQuarter is omitted', () => {
      const omitted = liveNoteGeometry(input({ open: true, flowTick: 480 }));
      const explicit = liveNoteGeometry(
        input({ open: true, flowTick: 480, pxPerQuarter: DEFAULT_PX_PER_QUARTER }),
      );

      expect(omitted).toEqual(explicit);
      expect(omitted.height).toBe(60);
    });
  });

  describe('open notes', () => {
    it('is never a sliver at the moment of press (time-based minimum)', () => {
      const note = liveNoteGeometry(input({ open: true, flowTick: 0, durationTick: 0 }));

      // 100 ms of flow time at the defaults (1.5 quarters/s, 60 px/quarter) === 9 px.
      expect(note.bottom).toBe(0);
      expect(note.height).toBeCloseTo(9, 10);
      expect(note.opacity).toBe(1);
      expect(note.offscreen).toBe(false);
    });

    it('rests on the keyboard line (bottom === 0) while held', () => {
      expect(liveNoteGeometry(input({ open: true, flowTick: 0 })).bottom).toBe(0);
      expect(liveNoteGeometry(input({ open: true, flowTick: 480 })).bottom).toBe(0);
      expect(liveNoteGeometry(input({ open: true, flowTick: 2400 })).bottom).toBe(0);
      expect(liveNoteGeometry(input({ open: true, flowTick: 4800 })).bottom).toBe(0);
    });

    it('grows one quarter note (pxPerQuarter) per quarter held', () => {
      const note = liveNoteGeometry(input({ open: true, flowTick: 480 }));

      expect(note.bottom).toBe(0);
      expect(note.height).toBe(60);
      expect(note.opacity).toBe(1);
      expect(note.offscreen).toBe(false);
    });

    it('keeps growing for a long hold', () => {
      const note = liveNoteGeometry(input({ open: true, flowTick: 2400 }));

      expect(note.height).toBe(300);
      expect(note.bottom).toBe(0);
    });

    it('is never pruned while held, even when taller than the view', () => {
      const note = liveNoteGeometry(input({ open: true, flowTick: 4800 }));

      expect(note.bottom).toBe(0);
      expect(note.height).toBe(600);
      expect(note.offscreen).toBe(false);
    });

    it('is never pruned however long the key stays down', () => {
      const note = liveNoteGeometry(input({ open: true, flowTick: 48000 }));

      expect(note.bottom).toBe(0);
      expect(note.height).toBe(6000);
      expect(note.offscreen).toBe(false);
    });

    it('ignores durationTick until the note is closed', () => {
      const note = liveNoteGeometry(input({ open: true, flowTick: 480, durationTick: 99999 }));

      expect(note.height).toBe(60);
      expect(note.bottom).toBe(0);
    });

    it('honours a custom pxPerQuarter', () => {
      const note = liveNoteGeometry(input({ open: true, flowTick: 480, pxPerQuarter: 48 }));

      expect(note.bottom).toBe(0);
      expect(note.height).toBe(48);
    });
  });

  describe('closed notes', () => {
    it('has not moved at the exact release tick', () => {
      const note = liveNoteGeometry(input({ open: false, durationTick: 480, flowTick: 480 }));

      expect(note.bottom).toBe(0);
      expect(note.height).toBe(60);
      expect(note.offscreen).toBe(false);
    });

    it('rises with the flow clock once released', () => {
      const note = liveNoteGeometry(input({ open: false, durationTick: 480, flowTick: 1440 }));

      expect(note.bottom).toBe(120);
      expect(note.height).toBe(60);
      expect(note.opacity).toBe(1);
      expect(note.offscreen).toBe(false);
    });

    it('uses durationTick for the length once closed', () => {
      const note = liveNoteGeometry(
        input({ open: false, startTick: 0, durationTick: 960, flowTick: 1920 }),
      );

      expect(note.bottom).toBe(120);
      expect(note.height).toBe(120);
    });

    it('never renders shorter than the time-based minimum for a tiny duration', () => {
      const note = liveNoteGeometry(input({ open: false, durationTick: 1, flowTick: 480 }));

      expect(note.height).toBeCloseTo(9, 10);
      expect(note.bottom).toBeCloseTo(59.875, 6);
    });

    it('never renders shorter than the time-based minimum for a zero duration', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 0, startTick: 0, flowTick: 0 }),
      );

      expect(note.height).toBeCloseTo(9, 10);
      expect(note.bottom).toBe(0);
    });

    it('honours a custom pxPerQuarter', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 1440, pxPerQuarter: 48 }),
      );

      expect(note.bottom).toBe(96);
      expect(note.height).toBe(48);
    });

    it('clamps a negative offset to bottom 0', () => {
      // A closed note whose release lies ahead of the flow clock: the raw
      // bottom would be ((480 - 960) / 480) * 60 === -60.
      const note = liveNoteGeometry(
        input({ open: false, startTick: 0, durationTick: 960, flowTick: 480 }),
      );

      expect(note.bottom).toBe(0);
      expect(note.height).toBe(120);
    });
  });

  describe('minimum length (time-based floor)', () => {
    // Documented defaults: ppq 480, pxPerQuarter 60, quartersPerSecond 1.5, so
    // 100 ms of flow time is 0.1 * 1.5 * 60 === 9 px — above MIN_NOTE_PX (4).
    const DEFAULT_MIN_HEIGHT = 9;

    it('defaults quartersPerSecond to DEFAULT_QUARTERS_PER_SECOND', () => {
      const omitted = liveNoteGeometry(input({ open: false, durationTick: 1, flowTick: 480 }));
      const explicit = liveNoteGeometry(
        input({
          open: false,
          durationTick: 1,
          flowTick: 480,
          quartersPerSecond: DEFAULT_QUARTERS_PER_SECOND,
        }),
      );

      expect(omitted.height).toBeCloseTo(DEFAULT_MIN_HEIGHT, 10);
      expect(omitted).toEqual(explicit);
    });

    it('never lets a held note be a sliver the instant it appears', () => {
      const atPress = liveNoteGeometry(input({ open: true, startTick: 0, flowTick: 0 }));

      expect(atPress.height).toBeCloseTo(DEFAULT_MIN_HEIGHT, 10);
      expect(atPress.bottom).toBe(0);
      expect(atPress.offscreen).toBe(false);
    });

    it('leaves lengths above the minimum untouched', () => {
      const quarter = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 480 }),
      ); // raw 60 px > 9
      const barelyUnder = liveNoteGeometry(
        input({ open: false, durationTick: 10, flowTick: 480 }),
      ); // raw 1.25 px -> clamped up to the floor

      expect(quarter.height).toBe(60);
      expect(barelyUnder.height).toBeCloseTo(DEFAULT_MIN_HEIGHT, 10);
    });

    it('scales the minimum with a custom pxPerQuarter', () => {
      const tiny = liveNoteGeometry(
        input({ open: false, durationTick: 1, flowTick: 480, pxPerQuarter: 48 }),
      ); // 0.1 * 1.5 * 48 === 7.2 px
      const quarter = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 480, pxPerQuarter: 48 }),
      ); // raw 48 px, unaffected

      expect(tiny.height).toBeCloseTo(7.2, 10);
      expect(quarter.height).toBe(48);
    });

    it('scales the minimum with a custom quartersPerSecond', () => {
      const tiny = liveNoteGeometry(
        input({ open: false, durationTick: 1, flowTick: 480, quartersPerSecond: 3 }),
      ); // 0.1 * 3 * 60 === 18 px

      expect(tiny.height).toBeCloseTo(18, 10);
    });

    it('falls back to MIN_NOTE_PX when the time minimum is below the absolute floor', () => {
      const tiny = liveNoteGeometry(
        input({ open: false, durationTick: 1, flowTick: 480, pxPerQuarter: 10 }),
      ); // time minimum 1.5 px < MIN_NOTE_PX

      expect(tiny.height).toBe(MIN_NOTE_PX);
    });

    it('falls back to DEFAULT_QUARTERS_PER_SECOND for unusable values', () => {
      for (const quartersPerSecond of [0, -3, NaN, Infinity]) {
        const tiny = liveNoteGeometry(
          input({ open: false, durationTick: 1, flowTick: 480, quartersPerSecond }),
        );

        expect(tiny.height).toBeCloseTo(DEFAULT_MIN_HEIGHT, 10);
      }
    });

    it('clamps up to the minimum until the raw length passes it', () => {
      // At ppq 480, 100 ms of flow time is exactly 72 ticks (1.5 * 480 * 0.1).
      const below = liveNoteGeometry(
        input({ open: false, startTick: 0, durationTick: 71, flowTick: 480 }),
      ); // raw 8.875 px
      const at = liveNoteGeometry(
        input({ open: false, startTick: 0, durationTick: 72, flowTick: 480 }),
      ); // raw 9 px, exactly the minimum
      const above = liveNoteGeometry(
        input({ open: false, startTick: 0, durationTick: 74, flowTick: 480 }),
      ); // raw 9.25 px

      expect(at.height).toBeCloseTo(DEFAULT_MIN_HEIGHT, 10);
      expect(below.height).toBe(at.height); // still clamped to the same floor
      expect(above.height).toBeCloseTo(9.25, 10);
    });
  });

  describe('fading', () => {
    // viewHeight 600, FADE_PORTION 0.25 -> the fade band is the top 150px.
    it('is fully opaque below the fade band', () => {
      const atKeyboardLine = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 1440 }),
      ); // bottom 120
      const atFadeBandStart = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 4080 }),
      ); // bottom 450

      expect(atKeyboardLine.bottom).toBe(120);
      expect(atKeyboardLine.opacity).toBe(1);
      expect(atFadeBandStart.bottom).toBe(450);
      expect(atFadeBandStart.opacity).toBe(1);
    });

    it('ramps linearly across the fade band', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 4680 }),
      ); // bottom 525 -> halfway up the 150px band

      expect(note.bottom).toBe(525);
      expect(note.opacity).toBe(0.5);
    });

    it('reaches opacity 0 at the top of the view', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 5280 }),
      ); // bottom 600 === viewHeight

      expect(note.bottom).toBe(600);
      expect(note.opacity).toBe(0);
    });

    it('never exceeds 1 nor drops below 0', () => {
      for (const flowTick of [0, 480, 4800, 5280, 6000]) {
        const { opacity } = liveNoteGeometry(
          input({ open: false, durationTick: 480, flowTick }),
        );

        expect(Number.isFinite(opacity)).toBe(true);
        expect(opacity).toBeGreaterThanOrEqual(0);
        expect(opacity).toBeLessThanOrEqual(1);
      }
    });

    it('is fully opaque while the view has no measurable height yet', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 5280, viewHeight: 0 }),
      );

      expect(note.opacity).toBe(1);
    });
  });

  describe('pruning', () => {
    it('is offscreen once its bottom reaches the top of the view', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 5280 }),
      );

      expect(note.bottom).toBe(600);
      expect(note.offscreen).toBe(true);
    });

    it('is not offscreen one tick before reaching the top', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 5279 }),
      );

      expect(note.bottom).toBeCloseTo(599.875, 6);
      expect(note.bottom).toBeLessThan(600);
      expect(note.offscreen).toBe(false);
      expect(note.opacity).toBeGreaterThan(0);
    });

    it('never prunes a note that is still visible mid-view', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 4320 }),
      ); // bottom 480

      expect(note.bottom).toBe(480);
      expect(note.offscreen).toBe(false);
      expect(note.opacity).toBeGreaterThan(0);
    });

    it('never prunes a held note, whatever the flow clock says', () => {
      for (const flowTick of [4800, 48000, 480000]) {
        const note = liveNoteGeometry(input({ open: true, flowTick }));

        expect(note.bottom).toBe(0);
        expect(note.offscreen).toBe(false);
      }
    });

    it('never prunes while the view has no measurable height', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 5280, viewHeight: 0 }),
      );

      expect(note.bottom).toBe(600);
      expect(note.offscreen).toBe(false);
    });
  });

  describe('guards', () => {
    const guarded = { bottom: 0, height: MIN_NOTE_PX, opacity: 1, offscreen: false };

    it('short-circuits on ppq 0', () => {
      expect(
        liveNoteGeometry(input({ open: true, flowTick: 480, ppq: 0, viewHeight: 0 })),
      ).toEqual(guarded);
    });

    it('short-circuits on a negative ppq', () => {
      expect(
        liveNoteGeometry(input({ open: false, durationTick: 480, flowTick: 4800, ppq: -480 })),
      ).toEqual(guarded);
    });

    it('short-circuits on a NaN ppq', () => {
      expect(
        liveNoteGeometry(input({ open: false, durationTick: 480, flowTick: 4800, ppq: NaN })),
      ).toEqual(guarded);
    });

    it('short-circuits on a non-finite ppq', () => {
      expect(
        liveNoteGeometry(input({ open: true, flowTick: 480, ppq: Infinity })),
      ).toEqual(guarded);
      expect(
        liveNoteGeometry(input({ open: true, flowTick: 480, ppq: -Infinity })),
      ).toEqual(guarded);
    });

    it('still computes from ticks when the view has no height (valid ppq)', () => {
      const closed = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 1440, viewHeight: 0 }),
      );
      const open = liveNoteGeometry(
        input({ open: true, flowTick: 480, viewHeight: 0 }),
      );

      expect(closed).toEqual({ bottom: 120, height: 60, opacity: 1, offscreen: false });
      expect(open).toEqual({ bottom: 0, height: 60, opacity: 1, offscreen: false });
    });

    it('treats a negative viewHeight as "no measurable height"', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: 5280, viewHeight: -100 }),
      );

      expect(note.opacity).toBe(1);
      expect(note.offscreen).toBe(false);
    });

    it('clamps a non-finite bottom to 0', () => {
      const note = liveNoteGeometry(
        input({ open: false, durationTick: 480, flowTick: NaN }),
      );

      expect(note.bottom).toBe(0);
      expect(Number.isFinite(note.bottom)).toBe(true);
    });

    it('is pure: repeated calls agree and the input object is not mutated', () => {
      const args = input({
        open: false,
        durationTick: 1,
        flowTick: 1440,
        pxPerQuarter: 48,
        quartersPerSecond: 2,
      });
      const snapshot = { ...args };

      const first = liveNoteGeometry(args);
      const second = liveNoteGeometry(args);

      expect(second).toEqual(first);
      expect(args).toEqual(snapshot);
    });
  });
});
