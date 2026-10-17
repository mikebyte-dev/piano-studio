import { describe, expect, it } from '@jest/globals';

import * as tempo from '../tempo';
import { DEFAULT_QUARTERS_PER_SECOND, flowQuartersPerSecond } from '../tempo';

/**
 * Contract tests for the tempo helper (`src/core/waterfall/tempo.ts`).
 *
 * Written from the spec, BEFORE implementation (test-first). Pure and
 * display-only: the flow speed derived here never affects the recorded or
 * sounded duration of a note.
 *
 * The contract:
 *  - `flowQuartersPerSecond(tempo) === tempo / 60` for every usable tempo.
 *  - `DEFAULT_QUARTERS_PER_SECOND` is 1.5, today's hard-coded flow speed, and
 *    `flowQuartersPerSecond(90) === 1.5` reproduces it exactly.
 *  - An unusable tempo (non-finite or <= 0) falls back to
 *    `DEFAULT_QUARTERS_PER_SECOND`.
 *  - The module exports nothing else.
 */

describe('tempo', () => {
  describe('module shape', () => {
    it('exposes exactly the documented runtime exports', () => {
      expect(Object.keys(tempo).sort()).toEqual([
        'DEFAULT_QUARTERS_PER_SECOND',
        'flowQuartersPerSecond',
      ]);
    });

    it('exposes every documented member with the documented type', () => {
      expect(typeof tempo.flowQuartersPerSecond).toBe('function');
      expect(typeof tempo.DEFAULT_QUARTERS_PER_SECOND).toBe('number');
    });
  });

  describe('DEFAULT_QUARTERS_PER_SECOND', () => {
    it('is 1.5, the existing hard-coded flow speed', () => {
      expect(DEFAULT_QUARTERS_PER_SECOND).toBe(1.5);
    });
  });

  describe('flowQuartersPerSecond', () => {
    it('is tempo / 60', () => {
      expect(flowQuartersPerSecond(60)).toBe(1);
      expect(flowQuartersPerSecond(90)).toBe(1.5);
      expect(flowQuartersPerSecond(120)).toBe(2);
      expect(flowQuartersPerSecond(140)).toBe(140 / 60);
      expect(flowQuartersPerSecond(200)).toBe(200 / 60);
    });

    it('reproduces today\u2019s speed at 90 BPM', () => {
      // Deliberate continuity: 90 BPM is exactly the current 1.5 quarters/s.
      expect(flowQuartersPerSecond(90)).toBe(DEFAULT_QUARTERS_PER_SECOND);
    });

    it('scales linearly with any usable tempo', () => {
      for (const bpm of [1, 30, 60, 90, 120, 240, 1000]) {
        expect(flowQuartersPerSecond(bpm)).toBeCloseTo(bpm / 60, 12);
      }
    });

    it('falls back to DEFAULT_QUARTERS_PER_SECOND for an unusable tempo', () => {
      for (const bpm of [NaN, Infinity, -Infinity, 0, -60]) {
        expect(flowQuartersPerSecond(bpm)).toBe(DEFAULT_QUARTERS_PER_SECOND);
      }
    });
  });
});
