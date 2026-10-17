import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { Note } from '../../domain/types';
import { MidiOutPlayer } from '../MidiOutPlayer';

/**
 * Contract tests for `MidiOutPlayer` (`src/core/recording/MidiOutPlayer.ts`).
 *
 * Written from the spec, BEFORE implementation (test-first). Pure logic with
 * jest fake timers: fully deterministic, no real waiting, no hardware.
 *
 * Timing: `msPerTick = 60000 / (tempo * ppq)`. With tempo 120 and ppq 1000 that
 * is 0.5 ms per tick, so a note at tick 0 lasting 1000 ticks is note-on at 0 ms
 * and note-off at 500 ms. `send` receives raw MIDI bytes.
 *
 * SPEC AMBIGUITIES (decisions taken here, flagged for review):
 *  1. API shape: `new MidiOutPlayer()` (no constructor args) with `schedule` and
 *     `cancel` methods and the `send` callback injected per `schedule` call.
 *  2. A note-on at a start time of 0 ms may be delivered either synchronously or
 *     through a 0-delay timer; the tests accept both by flushing 0-delay timers
 *     with `advanceTimersByTime(0)` before asserting.
 *  3. `cancel()` always emits all-notes-off (CC 123, channel 0), even when there
 *     is nothing scheduled, and clears ALL pending timers from prior `schedule`
 *     calls.
 */
const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CC = 0xb0;
const ALL_NOTES_OFF = 123;

const makeNote = (pitch: number, startTick: number, durationTick: number, velocity = 100): Note => ({
  id: `n-${pitch}-${startTick}`,
  pitch,
  velocity,
  startTick,
  durationTick,
});

type Send = (bytes: number[]) => void;

