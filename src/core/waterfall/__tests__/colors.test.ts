import { describe, expect, it } from '@jest/globals';

import { darken, lighten, shadeByPosition } from '../colors';

/**
 * Characterization tests for `src/core/waterfall/colors.ts`.
 *
 * `lighten` / `darken` are being moved VERBATIM out of
 * `src/components/Waterfall.tsx` (lines 44-75), so these tests lock the exact
 * current behavior — they are not an opinion about how it should behave:
 *
 *  - `parseHex`: `/^#([0-9a-f]{6})$/i` against `hex.trim()`; anything else
 *    (short hex, named colors, empty string, bad digits) returns null and the
 *    input is handed back UNCHANGED.
 *  - `toHex`: `Math.round` then clamp to 0..255, `toString(16).padStart(2, '0')`,
 *    so valid input always produces lowercase `#rrggbb`.
 *  - `lighten`: `c + (255 - c) * amount` per channel (no amount clamping, but
 *    `toHex` clamps the result).
 *  - `darken`: `c * (1 - amount)` per channel.
 *
 * `shadeByPosition` is NEW (not yet implemented anywhere): vertical gradient
 * helper, `t` = 0..1 from the keyboard line (darkest) to the top of the
 * waterfall (lightest), clamped; endpoints are exactly `darken(base, 0.2)` and
 * `lighten(base, 0.3)` with channel-wise linear interpolation in between.
 */

/** Splits a `#rrggbb` string into [r, g, b] for channel-level assertions. */
function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

