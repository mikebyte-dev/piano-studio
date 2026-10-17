import { describe, expect, it } from '@jest/globals';

import * as liveNotesModule from '../liveNotes';
import { LIVE_VELOCITY, LiveNoteStore } from '../liveNotes';
import type { LiveNote, LiveNotesSnapshot } from '../liveNotes';
import { liveNoteGeometry } from '../noteGeometry';

/**
 * Contract tests for the live-note store (`src/core/waterfall/liveNotes.ts`).
 *
 * Written from the spec, BEFORE implementation (test-first). The store is pure:
 * no React, no React Native, no timers, no I/O — this file imports it in a plain
 * Node jest environment, which is itself part of the contract.
 *
 * The contract:
 *  1. `getSnapshot()` returns the SAME object reference until the store mutates.
 *  2. A fresh store is empty at `flowTick` 0.
 *  3. `press` opens a note (`durationTick: 1`, `open: true`) at the current flow tick.
 *  4. `press` on an already-open pitch is a no-op (no new note, no notification).
 *  5. `press` on a pitch that was pressed and released opens a NEW note.
 *  6. `release` stamps `max(1, flowTickAtRelease - startTick)`;
 *     `advance` moves `flowTick` by `dtMs * ppq * quartersPerSecond / 1000`.
 *  7. `release` with no open note is a no-op.
 *  8. `durationTick` has a floor of 1.
 *  9. `advance` is cumulative and notifies whenever `flowTick` changes.
 * 10. `advance` prunes CLOSED notes whose `liveNoteGeometry` reports
 *     `offscreen: true`; open notes are never pruned.
 * 11. Pruning removes only the offscreen closed notes.
 * 12. Notifications fire once per successful mutation, never for no-ops.
 * 13. Multiple subscribers are independent.
 * 14. `reset` clears the notes, rewinds the clock and notifies once.
 * 15. The runtime exports are exactly `LIVE_VELOCITY` and `LiveNoteStore`.
 * 16. Mutating the array handed out by `getSnapshot()` cannot corrupt the
 *     store's internal state.
 */

const PPQ = 480;
const QUARTERS_PER_SECOND = 2;
const VIEW_HEIGHT = 400;

/** Subscribes a call counter to `store`; `seen.count` tracks notifications. */
function counter(store: LiveNoteStore): {
  seen: { count: number };
  unsubscribe: () => void;
} {
  const seen = { count: 0 };
  const unsubscribe = store.subscribe(() => {
    seen.count += 1;
  });
  return { seen, unsubscribe };
}

/** Reports whether the real `liveNoteGeometry` would prune `note` at `flowTick`. */
function isOffscreen(note: LiveNote, flowTick: number): boolean {
  return liveNoteGeometry({
    startTick: note.startTick,
    durationTick: note.durationTick,
    open: note.open,
    flowTick,
    ppq: PPQ,
    viewHeight: VIEW_HEIGHT,
    quartersPerSecond: QUARTERS_PER_SECOND,
  }).offscreen;
}

/** A plausible note the store never created, used to probe snapshot purity. */
function fakeNote(): LiveNote {
  return {
    id: 'fake',
    pitch: 99,
    velocity: 1,
    startTick: 0,
    durationTick: 1,
    open: false,
    color: '#000000',
  };
}