describe('MidiOutPlayer', () => {
  let sent: number[][];
  let send: Send;

  beforeEach(() => {
    jest.useFakeTimers();
    sent = [];
    send = (bytes: number[]) => {
      sent.push(bytes);
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('schedule', () => {
    it('sends note-on at the note start and note-off after its duration', () => {
      const player = new MidiOutPlayer();

      player.schedule([makeNote(60, 0, 1000, 100)], 120, 1000, send);
      jest.advanceTimersByTime(0);

      expect(sent).toEqual([[NOTE_ON, 60, 100]]);

      jest.advanceTimersByTime(499);
      expect(sent).toEqual([[NOTE_ON, 60, 100]]);

      jest.advanceTimersByTime(1);
      expect(sent).toEqual([
        [NOTE_ON, 60, 100],
        [NOTE_OFF, 60, 0],
      ]);
    });

    it('offsets a note by its startTick', () => {
      const player = new MidiOutPlayer();

      // startTick 2000 -> 1000 ms, duration 2000 -> 1000 ms => off at 2000 ms.
      player.schedule([makeNote(64, 2000, 2000, 90)], 120, 1000, send);

      jest.advanceTimersByTime(999);
      expect(sent).toEqual([]);

      jest.advanceTimersByTime(1);
      expect(sent).toEqual([[NOTE_ON, 64, 90]]);

      jest.advanceTimersByTime(999);
      expect(sent).toEqual([[NOTE_ON, 64, 90]]);

      jest.advanceTimersByTime(1);
      expect(sent).toEqual([
        [NOTE_ON, 64, 90],
        [NOTE_OFF, 64, 0],
      ]);
    });

    it('scales timing with tempo (double tempo halves the delays)', () => {
      const player = new MidiOutPlayer();

      player.schedule([makeNote(60, 0, 1000, 100)], 240, 1000, send);
      jest.advanceTimersByTime(0);

      expect(sent).toEqual([[NOTE_ON, 60, 100]]);

      // 60000 / (240 * 1000) = 0.25 ms per tick -> off at 250 ms.
      jest.advanceTimersByTime(249);
      expect(sent).toEqual([[NOTE_ON, 60, 100]]);

      jest.advanceTimersByTime(1);
      expect(sent).toEqual([
        [NOTE_ON, 60, 100],
        [NOTE_OFF, 60, 0],
      ]);
    });

    it('scales timing with ppq', () => {
      const player = new MidiOutPlayer();

      // 60000 / (120 * 500) = 1 ms per tick -> startTick 100 -> on at 100 ms.
      player.schedule([makeNote(62, 100, 100, 80)], 120, 500, send);

      jest.advanceTimersByTime(99);
      expect(sent).toEqual([]);

      jest.advanceTimersByTime(1);
      expect(sent).toEqual([[NOTE_ON, 62, 80]]);

      jest.advanceTimersByTime(100);
      expect(sent).toEqual([
        [NOTE_ON, 62, 80],
        [NOTE_OFF, 62, 0],
      ]);
    });

    it('uses channel 0 with the note velocity on and velocity 0 off', () => {
      const player = new MidiOutPlayer();

      player.schedule([makeNote(72, 0, 500, 42)], 120, 1000, send);
      jest.advanceTimersByTime(0);

      expect(sent[0]).toEqual([0x90, 72, 42]);

      jest.advanceTimersByTime(250);
      expect(sent[1]).toEqual([0x80, 72, 0]);
    });

    it('schedules several notes independently, in time order', () => {
      const player = new MidiOutPlayer();

      // msPerTick = 0.5: A on@0 off@500; B on@500 off@1000; C on@1000 off@1500.
      player.schedule(
        [makeNote(60, 0, 1000, 100), makeNote(64, 1000, 1000, 90), makeNote(67, 2000, 1000, 80)],
        120,
        1000,
        send,
      );

      jest.advanceTimersByTime(1500);

      expect(sent).toEqual([
        [NOTE_ON, 60, 100],
        [NOTE_OFF, 60, 0],
        [NOTE_ON, 64, 90],
        [NOTE_OFF, 64, 0],
        [NOTE_ON, 67, 80],
        [NOTE_OFF, 67, 0],
      ]);
    });

    it('accepts an empty note list without sending anything', () => {
      const player = new MidiOutPlayer();

      player.schedule([], 120, 1000, send);
      jest.advanceTimersByTime(5000);

      expect(sent).toEqual([]);
    });
  });

  describe('cancel', () => {
    it('sends all-notes-off immediately (CC 123 on channel 0)', () => {
      const player = new MidiOutPlayer();
      player.schedule([makeNote(60, 0, 1000, 100)], 120, 1000, send);
      jest.advanceTimersByTime(0);
      expect(sent).toEqual([[NOTE_ON, 60, 100]]);

      player.cancel();

      expect(sent).toEqual([
        [NOTE_ON, 60, 100],
        [CC, ALL_NOTES_OFF, 0],
      ]);
    });

    it('clears pending note-off timers', () => {
      const player = new MidiOutPlayer();
      player.schedule([makeNote(60, 0, 1000, 100)], 120, 1000, send);
      jest.advanceTimersByTime(0);

      player.cancel();
      jest.advanceTimersByTime(5000);

      expect(sent).toEqual([
        [NOTE_ON, 60, 100],
        [CC, ALL_NOTES_OFF, 0],
      ]);
    });

    it('clears note-on timers that have not fired yet', () => {
      const player = new MidiOutPlayer();
      player.schedule([makeNote(64, 2000, 2000, 90)], 120, 1000, send);

      player.cancel();
      jest.advanceTimersByTime(10000);

      expect(sent).toEqual([[CC, ALL_NOTES_OFF, 0]]);
    });

    it('clears pending timers from every prior schedule call', () => {
      const player = new MidiOutPlayer();
      player.schedule([makeNote(60, 0, 1000, 100)], 120, 1000, send);
      player.schedule([makeNote(64, 4000, 1000, 90)], 120, 1000, send);
      jest.advanceTimersByTime(0);

      player.cancel();
      jest.advanceTimersByTime(10000);

      expect(sent).toEqual([
        [NOTE_ON, 60, 100],
        [CC, ALL_NOTES_OFF, 0],
      ]);
    });

    it('still sends all-notes-off when nothing is scheduled', () => {
      const player = new MidiOutPlayer();

      player.cancel();

      expect(sent).toEqual([[CC, ALL_NOTES_OFF, 0]]);
    });

    it('does not schedule further messages after cancelling', () => {
      const player = new MidiOutPlayer();
      player.schedule([makeNote(60, 0, 1000, 100)], 120, 1000, send);

      player.cancel();
      const afterCancel = sent.length;
      jest.advanceTimersByTime(60000);

      expect(sent.length).toBe(afterCancel);
    });
  });
});
