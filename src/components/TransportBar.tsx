import { Pressable, Text, View } from 'react-native';

import type { TransportState } from '../core/recording/Transport';
import type { RecordMode } from '../hooks/useStudio';

export interface TransportBarProps {
  state: TransportState;
  position: number;
  ppq: number;
  tempo: number;
  /** 1-based quarter-note beat under the cursor. */
  beat: number;
  metronomeEnabled: boolean;
  recordMode: RecordMode;
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onToggleMetronome: () => void;
  onToggleRecordMode: () => void;
}

function formatPosition(position: number, ppq: number): string {
  const barTicks = ppq * 4;
  const bar = Math.floor(position / barTicks) + 1;
  const beat = Math.floor((position % barTicks) / ppq) + 1;
  const tick = Math.floor(position % ppq);
  return `${String(bar).padStart(3, '0')}.${beat}.${String(tick).padStart(3, '0')}`;
}

interface TransportButtonProps {
  label: string;
  onPress: () => void;
  active?: boolean;
  tone?: 'default' | 'record';
}

function TransportButton({ label, onPress, active = false, tone = 'default' }: TransportButtonProps) {
  const activeClass =
    tone === 'record'
      ? 'border-red-500 bg-red-600'
      : 'border-sky-400 bg-sky-600';
  const idleClass =
    tone === 'record'
      ? 'border-red-500/60 bg-zinc-800'
      : 'border-zinc-600 bg-zinc-800';
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-md border px-3 py-2 ${active ? activeClass : idleClass}`}
    >
      <Text className="text-xs font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

/** Transport controls: play / stop / record, position readout and toggles. */
export function TransportBar({
  state,
  position,
  ppq,
  tempo,
  beat,
  metronomeEnabled,
  recordMode,
  onPlay,
  onStop,
  onRecord,
  onToggleMetronome,
  onToggleRecordMode,
}: TransportBarProps) {
  const isPlaying = state !== 'stopped';
  const isRecording = state === 'recording';

  return (
    <View className="gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <View className="flex-row items-center gap-2">
        <TransportButton label="Grabar" tone="record" active={isRecording} onPress={onRecord} />
        <TransportButton label={isPlaying ? 'Reproduciendo' : 'Reproducir'} active={isPlaying && !isRecording} onPress={onPlay} />
        <TransportButton label="Detener" onPress={onStop} />
        <Pressable
          onPress={onToggleRecordMode}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2"
        >
          <Text className="text-xs font-semibold text-white">
            {recordMode === 'overdub' ? 'Superposición' : 'Reemplazar'}
          </Text>
        </Pressable>
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-sm text-emerald-300">{formatPosition(position, ppq)}</Text>
        <Text className="text-xs text-zinc-400">{tempo} BPM</Text>
        <Pressable onPress={onToggleMetronome} className="flex-row items-center gap-1">
          <View
            className={`h-2.5 w-2.5 rounded-full ${
              metronomeEnabled ? (beat % 4 === 1 ? 'bg-amber-400' : 'bg-amber-700') : 'bg-zinc-600'
            }`}
          />
          <Text className={`text-xs ${metronomeEnabled ? 'text-amber-300' : 'text-zinc-500'}`}>
            {metronomeEnabled ? `pulso ${beat}` : 'metro desactivado'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
