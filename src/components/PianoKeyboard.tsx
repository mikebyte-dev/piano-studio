import { useMemo, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

/** Full 88-key range (A0 here is MIDI 21, C8 is MIDI 108). */
export const LOWEST_PITCH = 21;
export const HIGHEST_PITCH = 108;

const WHITE_KEY_COUNT = 52;
const BLACK_KEY_WIDTH_RATIO = 0.62;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export interface PianoKeyboardProps {
  /** Pitches currently held down. */
  activeNotes: Set<number>;
  /** Pitches held by the sustain pedal. */
  sustainedNotes?: Set<number>;
  /** Called when a key is pressed in (start of a sustained note). */
  onKeyDown?: (pitch: number) => void;
  /** Called when a key is released (end of a sustained note). */
  onKeyUp?: (pitch: number) => void;
}

interface BlackKey {
  pitch: number;
  left: number;
}

/**
 * Full-width 88-key keyboard. White keys lay out in a row; black keys are
 * absolutely positioned between them. Pressed and sustained keys are highlighted
 * differently.
 */
export function PianoKeyboard({ activeNotes, sustainedNotes, onKeyDown, onKeyUp }: PianoKeyboardProps) {
  const [width, setWidth] = useState(0);

  const whiteKeyWidth = width > 0 ? width / WHITE_KEY_COUNT : 0;
  const blackKeyWidth = whiteKeyWidth * BLACK_KEY_WIDTH_RATIO;

  const { whitePitches, blackKeys } = useMemo(() => {
    const whites: number[] = [];
    const blacks: BlackKey[] = [];
    let lastWhiteIndex = 0;

    for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch += 1) {
      if (BLACK_PITCH_CLASSES.has(pitch % 12)) {
        blacks.push({ pitch, left: (lastWhiteIndex + 1) * whiteKeyWidth - blackKeyWidth / 2 });
      } else {
        whites.push(pitch);
        lastWhiteIndex = whites.length - 1;
      }
    }
    return { whitePitches: whites, blackKeys: blacks };
  }, [whiteKeyWidth, blackKeyWidth]);

  const highlight = (pitch: number): 'active' | 'sustained' | null => {
    if (activeNotes.has(pitch)) return 'active';
    if (sustainedNotes?.has(pitch) === true) return 'sustained';
    return null;
  };

  const onLayout = (event: LayoutChangeEvent): void => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View onLayout={onLayout} className="relative h-36 w-full overflow-hidden rounded-md">
      <View className="absolute inset-0 flex-row">
        {whitePitches.map((pitch) => {
          const state = highlight(pitch);
          const background =
            state === 'active'
              ? 'bg-amber-400'
              : state === 'sustained'
                ? 'bg-violet-400'
                : 'bg-white';
          return (
            <Pressable
              key={pitch}
              onPressIn={() => onKeyDown?.(pitch)}
              onPressOut={() => onKeyUp?.(pitch)}
              className={`flex-1 justify-end border-r border-zinc-300 pb-1 ${background}`}
            >
              {pitch % 12 === 0 ? (
                <Text className="text-center text-[8px] text-zinc-500">C{Math.floor(pitch / 12) - 1}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {blackKeys.map(({ pitch, left }) => {
        const state = highlight(pitch);
        const background =
          state === 'active'
            ? 'bg-amber-500'
            : state === 'sustained'
              ? 'bg-violet-600'
              : 'bg-zinc-900';
        return (
          <Pressable
            key={pitch}
            onPressIn={() => onKeyDown?.(pitch)}
            onPressOut={() => onKeyUp?.(pitch)}
            style={{ left, width: blackKeyWidth }}
            className={`absolute top-0 h-[60%] rounded-b-sm ${background}`}
          />
        );
      })}
    </View>
  );
}
