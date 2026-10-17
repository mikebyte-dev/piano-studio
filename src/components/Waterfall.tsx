import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import type { Note } from '../core/domain/types';
import { darken, lighten, shadeByPosition } from '../core/waterfall/colors';
import { LIVE_VELOCITY, LiveNoteStore } from '../core/waterfall/liveNotes';
import type { LiveNote } from '../core/waterfall/liveNotes';
import { DEFAULT_PX_PER_QUARTER, liveNoteGeometry } from '../core/waterfall/noteGeometry';
import { flowQuartersPerSecond } from '../core/waterfall/tempo';
import { LOWEST_PITCH } from './PianoKeyboard';

// Re-export the color helpers from their new home so any existing
// `./Waterfall` / `../components` consumers keep working.
export { darken, lighten } from '../core/waterfall/colors';

const WHITE_KEY_COUNT = 52;
const BLACK_KEY_WIDTH_RATIO = 0.62;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

interface KeyGeom { left: number; width: number; }

function keyGeometry(pitch: number, width: number): KeyGeom {
  const whiteKeyWidth = width > 0 ? width / WHITE_KEY_COUNT : 0;
  const blackKeyWidth = whiteKeyWidth * BLACK_KEY_WIDTH_RATIO;
  // Compute left by counting whites up to this pitch.
  let whiteIndex = 0;
  for (let p = LOWEST_PITCH; p < pitch; p += 1) {
    if (BLACK_PITCH_CLASSES.has(p % 12)) continue;
    whiteIndex += 1;
  }
  // pitch is black or white?
  if (BLACK_PITCH_CLASSES.has(pitch % 12)) {
    // position between previous white and next
    const left = whiteIndex * whiteKeyWidth - blackKeyWidth / 2;
    return { left, width: blackKeyWidth };
  }
  return { left: whiteIndex * whiteKeyWidth, width: whiteKeyWidth };
}

export interface WaterfallProps {
  recordedNotes: Note[];
  /** Pitches currently held down (mouse or MIDI). */
  activeNotes: Set<number>;
  position: number;
  ppq: number;
  width: number;
  height: number;
  activeColor: string;
  /** True while the transport is playing/recording (notes fall toward the keyboard). */
  isScrolling: boolean;
  /** Transport tempo in BPM; drives the live-note flow speed. */
  tempo?: number;
}

/** Clamps a value to the 0..1 range. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Recorded notes fade out after this many quarter notes of transport age. */
const MAX_AGE_QUARTERS = 6;
const STATIC_TOP_MARGIN = 60;

/** How often the live animation clock advances (ms). */
const CLOCK_INTERVAL_MS = 33;
/** Tempo (BPM) used for the flow speed when the caller does not provide one. */
const DEFAULT_TEMPO = 90;

function clockNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Renders recorded notes plus live notes over the keyboard.
 *
 * Recorded notes use the transport time base (`position` / `ppq`), so they
 * rise as the transport advances and freeze when it stops. Live notes are owned
 * by a {@link LiveNoteStore} with an independent, always-running flow clock
 * (`flowTick`), so they rise the moment a key is pressed, regardless of
 * transport state.
 */