describe('liveNotes', () => {
  describe('module shape', () => {
    it('exposes exactly the documented runtime exports', () => {
      // The two interfaces are erased at runtime, so only the class and the
      // constant remain.
      expect(Object.keys(liveNotesModule).sort()).toEqual(['LIVE_VELOCITY', 'LiveNoteStore']);
    });

    it('exposes every documented member with the documented type', () => {
      expect(typeof liveNotesModule.LiveNoteStore).toBe('function');
      expect(typeof liveNotesModule.LIVE_VELOCITY).toBe('number');
      expect(Number.isFinite(LIVE_VELOCITY)).toBe(true);
      expect(LIVE_VELOCITY).toBeGreaterThan(0);
    });
  });

  describe('fresh store', () => {
    it('starts empty at flowTick 0', () => {
      const snapshot: LiveNotesSnapshot = new LiveNoteStore().getSnapshot();

      expect(snapshot.notes).toEqual([]);
      expect(snapshot.flowTick).toBe(0);
    });
  });

  describe('snapshot identity', () => {
    it('returns the same snapshot reference until the store mutates', () => {
      const store = new LiveNoteStore();
      const first = store.getSnapshot();

      expect(store.getSnapshot()).toBe(first);
      expect(store.getSnapshot()).toBe(first);
    });

    it('publishes a new reference after a press, a release and an advance', () => {
      const store = new LiveNoteStore();

      const atPress = store.getSnapshot();
      store.press(60, 90, '#ff0000');
      const afterPress = store.getSnapshot();
      expect(afterPress).not.toBe(atPress);
      expect(store.getSnapshot()).toBe(afterPress);

      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);
      const afterAdvance = store.getSnapshot();
      expect(afterAdvance).not.toBe(afterPress);
      expect(store.getSnapshot()).toBe(afterAdvance);

      store.release(60);
      const afterRelease = store.getSnapshot();
      expect(afterRelease).not.toBe(afterAdvance);
      expect(store.getSnapshot()).toBe(afterRelease);
    });

    it('keeps the snapshot reference across a no-op press', () => {
      // Rule 1: identity is stable "until a mutation happens". An ignored press
      // is not a mutation, so the reference must not change.
      const store = new LiveNoteStore();

      store.press(60, 90, '#ff0000');
      const before = store.getSnapshot();
      store.press(60, 90, '#ff0000');

      expect(store.getSnapshot()).toBe(before);
    });
  });

  describe('press', () => {
    it('opens a note anchored at the current flow tick', () => {
      const store = new LiveNoteStore();
      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT); // flowTick 96

      store.press(60, 90, '#ff0000');

      const { notes } = store.getSnapshot();
      expect(notes).toHaveLength(1);
      const [note] = notes;
      expect(note.pitch).toBe(60);
      expect(note.velocity).toBe(90);
      expect(note.startTick).toBe(96);
      expect(note.durationTick).toBe(1);
      expect(note.open).toBe(true);
      expect(note.color).toBe('#ff0000');
      expect(typeof note.id).toBe('string');
      expect(note.id.length).toBeGreaterThan(0);
    });

    it('opens a note at flow tick 0 on a fresh store', () => {
      const store = new LiveNoteStore();

      store.press(60, 90, '#ff0000');

      expect(store.getSnapshot().notes[0].startTick).toBe(0);
    });

    it('ignores a press on an already-open pitch', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ff0000');
      const before = store.getSnapshot().notes[0];
      const { seen } = counter(store);

      store.press(60, 90, '#ffffff');

      const { notes } = store.getSnapshot();
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe(before.id);
      expect(notes[0].startTick).toBe(before.startTick);
      expect(notes[0].color).toBe(before.color);
      expect(seen.count).toBe(0);
    });

    it('opens a new note for a pitch that was pressed and already released', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ff0000');
      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT); // flowTick 96
      store.release(60);

      const flowTick = store.getSnapshot().flowTick;
      store.press(60, 90, '#ff0000');

      const { notes } = store.getSnapshot();
      expect(notes).toHaveLength(2);
      expect(notes[0].pitch).toBe(60);
      expect(notes[0].open).toBe(false);
      expect(notes[1].pitch).toBe(60);
      expect(notes[1].open).toBe(true);
      expect(notes[1].startTick).toBe(flowTick);
      expect(notes[1].id).not.toBe(notes[0].id);
    });
  });

  describe('release', () => {
    it('stamps the real held duration and closes the note', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ff0000');
      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT); // +96 ticks
      const { seen } = counter(store);

      store.release(60);

      const { notes } = store.getSnapshot();
      expect(notes).toHaveLength(1);
      expect(notes[0].open).toBe(false);
      expect(notes[0].durationTick).toBe(96); // max(1, 96 - 0)
      expect(seen.count).toBe(1);
    });

    it('ignores a release with no open note', () => {
      const store = new LiveNoteStore();
      const { seen } = counter(store);

      store.release(60);

      expect(store.getSnapshot().notes).toEqual([]);
      expect(seen.count).toBe(0);
    });

    it('ignores a repeated release of the same pitch', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ff0000');
      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);
      store.release(60);
      const closed = store.getSnapshot().notes[0].durationTick;
      const { seen } = counter(store);

      store.release(60);

      const { notes } = store.getSnapshot();
      expect(notes).toHaveLength(1);
      expect(notes[0].durationTick).toBe(closed);
      expect(notes[0].open).toBe(false);
      expect(seen.count).toBe(0);
    });

    it('never records a duration below 1 tick', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ff0000');

      store.release(60); // no advance in between: 0 elapsed ticks

      expect(store.getSnapshot().notes[0].durationTick).toBe(1);
    });
  });

  describe('advance', () => {
    it('advances flowTick by dtMs * ppq * quartersPerSecond / 1000', () => {
      const store = new LiveNoteStore();
      const { seen } = counter(store);

      store.advance(1000, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);

      expect(store.getSnapshot().flowTick).toBe(960); // 1000 * 480 * 2 / 1000
      expect(seen.count).toBe(1);
    });

    it('accumulates across consecutive advances', () => {
      const store = new LiveNoteStore();

      store.advance(1000, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT); // 960
      store.advance(500, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT); // +480

      expect(store.getSnapshot().flowTick).toBe(1440);
    });

    it('does not notify for a zero-length advance', () => {
      // Rule 9 ties notification to a change in flowTick.
      const store = new LiveNoteStore();
      const { seen } = counter(store);

      store.advance(0, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);

      expect(store.getSnapshot().flowTick).toBe(0);
      expect(seen.count).toBe(0);
    });
  });

  describe('pruning', () => {
    it('prunes a closed note once its geometry is offscreen', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ffffff');
      store.advance(50, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT); // flowTick 48
      store.release(60); // duration 48
      const closed = store.getSnapshot().notes[0];

      expect(closed.open).toBe(false);
      // Still visible just after release...
      expect(isOffscreen(closed, store.getSnapshot().flowTick)).toBe(false);

      store.advance(100000, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);

      // ...and genuinely offscreen at the new flow tick.
      expect(isOffscreen(closed, store.getSnapshot().flowTick)).toBe(true);
      expect(store.getSnapshot().notes).toHaveLength(0);
    });

    it('never prunes a still-open note', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ffffff');
      const open = store.getSnapshot().notes[0];

      store.advance(100000, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);

      expect(isOffscreen(open, store.getSnapshot().flowTick)).toBe(false);
      const { notes } = store.getSnapshot();
      expect(notes).toHaveLength(1);
      expect(notes[0].open).toBe(true);
    });

    it('prunes only the closed, offscreen notes', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ffffff');
      store.press(62, 90, '#ffffff');
      store.advance(50, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);
      store.release(60);

      store.advance(100000, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);

      const { notes } = store.getSnapshot();
      expect(notes).toHaveLength(1);
      expect(notes[0].pitch).toBe(62);
      expect(notes[0].open).toBe(true);
    });
  });

  describe('notifications', () => {
    it('fires exactly once per successful press, release and flow advance', () => {
      const store = new LiveNoteStore();
      const { seen } = counter(store);

      store.press(60, 90, '#ffffff'); // 1
      store.press(60, 90, '#ffffff'); // no-op
      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT); // 2
      store.release(60); // 3
      store.release(60); // no-op
      store.press(62, 90, '#ffffff'); // 4
      store.advance(1000, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT); // 5
      store.reset(); // 6

      expect(seen.count).toBe(6);
    });

    it('stops after unsubscribe and tolerates a second call', () => {
      const store = new LiveNoteStore();
      const { seen, unsubscribe } = counter(store);

      store.press(60, 90, '#ffffff');
      expect(seen.count).toBe(1);

      unsubscribe();
      store.release(60);
      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);
      store.reset();

      expect(seen.count).toBe(1);
      expect(() => unsubscribe()).not.toThrow();
    });

    it('notifies every subscriber independently', () => {
      const store = new LiveNoteStore();
      const first = counter(store);
      const second = counter(store);

      store.press(60, 90, '#ffffff');
      expect(first.seen.count).toBe(1);
      expect(second.seen.count).toBe(1);

      first.unsubscribe();
      store.release(60);

      expect(first.seen.count).toBe(1);
      expect(second.seen.count).toBe(2);
    });
  });

  describe('reset', () => {
    it('clears the notes, rewinds the clock and notifies once', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ffffff');
      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);
      const before = store.getSnapshot();
      const { seen } = counter(store);

      store.reset();

      const after = store.getSnapshot();
      expect(seen.count).toBe(1);
      expect(after).not.toBe(before);
      expect(after.notes).toEqual([]);
      expect(after.flowTick).toBe(0);
    });

    it('is safe on a fresh store', () => {
      const store = new LiveNoteStore();

      expect(() => store.reset()).not.toThrow();

      const snapshot = store.getSnapshot();
      expect(snapshot.notes).toEqual([]);
      expect(snapshot.flowTick).toBe(0);
    });
  });

  describe('snapshot purity', () => {
    it('does not hand out its internal note array', () => {
      const store = new LiveNoteStore();
      store.press(60, 90, '#ffffff');
      const before = store.getSnapshot();
      expect(before.notes).toHaveLength(1);
      const realId = before.notes[0].id;

      // A hostile/naive consumer mutates the array it was given (readonly is a
      // compile-time promise only, hence the cast).
      (before.notes as LiveNote[]).push(fakeNote());
      expect(before.notes).toHaveLength(2);

      // A later mutation must rebuild the snapshot from the store's own state.
      store.advance(100, PPQ, QUARTERS_PER_SECOND, VIEW_HEIGHT);
      const after = store.getSnapshot();

      expect(after).not.toBe(before);
      expect(after.notes).toHaveLength(1);
      expect(after.notes.some((note: LiveNote) => note.id === 'fake')).toBe(false);
      expect(after.notes[0].id).toBe(realId);
    });
  });
});
