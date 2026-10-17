import { describe, expect, it } from '@jest/globals';

import { createTransport } from '../Transport';

/**
 * Contract tests for the Transport state machine (`src/core/recording/Transport.ts`).
 *
 * Written from the spec, BEFORE implementation (test-first). Pure logic only:
 * no React, no timers, no I/O.
 *
 * SPEC AMBIGUITIES (decisions taken here, flagged for review by the implementer):
 *  1. `advance(delta)` while `stopped`: the spec says "if stopped maybe still
 *     advance? allow always". These tests take the *always advances* reading.
 *  2. `setTempo(t)` / `setPpq(p)` "validate >0": the tests assert the invariant
 *     "tempo/ppq never become <= 0", tolerating EITHER throwing OR ignoring the
 *     invalid value. What they do reject is silently accepting an invalid value.
 *  3. `stop()` when already stopped: treated as a safe no-op.
 *  4. `reset()`: only `position` and `state` are asserted (spec does not say
 *     whether tempo/ppq are touched), plus the derived flags.
 *  5. Mutability: state is asserted through property reads on the object
 *     returned by `createTransport`, i.e. methods mutate in place.
 */
describe('Transport', () => {
  describe('createTransport', () => {
    it('defaults to stopped at position 0, tempo 120 and ppq 480', () => {
      const transport = createTransport({});

      expect(transport.state).toBe('stopped');
      expect(transport.position).toBe(0);
      expect(transport.tempo).toBe(120);
      expect(transport.ppq).toBe(480);
      expect(transport.isPlaying).toBe(false);
      expect(transport.isRecording).toBe(false);
    });

    it('accepts an explicit tempo and ppq', () => {
      const transport = createTransport({ tempo: 90, ppq: 960 });

      expect(transport.tempo).toBe(90);
      expect(transport.ppq).toBe(960);
      expect(transport.state).toBe('stopped');
      expect(transport.position).toBe(0);
    });

    it('fills in defaults for omitted options', () => {
      const transport = createTransport({ tempo: 90 });

      expect(transport.tempo).toBe(90);
      expect(transport.ppq).toBe(480);
    });
  });

  describe('play', () => {
    it('enters the playing state', () => {
      const transport = createTransport({});

      transport.play();

      expect(transport.state).toBe('playing');
      expect(transport.isPlaying).toBe(true);
      expect(transport.isRecording).toBe(false);
    });

    it('does not change the position', () => {
      const transport = createTransport({});
      transport.seek(240);

      transport.play();

      expect(transport.position).toBe(240);
    });

    it('is idempotent while already playing', () => {
      const transport = createTransport({});

      transport.play();
      transport.play();

      expect(transport.state).toBe('playing');
      expect(transport.isPlaying).toBe(true);
      expect(transport.isRecording).toBe(false);
    });
  });

  describe('record', () => {
    it('enters the recording state with both flags set', () => {
      const transport = createTransport({});

      transport.record();

      expect(transport.state).toBe('recording');
      expect(transport.isPlaying).toBe(true);
      expect(transport.isRecording).toBe(true);
    });

    it('can be entered directly from stopped', () => {
      const transport = createTransport({});

      transport.record();

      expect(transport.state).toBe('recording');
    });

    it('switches from playing to recording', () => {
      const transport = createTransport({});
      transport.play();

      transport.record();

      expect(transport.state).toBe('recording');
      expect(transport.isPlaying).toBe(true);
      expect(transport.isRecording).toBe(true);
    });
  });

  describe('stop', () => {
    it('returns to stopped, clearing both flags, keeping the position', () => {
      const transport = createTransport({});
      transport.play();
      transport.seek(480);

      transport.stop();

      expect(transport.state).toBe('stopped');
      expect(transport.isPlaying).toBe(false);
      expect(transport.isRecording).toBe(false);
      expect(transport.position).toBe(480);
    });

    it('stops a recording take without moving the position', () => {
      const transport = createTransport({});
      transport.record();
      transport.advance(120);

      transport.stop();

      expect(transport.state).toBe('stopped');
      expect(transport.isPlaying).toBe(false);
      expect(transport.isRecording).toBe(false);
      expect(transport.position).toBe(120);
    });

    it('is a safe no-op when already stopped', () => {
      const transport = createTransport({});
      transport.seek(96);

      expect(() => transport.stop()).not.toThrow();

      expect(transport.state).toBe('stopped');
      expect(transport.position).toBe(96);
    });
  });

  describe('seek', () => {
    it('moves the position to the given tick', () => {
      const transport = createTransport({});

      transport.seek(960);

      expect(transport.position).toBe(960);
    });

    it('clamps negative ticks to 0', () => {
      const transport = createTransport({});
      transport.seek(240);

      transport.seek(-120);

      expect(transport.position).toBe(0);
    });

    it('does not change the state', () => {
      const transport = createTransport({});
      transport.record();

      transport.seek(120);

      expect(transport.state).toBe('recording');
      expect(transport.position).toBe(120);
    });
  });

  describe('advance', () => {
    it('adds delta to the position while playing', () => {
      const transport = createTransport({});
      transport.play();

      transport.advance(120);
      transport.advance(60);

      expect(transport.position).toBe(180);
    });

    it('adds delta to the position while recording', () => {
      const transport = createTransport({});
      transport.record();

      transport.advance(480);

      expect(transport.position).toBe(480);
      expect(transport.state).toBe('recording');
    });

    // See ambiguity (1): the spec permits advancing while stopped.
    it('adds delta to the position while stopped', () => {
      const transport = createTransport({});

      transport.advance(30);

      expect(transport.position).toBe(30);
      expect(transport.state).toBe('stopped');
      expect(transport.isPlaying).toBe(false);
    });

    it('does not change the state', () => {
      const transport = createTransport({});
      transport.play();

      transport.advance(10);

      expect(transport.state).toBe('playing');
    });
  });

  describe('setTempo', () => {
    it('updates the tempo for a positive value', () => {
      const transport = createTransport({});

      transport.setTempo(144);

      expect(transport.tempo).toBe(144);
    });

    it('never accepts a non-positive tempo', () => {
      const transport = createTransport({});
      const before = transport.tempo;

      for (const invalid of [0, -1, -120]) {
        try {
          transport.setTempo(invalid);
        } catch {
          // Rejecting by throwing is an acceptable way to satisfy the spec.
        }
        expect(transport.tempo).toBe(before);
      }
    });

    it('does not accept NaN', () => {
      const transport = createTransport({});
      const before = transport.tempo;

      try {
        transport.setTempo(Number.NaN);
      } catch {
        // Acceptable.
      }

      expect(transport.tempo).toBe(before);
    });
  });

  describe('setPpq', () => {
    it('updates the ppq for a positive value', () => {
      const transport = createTransport({});

      transport.setPpq(960);

      expect(transport.ppq).toBe(960);
    });

    it('never accepts a non-positive ppq', () => {
      const transport = createTransport({});
      const before = transport.ppq;

      for (const invalid of [0, -480]) {
        try {
          transport.setPpq(invalid);
        } catch {
          // Acceptable.
        }
        expect(transport.ppq).toBe(before);
      }
    });
  });

  describe('reset', () => {
    it('returns to position 0 and the stopped state, clearing flags', () => {
      const transport = createTransport({});
      transport.record();
      transport.advance(960);

      transport.reset();

      expect(transport.position).toBe(0);
      expect(transport.state).toBe('stopped');
      expect(transport.isPlaying).toBe(false);
      expect(transport.isRecording).toBe(false);
    });
  });
});
