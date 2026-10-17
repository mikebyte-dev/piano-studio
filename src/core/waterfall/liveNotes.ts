/**
 * Pure live-note store for the waterfall (`src/components/Waterfall.tsx`).
 *
 * No React, no React Native, no timers, no I/O: the store owns the list of
 * "live" notes (pressed pitches tracked against a continuous flow clock) and
 * the flow clock itself. React simply reads {@link LiveNoteStore.getSnapshot}
 * and drives the clock from a view-owned interval.
 *
 * The contract:
 *  1. `getSnapshot()` returns the SAME object reference until the store mutates.
 *  2. A fresh store is empty at `flowTick` 0.
 *  3. `press` opens a note (`durationTick: 1`, `open: true`) at the current flow tick.
 *  4. `press` on an already-open pitch is a no-op (no new note, no notification).
 *  5. `press` on a pitch that was pressed and released opens a NEW note.
 *  6. `release` stamps `max(1, flowTickAtRelease - startTick)`.
 *  7. `release` with no open note is a no-op.
 *  8. `durationTick` has a floor of 1.
 *  9. `advance` is cumulative and notifies whenever `flowTick` changes.
 * 10. `advance` prunes CLOSED notes whose `liveNoteGeometry` reports
 *     `offscreen: true`; open notes are never pruned.
 * 11. Notifications fire once per successful mutation, never for no-ops.
 * 12. `reset` clears the notes, rewinds the clock and notifies once.
 * 13. The array handed out by `getSnapshot()` never aliases the internal state.
 */

import { liveNoteGeometry } from './noteGeometry';

/** Velocity attached to synthetic live notes (display only). */
export const LIVE_VELOCITY = 100;

/** A live note: a played pitch tracked against the continuous flow clock. */
export interface LiveNote {
  /** Stable, store-allocated identifier (unique across the store's lifetime). */
  id: string;
  /** MIDI pitch number. */
  pitch: number;
  /** MIDI velocity (display only). */
  velocity: number;
  /** Flow-clock tick at which the note began. */
  startTick: number;
  /** Held length in flow-clock ticks; grows to the real length on release. */
  durationTick: number;
  /** True while the pitch is still held; false once released. */
  open: boolean;
  /** Display color (hex). */
  color: string;
}

/** Immutable view of the store's state. */
export interface LiveNotesSnapshot {
  /** A copy of the current notes; never the store's internal array. */
  notes: readonly LiveNote[];
  /** Current value of the continuous flow clock, in ticks. */
  flowTick: number;
}

/** Called after every successful mutation. */
type Listener = () => void;

/**
 * Owns the live-note list and the flow clock. All mutators notify subscribers
 * exactly once per real change and never for a no-op.
 */
export class LiveNoteStore {
  private notes: LiveNote[] = [];
  private flowTick = 0;
  private seq = 0;
  private listeners = new Set<Listener>();
  private snapshot: LiveNotesSnapshot = { notes: [], flowTick: 0 };

  /** Returns the current snapshot, stable until the next successful mutation. */
  getSnapshot(): LiveNotesSnapshot {
    return this.snapshot;
  }

  /** Subscribes a listener; returns an idempotent unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Opens a note for `pitch` at the current flow tick. A press on an
   * already-open pitch is ignored (no note, no notification).
   */
  press(pitch: number, velocity: number, color: string): void {
    for (const note of this.notes) {
      if (note.open && note.pitch === pitch) return;
    }

    this.seq += 1;
    this.notes.push({
      id: `live-${pitch}-${this.seq}`,
      pitch,
      velocity,
      startTick: this.flowTick,
      durationTick: 1,
      open: true,
      color,
    });
    this.publish();
  }

  /**
   * Closes the open note for `pitch`, stamping its real held duration
   * (`max(1, flowTick - startTick)`). A release with no open note is ignored.
   */
  release(pitch: number): void {
    let index = -1;
    for (let i = this.notes.length - 1; i >= 0; i -= 1) {
      if (this.notes[i].open && this.notes[i].pitch === pitch) {
        index = i;
        break;
      }
    }
    if (index === -1) return;

    const note = this.notes[index];
    this.notes[index] = {
      ...note,
      open: false,
      durationTick: Math.max(1, this.flowTick - note.startTick),
    };
    this.publish();
  }

  /**
   * Advances the flow clock by `dtMs * ppq * quartersPerSecond / 1000` ticks
   * and prunes closed notes that have scrolled off the top of the view. Open
   * notes are never pruned. Notifies when the clock moves or a note is pruned.
   */
  advance(dtMs: number, ppq: number, quartersPerSecond: number, viewHeight: number): void {
    const nextTick = this.flowTick + (dtMs * ppq * quartersPerSecond) / 1000;
    const tickChanged = nextTick !== this.flowTick;
    this.flowTick = nextTick;

    const kept = this.notes.filter((note) => {
      if (note.open) return true;
      const { offscreen } = liveNoteGeometry({
        startTick: note.startTick,
        durationTick: note.durationTick,
        open: note.open,
        flowTick: this.flowTick,
        ppq,
        viewHeight,
        quartersPerSecond,
      });
      return !offscreen;
    });

    const pruned = kept.length !== this.notes.length;
    if (tickChanged || pruned) {
      this.notes = kept;
      this.publish();
    }
  }

  /** Clears the notes, rewinds the clock to 0 and notifies once. */
  reset(): void {
    this.notes = [];
    this.flowTick = 0;
    this.publish();
  }

  /** Builds a fresh snapshot from the store's own state and notifies listeners. */
  private publish(): void {
    this.snapshot = { notes: [...this.notes], flowTick: this.flowTick };
    for (const listener of this.listeners) listener();
  }
}
