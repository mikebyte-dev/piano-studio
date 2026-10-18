import { useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMetronome } from '../hooks/useMetronome';

export interface MetronomeProps {
  /** Transport tempo in BPM. */
  tempo: number;
  /** True while the transport is running (beats follow `position`). */
  isPlaying: boolean;
  /** Transport position in ticks. */
  position: number;
  /** Ticks per quarter note. */
  ppq: number;
  /** Whether the metronome click is on. */
  enabled: boolean;
  /** Called with the requested enabled value. */
  onEnabledChange: (enabled: boolean) => void;
  /** Beats per measure (1..8). */
  timeSignature: number;
  /** Called with the requested time signature. */
  onTimeSignatureChange: (value: number) => void;
  /** Called with the next tempo when the user steps the tempo up/down. */
  onTempoChange?: (tempo: number) => void;
}

/** BPM range accepted by the tempo stepper. */
const TEMPO_MIN = 20;
const TEMPO_MAX = 300;
/** BPM change applied per step. */
const TEMPO_STEP = 5;

/** Clamp a tempo value into the stepper's supported range. */
function clampTempo(tempo: number): number {
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, tempo));
}

/**
 * Compact metronome control: a metronome icon button that toggles the click
 * (amber when enabled) plus a "⋮" button that opens an options menu with the
 * time-signature stepper and a tempo stepper (read-only when no `onTempoChange`
 * handler is provided). The menu is rendered in a transparent `Modal` overlay,
 * so tapping anywhere outside the panel dismisses it.
 *
 * The state is owned by the caller (see `useStudio`); the audio engine lives in
 * `useMetronome`, which keeps the click period in sync with the transport
 * `tempo` (free-running while stopped, position-derived while playing).
 */
export function Metronome({
  tempo,
  isPlaying,
  position,
  ppq,
  enabled,
  onEnabledChange,
  timeSignature,
  onTimeSignatureChange,
  onTempoChange,
}: MetronomeProps) {
  const { toggle, setTimeSignature } = useMetronome({
    tempo,
    isPlaying,
    position,
    ppq,
    enabled,
    onEnabledChange,
    timeSignature,
    onTimeSignatureChange,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );

  const openMenu = () => {
    const node = containerRef.current;
    if (!node) {
      setMenuOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  };

  return (
    <View ref={containerRef} className="relative flex-row items-center gap-1">
      <Text className="text-xs font-semibold text-zinc-300">{tempo}</Text>

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={enabled ? 'Desactivar metrónomo' : 'Activar metrónomo'}
        accessibilityState={{ selected: enabled }}
        className={`rounded-md px-2 py-1.5 ${enabled ? 'bg-amber-500' : 'bg-zinc-800'}`}
      >
        <Text className={`text-base ${enabled ? 'text-zinc-900' : 'text-zinc-200'}`}>⏱</Text>
      </Pressable>

      <Pressable
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel="Opciones del metrónomo"
        accessibilityState={{ expanded: menuOpen }}
        className={`rounded-md px-2 py-1.5 ${menuOpen ? 'bg-zinc-700' : 'bg-zinc-800'}`}
      >
        <Text className="text-base text-zinc-200">⋮</Text>
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="none"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar opciones del metrónomo"
          />
          <View
            className={`absolute w-40 gap-2 rounded-md border border-zinc-700 bg-zinc-800 p-2 ${
              anchor ? '' : 'right-3 top-12'
            }`}
            style={
              anchor
                ? {
                    position: 'absolute',
                    top: anchor.y + anchor.height + 4,
                    right: Dimensions.get('window').width - anchor.x - anchor.width,
                  }
                : undefined
            }
          >
            <View className="gap-1">
              <Text className="text-[10px] uppercase tracking-wide text-zinc-400">Compás</Text>
              <View className="flex-row items-center justify-between gap-1">
                <Pressable
                  onPress={() => setTimeSignature(timeSignature - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Disminuir compás"
                  className="rounded bg-zinc-700 px-2 py-1"
                >
                  <Text className="text-white">▼</Text>
                </Pressable>
                <Text className="text-sm font-semibold text-white">{timeSignature}/4</Text>
                <Pressable
                  onPress={() => setTimeSignature(timeSignature + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Aumentar compás"
                  className="rounded bg-zinc-700 px-2 py-1"
                >
                  <Text className="text-white">▲</Text>
                </Pressable>
              </View>
            </View>

            <View className="gap-1">
              <Text className="text-[10px] uppercase tracking-wide text-zinc-400">Tempo</Text>
              {onTempoChange ? (
                <View className="flex-row items-center justify-between gap-1">
                  <Pressable
                    onPress={() => onTempoChange(clampTempo(tempo - TEMPO_STEP))}
                    accessibilityRole="button"
                    accessibilityLabel="Disminuir tempo"
                    className="rounded bg-zinc-700 px-2 py-1"
                  >
                    <Text className="text-white">▼</Text>
                  </Pressable>
                  <Text className="text-sm font-semibold text-white">{tempo} BPM</Text>
                  <Pressable
                    onPress={() => onTempoChange(clampTempo(tempo + TEMPO_STEP))}
                    accessibilityRole="button"
                    accessibilityLabel="Aumentar tempo"
                    className="rounded bg-zinc-700 px-2 py-1"
                  >
                    <Text className="text-white">▲</Text>
                  </Pressable>
                </View>
              ) : (
                <Text className="text-sm font-semibold text-white">{tempo} BPM</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
