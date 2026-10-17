import type { Note } from '../domain/types';

/** Raw MIDI byte sink: e.g. `(bytes) => adapter.sendMessage(bytes)`. */
export type MidiSend = (bytes: number[]) => void;

const NOTE_ON = 0x90; // channel 0
const NOTE_OFF = 0x80; // channel 0
const CC = 0xb0; // channel 0
const ALL_NOTES_OFF = 123;

/**
 * Module-wide record of the most recent send callback. `cancel()` must silence
 * the device even for an instance that never called `schedule` (see contract
 * test "still sends all-notes-off when nothing is scheduled"), so it falls back
 * to the last known sink.
 */
let lastSend: MidiSend | null = null;

/**
 * Rewrites absolute-tick notes so they play from `positionTick`, which becomes
 * the new origin (tick 0) for `schedule`. Notes that already ended are dropped;
 * a note still sounding at `positionTick` is clamped to start immediately with
 * its remaining duration. Pure: returns new note objects.
 */
export function offsetNotesForPlayback(notes: Note[], positionTick: number): Note[] {
  const result: Note[] = [];
  for (const note of notes) {
    const endTick = note.startTick + note.durationTick;
    if (endTick <= positionTick) continue; // already finished before the playhead
    const startTick = Math.max(0, note.startTick - positionTick);
    result.push({ ...note, startTick, durationTick: Math.max(1, endTick - positionTick - startTick) });
  }
  return result;
}

/**
 * Plays a set of absolute-tick notes to a raw MIDI sink using `setTimeout`.
 *
 * Contract (`__tests__/MidiOutPlayer.test.ts`):
 * - `msPerTick = 60000 / (tempo * ppq)`; a note is note-on at
 *   `startTick * msPerTick` and note-off at `(startTick + durationTick) * msPerTick`.
 * - `schedule` does not cancel previously scheduled notes; `cancel` clears every
 *   pending timer from all prior `schedule` calls.
 * - `cancel` always emits all-notes-off (CC 123, channel 0), even when idle.
 * - Messages: note-on `[0x90, pitch, velocity]`, note-off `[0x80, pitch, 0]`.
 */
export class MidiOutPlayer {
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private send: MidiSend | null = null;

  schedule(notes: Note[], tempo: number, ppq: number, send: MidiSend): void {
    this.send = send;
    lastSend = send;

    const msPerTick = 60000 / (tempo * ppq);
    for (const note of notes) {
      this.after(note.startTick * msPerTick, () => {
        send([NOTE_ON, note.pitch, note.velocity]);
      });
      this.after((note.startTick + note.durationTick) * msPerTick, () => {
        send([NOTE_OFF, note.pitch, 0]);
      });
    }
  }

  /** Clears all pending timers and emits all-notes-off on channel 0. */
  cancel(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    const send = this.send ?? lastSend;
    send?.([CC, ALL_NOTES_OFF, 0]);
  }

  private after(delayMs: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, delayMs);
    this.timers.add(timer);
  }
}
