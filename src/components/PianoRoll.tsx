import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import type { Note } from '../core/domain/types';
import { HIGHEST_PITCH, LOWEST_PITCH } from './PianoKeyboard';

const ROW_HEIGHT = 10;
const MIN_WINDOW_SEMITONES = 24;
const DEFAULT_PIXELS_PER_TICK = 0.06;

export interface PianoRollProps {
  /** Committed material. */
  notes: Note[];
  /** Notes captured by the in-progress take, drawn differently. */
  liveNotes?: Note[];
  /** Current transport position, in ticks. */
  positionTick: number;
  ppq: number;
  pixelsPerTick?: number;
  /** Keep the cursor in view while the transport runs. */
  follow?: boolean;
  onSeek?: (tick: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rangeFromNotes(notes: Note[]): { min: number; max: number } {
  if (notes.length === 0) return { min: 60, max: 72 };
  let min = HIGHEST_PITCH;
  let max = LOWEST_PITCH;
  for (const note of notes) {
    if (note.pitch < min) min = note.pitch;
    if (note.pitch > max) max = note.pitch;
  }
  return { min: min - 2, max: max + 2 };
}

/**
 * Horizontal piano roll: pitch rows (high on top), a beat/bar grid, note blocks
 * and a vertical play cursor. Tapping seeks.
 */
export function PianoRoll({
  notes,
  liveNotes = [],
  positionTick,
  ppq,
  pixelsPerTick = DEFAULT_PIXELS_PER_TICK,
  follow = false,
  onSeek,
}: PianoRollProps) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const allNotes = useMemo(() => [...notes, ...liveNotes], [notes, liveNotes]);

  const { pitchMin, pitchMax } = useMemo(() => {
    const bounds = rangeFromNotes(allNotes);
    let min = clamp(bounds.min, LOWEST_PITCH, HIGHEST_PITCH);
    let max = clamp(bounds.max, LOWEST_PITCH, HIGHEST_PITCH);
    // Guarantee a minimum window, centring the extra rows.
    while (max - min + 1 < MIN_WINDOW_SEMITONES) {
      if (min > LOWEST_PITCH) min -= 1;
      else if (max < HIGHEST_PITCH) max += 1;
      else break;
    }
    return { pitchMin: min, pitchMax: max };
  }, [allNotes]);

  const rowCount = pitchMax - pitchMin + 1;
  const rollHeight = rowCount * ROW_HEIGHT;

  const barTicks = ppq * 4;
  const totalTicks = useMemo(() => {
    let maxEnd = 0;
    for (const note of allNotes) {
      const end = note.startTick + note.durationTick;
      if (end > maxEnd) maxEnd = end;
    }
    const horizon = Math.max(maxEnd, positionTick) + barTicks * 2;
    return Math.max(barTicks * 8, Math.ceil(horizon / barTicks) * barTicks);
  }, [allNotes, positionTick, barTicks]);

  const contentWidth = Math.max(1, totalTicks * pixelsPerTick);
  const cursorX = positionTick * pixelsPerTick;

  const gridTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = totalTicks / ppq > 512 ? barTicks : ppq;
    for (let tick = 0; tick <= totalTicks; tick += step) ticks.push(tick);
    return ticks;
  }, [totalTicks, ppq, barTicks]);

  useEffect(() => {
    if (!follow || viewportWidth === 0) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, cursorX - viewportWidth * 0.35), animated: false });
  }, [follow, cursorX, viewportWidth]);

  const onLayout = (event: LayoutChangeEvent): void => {
    setViewportWidth(event.nativeEvent.layout.width);
  };

  const handlePress = (event: GestureResponderEvent): void => {
    if (!onSeek) return;
    const tick = Math.max(0, Math.round(event.nativeEvent.locationX / pixelsPerTick));
    onSeek(tick);
  };

  const renderNote = (note: Note, kind: 'committed' | 'live') => {
    const top = (pitchMax - note.pitch) * ROW_HEIGHT;
    return (
      <View
        key={`${kind}-${note.id}`}
        style={{
          left: note.startTick * pixelsPerTick,
          top,
          width: Math.max(2, note.durationTick * pixelsPerTick),
          height: ROW_HEIGHT - 2,
        }}
        className={`absolute rounded-sm ${kind === 'live' ? 'bg-amber-400' : 'bg-sky-500'}`}
      />
    );
  };

  return (
    <View onLayout={onLayout} className="w-full">
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}>
        <Pressable onPress={handlePress}>
          <View style={{ width: contentWidth, height: rollHeight }} className="bg-zinc-950">
            {gridTicks.map((tick) => (
              <View
                key={`grid-${tick}`}
                style={{ left: tick * pixelsPerTick, height: rollHeight }}
                className={`absolute top-0 w-px ${tick % barTicks === 0 ? 'bg-zinc-600' : 'bg-zinc-800'}`}
              />
            ))}

            {notes.map((note) => renderNote(note, 'committed'))}
            {liveNotes.map((note) => renderNote(note, 'live'))}

            <View
              style={{ left: cursorX, height: rollHeight }}
              className="absolute top-0 w-0.5 bg-emerald-400"
            />
          </View>
        </Pressable>
      </ScrollView>

      {allNotes.length === 0 ? (
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-xs text-zinc-500">No notes yet — press record and play</Text>
        </View>
      ) : null}
    </View>
  );
}