export function Waterfall({
  recordedNotes,
  activeNotes,
  position,
  ppq,
  width,
  height,
  activeColor,
  isScrolling,
  tempo,
}: WaterfallProps) {
  const quartersPerSecond = flowQuartersPerSecond(tempo ?? DEFAULT_TEMPO);

  // A single store per component instance, created lazily on first render.
  const [store] = useState(() => new LiveNoteStore());
  const lastMsRef = useRef(0);

  const { subscribe, getSnapshot } = useMemo(
    () => ({
      subscribe: (listener: () => void) => store.subscribe(listener),
      getSnapshot: () => store.getSnapshot(),
    }),
    [store],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  // Reconcile the store's live notes whenever the held pitches change: open a
  // note for each newly pressed pitch, close any note whose pitch was released.
  useEffect(() => {
    const openPitches = new Set<number>();
    for (const note of store.getSnapshot().notes) {
      if (note.open) openPitches.add(note.pitch);
    }

    // Close live notes whose pitch is no longer held.
    for (const pitch of openPitches) {
      if (!activeNotes.has(pitch)) store.release(pitch);
    }

    // Open a live note for each newly pressed pitch.
    for (const pitch of activeNotes) {
      if (!openPitches.has(pitch)) store.press(pitch, LIVE_VELOCITY, activeColor);
    }
  }, [store, activeNotes, activeColor]);

  // Continuous animation clock: advances the store's flow clock in real time and
  // prunes live notes once they scroll off the top of the view. Runs only while
  // something is held or a live note is still on screen.
  const activeCount = activeNotes.size;
  const liveCount = snapshot.notes.length;
  useEffect(() => {
    if (activeCount === 0 && liveCount === 0) return;
    lastMsRef.current = clockNow();
    const timer = setInterval(() => {
      const now = clockNow();
      const dtMs = now - lastMsRef.current;
      lastMsRef.current = now;
      store.advance(dtMs, ppq, quartersPerSecond, height);
    }, CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [store, activeCount, liveCount, ppq, height, quartersPerSecond]);

  const renderRecordedNote = (note: Note, key: string) => {
    const geom = keyGeometry(note.pitch, width);
    let bottom: number;
    let h: number;
    let opacity: number;

    if (isScrolling) {
      const age = position - note.startTick;
      bottom = (age / ppq) * DEFAULT_PX_PER_QUARTER;
      h = Math.max(4, (note.durationTick / ppq) * DEFAULT_PX_PER_QUARTER);
      opacity = Math.max(0, 1 - age / (MAX_AGE_QUARTERS * ppq));
    } else {
      // Static overview: fit the whole phrase between the bottom edge and a
      // small top margin so recorded tracks stay permanently visible.
      const maxStart = recordedNotes.reduce((max, n) => Math.max(max, n.startTick), 0);
      const pxPerTick = maxStart > 0 ? (height - STATIC_TOP_MARGIN) / maxStart : 1;
      bottom = note.startTick * pxPerTick;
      h = Math.max(4, note.durationTick * pxPerTick);
      opacity = 1;
    }

    // Vertical gradient: darker near the keyboard, lighter toward the top.
    const t = height > 0 ? clamp01((bottom + h / 2) / height) : 1;
    const fill = shadeByPosition(note.color || activeColor, t);

    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          left: geom.left,
          width: geom.width - 1,
          bottom,
          height: h,
          backgroundColor: fill,
          borderTopWidth: 1.5,
          borderTopColor: lighten(fill, 0.35),
          borderBottomWidth: 1.5,
          borderBottomColor: darken(fill, 0.35),
          borderRadius: 3,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.45,
          shadowRadius: 3,
          elevation: 3,
          opacity,
        }}
      />
    );
  };

  const renderLiveNote = (note: LiveNote) => {
    const geom = keyGeometry(note.pitch, width);
    // While held the bar is anchored to the keyboard (bottom: 0) and grows
    // upward; on release it freezes at its real length and rides the flow clock
    // up and away from the keys.
    const { bottom, height: noteHeight, opacity } = liveNoteGeometry({
      startTick: note.startTick,
      durationTick: note.durationTick,
      open: note.open,
      flowTick: snapshot.flowTick,
      ppq,
      viewHeight: height,
      quartersPerSecond,
    });

    // Vertical gradient: darker near the keyboard, lighter toward the top.
    const t = height > 0 ? clamp01((bottom + noteHeight / 2) / height) : 1;
    const fill = shadeByPosition(activeColor, t);

    return (
      <View
        key={note.id}
        style={{
          position: 'absolute',
          left: geom.left,
          width: geom.width - 1,
          bottom,
          height: noteHeight,
          backgroundColor: fill,
          borderTopWidth: 1.5,
          borderTopColor: lighten(fill, 0.35),
          borderBottomWidth: 1.5,
          borderBottomColor: darken(fill, 0.35),
          borderRadius: 3,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.45,
          shadowRadius: 3,
          elevation: 3,
          opacity,
        }}
      />
    );
  };

  const visibleRecorded = isScrolling
    ? recordedNotes.filter((n) => {
        const age = position - n.startTick;
        return age >= 0 && age < MAX_AGE_QUARTERS * ppq;
      })
    : recordedNotes;

  // Defensive dedupe: never render two open notes for the same pitch. Keep the
  // first open note per pitch and drop any extra (released notes are untouched).
  const openPitches = new Set<number>();
  const visibleLive = snapshot.notes.filter((note) => {
    if (!note.open) return true;
    if (openPitches.has(note.pitch)) return false;
    openPitches.add(note.pitch);
    return true;
  });

  return (
    <View style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      {visibleRecorded.map((n, i) => renderRecordedNote(n, `r-${n.id}-${i}`))}
      {visibleLive.map(renderLiveNote)}
    </View>
  );
}
