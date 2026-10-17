import type { Note } from '../domain/types';

/**
 * Captures a live take from MIDI note events on an absolute tick timeline.
 *
 * Contract (see `__tests__/RecordingSession.test.ts`):
 * - Ticks are absolute positions (the caller supplies them from the transport).
 * - `durationTick` is clamped to a minimum of 1.
 * - A note-on with velocity 0 is a note-off (MIDI running-status convention).
 * - Re-triggering a still-active pitch closes the previous note at the new
 *   note-on tick (with the previous note's velocity preserved).
 * - `stop(endTick)` flushes active notes at `endTick` and returns every note
 *   sorted by `startTick`.
 *
 * `snapshot(atTick)` is an extra read-only accessor (not part of the tested
 * contract) used by the UI to show notes *while* recording, without mutating
 * the session.
 */
export interface RecordingSessionOptions {
  startTick: number;
  tempo: number;
  ppq: number;
}

interface OpenNote {
  id: string;
  velocity: number;
  startTick: number;
}

let idCounter = 0;

function nextNoteId(): string {
  idCounter += 1;
  return `note-${idCounter}-${Date.now().toString(36)}`;
}

export class RecordingSession {
  readonly startTick: number;
  readonly tempo: number;
  readonly ppq: number;

  private readonly closed: Note[] = [];
  private readonly open = new Map<number, OpenNote>();
  private stopped = false;

  constructor(options: RecordingSessionOptions) {
    this.startTick = options.startTick;
    this.tempo = options.tempo;
    this.ppq = options.ppq;
  }

  /** True once `stop()` has been called. */
  get isStopped(): boolean {
    return this.stopped;
  }

  /** Pitches currently held down (not yet released). */
  get openPitches(): number[] {
    return Array.from(this.open.keys());
  }

  onNoteOn(pitch: number, velocity: number, tick: number): void {
    // Velocity 0 is a note-off per the MIDI running-status convention.
    if (velocity <= 0) {
      this.onNoteOff(pitch, tick);
      return;
    }
    // Re-trigger: close any note still open on this pitch first.
    const existing = this.open.get(pitch);
    if (existing) {
      this.closed.push(this.buildNote(pitch, existing, tick));
      this.open.delete(pitch);
    }
    this.open.set(pitch, { id: nextNoteId(), velocity, startTick: tick });
  }

  onNoteOff(pitch: number, tick: number): void {
    const existing = this.open.get(pitch);
    if (!existing) return; // safe no-op for an unknown pitch
    this.closed.push(this.buildNote(pitch, existing, tick));
    this.open.delete(pitch);
  }

  /** Flushes the take: active notes are closed at `endTick`, then returned. */
  stop(endTick: number): Note[] {
    for (const [pitch, open] of this.open) {
      this.closed.push(this.buildNote(pitch, open, endTick));
    }
    this.open.clear();
    this.stopped = true;
    return this.sorted();
  }

  /**
   * Read-only view of the take so far: closed notes plus any still-active notes
   * closed at `atTick`. Does not mutate the session (safe during recording).
   */
  snapshot(atTick: number): Note[] {
    const notes = [...this.closed];
    for (const [pitch, open] of this.open) {
      notes.push(this.buildNote(pitch, open, atTick));
    }
    return notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  }

  private buildNote(pitch: number, open: OpenNote, endTick: number): Note {
    return {
      id: open.id,
      pitch,
      velocity: open.velocity,
      startTick: open.startTick,
      durationTick: Math.max(1, endTick - open.startTick),
    };
  }

  private sorted(): Note[] {
    return [...this.closed].sort((a, b) => a.startTick - b.startTick);
  }
}