describe('colors', () => {
  describe('lighten', () => {
    it('blends black to white at amount 1 and keeps black at amount 0', () => {
      expect(lighten('#000000', 1)).toBe('#ffffff');
      expect(lighten('#000000', 0)).toBe('#000000');
    });

    it('blends a mid grey toward white, rounding half up (Math.round)', () => {
      // 128 + (255 - 128) * 0.5 === 191.5 -> Math.round -> 192 === 0xc0.
      // The task brief listed '#bfbfbf' here; the actual implementation yields
      // '#c0c0c0', and the code wins (characterization test).
      expect(lighten('#808080', 0.5)).toBe('#c0c0c0');
    });

    it('returns invalid input unchanged', () => {
      expect(lighten('red', 0.5)).toBe('red');
      expect(lighten('#fff', 0.5)).toBe('#fff');
      expect(lighten('#gggggg', 0.5)).toBe('#gggggg');
      expect(lighten('', 0.5)).toBe('');
    });

    it('normalises valid input to lowercase', () => {
      expect(lighten('#FFFFFF', 0)).toBe('#ffffff');
      expect(lighten('#ABCDEF', 1)).toBe('#ffffff');
    });

    it('clamps channels instead of overflowing', () => {
      expect(lighten('#808080', 2)).toBe('#ffffff');
      expect(lighten('#ffffff', 1)).toBe('#ffffff');
    });
  });

  describe('darken', () => {
    it('blends white to black at amount 1 and keeps white at amount 0', () => {
      expect(darken('#ffffff', 1)).toBe('#000000');
      expect(darken('#ffffff', 0)).toBe('#ffffff');
    });

    it('blends a mid grey toward black', () => {
      // 128 * (1 - 0.5) === 64 === 0x40
      expect(darken('#808080', 0.5)).toBe('#404040');
    });

    it('returns invalid input unchanged', () => {
      expect(darken('', 0.5)).toBe('');
      expect(darken('#gggggg', 0.5)).toBe('#gggggg');
      expect(darken('#fff', 0.5)).toBe('#fff');
      expect(darken('rebeccapurple', 0.5)).toBe('rebeccapurple');
    });

    it('normalises valid input to lowercase', () => {
      expect(darken('#FFFFFF', 0.5)).toBe('#808080');
    });

    it('clamps channels instead of underflowing', () => {
      expect(darken('#808080', 2)).toBe('#000000');
      expect(darken('#000000', 1)).toBe('#000000');
    });
  });

  describe('output format', () => {
    it('always emits lowercase #rrggbb with zero-padded channels', () => {
      const sampled = [
        lighten('#000000', 0.5),
        lighten('#22c55e', 0.3),
        darken('#3b82f6', 0.2),
        darken('#050505', 0.5),
        lighten('#050505', 0),
        lighten('#0a0a0a', 0.9),
      ];

      for (const hex of sampled) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      }
      // Padding is exercised: a channel below 0x10 still prints two digits.
      expect(darken('#050505', 0.5)).toBe('#030303');
      expect(lighten('#050505', 0)).toBe('#050505');
    });

    it('tolerates surrounding whitespace on valid input (parseHex trims)', () => {
      expect(lighten('  #000000  ', 1)).toBe('#ffffff');
      expect(darken('\t#ffffff\n', 1)).toBe('#000000');
    });
  });

  describe('shadeByPosition', () => {
    const BASES = ['#22c55e', '#3b82f6'];

    // 0.2 / 0.3 are hard-coded by the contract; keep the references derived so
    // the endpoints are literally the lighten/darken calls.
    const DARK_AMOUNT = 0.2;
    const LIGHT_AMOUNT = 0.3;

    it('returns darken(base, 0.2) at t = 0', () => {
      for (const base of BASES) {
        expect(shadeByPosition(base, 0)).toBe(darken(base, DARK_AMOUNT));
      }
      expect(shadeByPosition('#22c55e', 0)).toBe('#1b9e4b');
      expect(shadeByPosition('#3b82f6', 0)).toBe('#2f68c5');
    });

    it('returns lighten(base, 0.3) at t = 1', () => {
      for (const base of BASES) {
        expect(shadeByPosition(base, 1)).toBe(lighten(base, LIGHT_AMOUNT));
      }
      expect(shadeByPosition('#22c55e', 1)).toBe('#64d68e');
      expect(shadeByPosition('#3b82f6', 1)).toBe('#76a8f9');
    });

    it('interpolates linearly between the endpoints, channel by channel', () => {
      for (const base of BASES) {
        const low = rgb(darken(base, DARK_AMOUNT));
        const high = rgb(lighten(base, LIGHT_AMOUNT));

        const mid = rgb(shadeByPosition(base, 0.5));

        for (let channel = 0; channel < 3; channel += 1) {
          expect(mid[channel]).toBeGreaterThan(low[channel]);
          expect(mid[channel]).toBeLessThan(high[channel]);
        }

        // A linear ramp is monotonic (non-decreasing) per channel; rounding may
        // flatten a step, so no strictness is asserted here.
        const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => rgb(shadeByPosition(base, t)));
        for (let channel = 0; channel < 3; channel += 1) {
          for (let i = 1; i < samples.length; i += 1) {
            expect(samples[i][channel]).toBeGreaterThanOrEqual(samples[i - 1][channel]);
          }
        }

        expect(samples[0]).toEqual(low);
        expect(samples[samples.length - 1]).toEqual(high);
      }
    });

    it('only ever emits lowercase #rrggbb for valid bases', () => {
      for (const base of [...BASES, '#22C55E']) {
        for (const t of [0, 0.1, 0.37, 0.5, 0.99, 1]) {
          expect(shadeByPosition(base, t)).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    });

    it('clamps t below 0 to the darkest shade', () => {
      for (const base of BASES) {
        expect(shadeByPosition(base, -5)).toBe(shadeByPosition(base, 0));
      }
    });

    it('clamps t above 1 to the lightest shade', () => {
      for (const base of BASES) {
        expect(shadeByPosition(base, 7)).toBe(shadeByPosition(base, 1));
      }
    });

    it('returns an invalid base unchanged', () => {
      expect(shadeByPosition('red', 0.5)).toBe('red');
      expect(shadeByPosition('#fff', 0.5)).toBe('#fff');
      expect(shadeByPosition('', 0)).toBe('');
      expect(shadeByPosition('#gggggg', 0.75)).toBe('#gggggg');
    });
  });
});
