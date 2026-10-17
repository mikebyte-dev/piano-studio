import { describe, expect, it } from '@jest/globals';

import type { Note } from '../../domain/types';
import { RecordingSession } from '../RecordingSession';

/**
 * Contract tests for `RecordingSession` (`src/core/recording/RecordingSession.ts`).
 *
 * Written from the spec, BEFORE implementation (test-first). Pure logic only.
 *
 * Conventions asserted here:
 *  - Ticks are absolute positions on the transport timeline.
 *  - `durationTick` is clamped to a minimum of 1.
 *  - A note-on with velocity 0 is a note-off (MIDI running-status convention).
 *  - Re-triggering a pitch that is still active closes the previous note at the
 *    tick of the new note-on.
 *  - `stop(endTick)` returns every collected note, sorted by `startTick`.
 *
 * SPEC AMBIGUITIES (decisions taken here, flagged for review):
 *  1. Notes are obtained through `stop()`; no other accessor is assumed.
 *  2. `id` is not specified, but `Note.id` is required by the domain type, so the
 *     tests assert it is a non-empty string and unique across notes.
 *  3. A note-off for a pitch with no active note-on is asserted to be a safe
 *     no-op (it must not throw and must not create a note).
 *  4. Calling `stop()` twice is not specified; only the first call is asserted.
 */
const options = { startTick: 0, tempo: 120, ppq: 480 };

const byStart = (notes: Note[]): Note[] => [...notes].sort((a, b) => a.startTick - b.startTick);

describe('RecordingSession', () => {
  describe('note-on / note-off', () => {
    it('creates a note from an on/off pair with the note-on velocity', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOff(60, 480);

      const notes = session.stop(960);

      expect(notes).toHaveLength(1);
      expect(notes[0]!.pitch).toBe(60);
      expect(notes[0]!.velocity).toBe(100);
      expect(notes[0]!.startTick).toBe(0);
      expect(notes[0]!.durationTick).toBe(480);
    });

    it('uses the note-on tick as startTick for notes played later', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(64, 80, 240);
      session.onNoteOff(64, 360);

      const notes = session.stop(1000);

      expect(notes[0]!.startTick).toBe(240);
      expect(notes[0]!.durationTick).toBe(120);
    });

    it('clamps a zero-length note to a duration of 1 tick', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 500);
      session.onNoteOff(60, 500);

      const notes = session.stop(1000);

      expect(notes).toHaveLength(1);
      expect(notes[0]!.durationTick).toBe(1);
    });

    it('never returns a duration below 1, even for a negative span', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 500);
      session.onNoteOff(60, 400);

      const notes = session.stop(1000);

      expect(notes.every((n: Note) => n.durationTick >= 1)).toBe(true);
    });

    it('gives every note a non-empty, unique id', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOff(60, 10);
      session.onNoteOn(62, 100, 20);
      session.onNoteOff(62, 30);

      const notes = session.stop(100);

      expect(notes).toHaveLength(2);
      for (const note of notes) {
        expect(typeof note.id).toBe('string');
        expect(note.id.length).toBeGreaterThan(0);
      }
      expect(new Set(notes.map((n: Note) => n.id)).size).toBe(2);
    });
  });

  describe('velocity 0 note-on', () => {
    it('is treated as a note-off, closing the active note', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOn(60, 0, 240);

      const notes = session.stop(960);

      expect(notes).toHaveLength(1);
      expect(notes[0]!.pitch).toBe(60);
      expect(notes[0]!.velocity).toBe(100);
      expect(notes[0]!.startTick).toBe(0);
      expect(notes[0]!.durationTick).toBe(240);
    });

    it('keeps the original velocity of the retriggered note, not the 0', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 77, 0);
      session.onNoteOn(60, 0, 100);

      const notes = session.stop(960);

      expect(notes[0]!.velocity).toBe(77);
    });
  });

  describe('multiple simultaneous notes', () => {
    it('tracks different pitches independently', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOn(64, 90, 60);
      session.onNoteOn(67, 80, 120);
      session.onNoteOff(60, 480);
      session.onNoteOff(67, 600);
      session.onNoteOff(64, 720);

      const notes = byStart(session.stop(1000));

      expect(notes).toHaveLength(3);
      expect(notes.map((n) => [n.pitch, n.startTick, n.durationTick])).toEqual([
        [60, 0, 480],
        [64, 60, 660],
        [67, 120, 480],
      ]);
    });

    it('closes the previous note when the same pitch is retriggered', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOn(60, 90, 300);
      session.onNoteOff(60, 600);

      const notes = byStart(session.stop(1000));

      expect(notes).toHaveLength(2);
      expect(notes.map((n) => [n.startTick, n.durationTick])).toEqual([
        [0, 300],
        [300, 300],
      ]);
      // First note keeps its own velocity, the retrigger keeps the new one.
      expect(notes[0]!.velocity).toBe(100);
      expect(notes[1]!.velocity).toBe(90);
    });

    it('closes the previous note when the same pitch is retriggered with velocity 0', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOn(60, 0, 240);

      const notes = session.stop(1000);

      // The 0-velocity event closes the note but never opens a new one.
      expect(notes).toHaveLength(1);
      expect(notes[0]!.durationTick).toBe(240);
    });
  });

  describe('stop', () => {
    it('flushes notes that are still active at endTick', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOn(64, 80, 240);

      const notes = byStart(session.stop(480));

      expect(notes).toHaveLength(2);
      expect(notes.map((n) => [n.pitch, n.startTick, n.durationTick])).toEqual([
        [60, 0, 480],
        [64, 240, 240],
      ]);
    });

    it('clamps a flushed zero-length note to 1 tick', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 500);

      const notes = session.stop(500);

      expect(notes).toHaveLength(1);
      expect(notes[0]!.durationTick).toBe(1);
    });

    it('returns notes closed before stop together with the flushed ones', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOff(60, 120);
      session.onNoteOn(64, 80, 200);

      const notes = byStart(session.stop(400));

      expect(notes.map((n) => [n.pitch, n.startTick, n.durationTick])).toEqual([
        [60, 0, 120],
        [64, 200, 200],
      ]);
    });

    it('returns notes sorted by startTick regardless of release order', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(72, 100, 300);
      session.onNoteOn(60, 100, 0);
      session.onNoteOn(66, 100, 150);
      session.onNoteOff(72, 400);
      session.onNoteOff(66, 250);
      session.onNoteOff(60, 100);

      const notes = session.stop(1000);

      expect(notes.map((n: Note) => n.startTick)).toEqual([0, 150, 300]);
      expect(notes.map((n: Note) => n.pitch)).toEqual([60, 66, 72]);
    });
  });

  describe('robustness', () => {
    it('returns an empty array when nothing was recorded', () => {
      const session = new RecordingSession(options);

      expect(session.stop(1000)).toEqual([]);
    });

    it('ignores a note-off for a pitch that is not active', () => {
      const session = new RecordingSession(options);

      expect(() => session.onNoteOff(60, 100)).not.toThrow();

      expect(session.stop(1000)).toEqual([]);
    });

    it('does not leak an active note when an unrelated pitch is released', () => {
      const session = new RecordingSession(options);

      session.onNoteOn(60, 100, 0);
      session.onNoteOff(64, 100);

      const notes = session.stop(200);

      expect(notes).toHaveLength(1);
      expect(notes[0]!.pitch).toBe(60);
      expect(notes[0]!.durationTick).toBe(200);
    });
  });
});
