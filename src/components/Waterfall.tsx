import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type { Note } from '../core/domain/types';
import { LOWEST_PITCH } from './PianoKeyboard';

const WHITE_KEY_COUNT = 52;
const BLACK_KEY_WIDTH_RATIO = 0.62;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

interface KeyGeom { left: number; width: number; }

function keyGeometry(pitch: number, width: number): KeyGeom {
  const whiteKeyWidth = width > 0 ? width / WHITE_KEY_COUNT : 0;
  const blackKeyWidth = whiteKeyWidth * BLACK_KEY_WIDTH_RATIO;
  // Compute left by counting whites up to this pitch.
  let whiteIndex = 0;
  let left = 0;
  for (let p = LOWEST_PITCH; p < pitch; p += 1) {
    if (BLACK_PITCH_CLASSES.has(p % 12)) continue;
    whiteIndex += 1;
  }
  // pitch is black or white?
  if (BLACK_PITCH_CLASSES.has(pitch % 12)) {
    // position between previous white and next
    left = whiteIndex * whiteKeyWidth - blackKeyWidth / 2;
    return { left, width: blackKeyWidth };
  }
  left = whiteIndex * whiteKeyWidth;
  return { left, width: whiteKeyWidth };
}

interface LiveNote extends Note { open: boolean; }

export interface WaterfallProps {
  recordedNotes: Note[];
  activeNotes: Set<number>;
  position: number;
  ppq: number;
  width: number;
  height: number;
  activeColor: string;
  /** When false, no notes are animated (avoids permanent rising loop). */
  animate?: boolean;
}

const PX_PER_QUARTER = 48;
const MAX_AGE_QUARTERS = 6;

export function Waterfall({ recordedNotes, activeNotes, position, ppq, width, height, activeColor, animate = true }: WaterfallProps) {
  const [liveNotes, setLiveNotes] = useState<LiveNote[]>([]);
  const prevActiveRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!animate) {
      prevActiveRef.current = new Set();
      return;
    }
    const prev = prevActiveRef.current;
    setLiveNotes((current) => {
      let next = [...current];
      // open new
      for (const pitch of activeNotes) {
        if (!prev.has(pitch)) {
          next.push({
            id: `live-${pitch}-${Date.now()}`,
            pitch,
            velocity: 100,
            startTick: position,
            durationTick: 1,
            color: activeColor,
            open: true,
          });
        }
      }
      // close removed
      next = next.map((n) => {
        if (n.open && !activeNotes.has(n.pitch)) {
          return { ...n, open: false, durationTick: Math.max(1, position - n.startTick) };
        }
        return n;
      });
      return next;
    });
    prevActiveRef.current = new Set(activeNotes);
  }, [activeNotes, position, activeColor, animate]);

  // prune old live notes
  const visibleLive = animate
    ? liveNotes.filter((n) => {
        const age = position - n.startTick;
        return age >= 0 && age < MAX_AGE_QUARTERS * ppq;
      })
    : [];
  const visibleRecorded = animate
    ? recordedNotes.filter((n) => {
        const age = position - n.startTick;
        return age >= 0 && age < MAX_AGE_QUARTERS * ppq;
      })
    : [];
  const renderNote = (note: Note | LiveNote, key: string) => {
    const age = position - note.startTick;
    const bottom = (age / ppq) * PX_PER_QUARTER;
    const dur = (note as LiveNote).open
      ? Math.max(1, position - note.startTick)
      : note.durationTick;
    const h = Math.max(4, (dur / ppq) * PX_PER_QUARTER);
    const geom = keyGeometry(note.pitch, width);
    const opacity = Math.max(0, 1 - age / (MAX_AGE_QUARTERS * ppq));
    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          left: geom.left,
          width: geom.width - 1,
          bottom,
          height: h,
          backgroundColor: note.color || activeColor,
          opacity,
          borderRadius: 2,
        }}
      />
    );
  };

  return (
    <View style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      {visibleRecorded.map((n, i) => renderNote(n, `r-${n.id}-${i}`))}
      {visibleLive.map((n) => renderNote(n, `l-${n.id}`))}
    </View>
  );
}