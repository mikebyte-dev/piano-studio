import { Pressable, Text, View } from 'react-native';

import type { Region } from '../core/domain/types';

export interface RegionToolsProps {
  region: Region | null;
  ppq: number;
  onMove: (deltaTick: number) => void;
  onTrimStart: (deltaTick: number) => void;
  onTrimEnd: (deltaTick: number) => void;
  onResize: (deltaTick: number) => void;
  onClear: () => void;
}

interface ToolButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

function ToolButton({ label, onPress, disabled = false }: ToolButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded border px-2 py-1.5 ${
        disabled ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-600 bg-zinc-800'
      }`}
    >
      <Text className={`text-[11px] ${disabled ? 'text-zinc-600' : 'text-zinc-200'}`}>{label}</Text>
    </Pressable>
  );
}

/**
 * Region editing controls (phase 5): move in time, trim start/end and resize.
 * Operates on the single take region; deltas are in ticks (one bar = 4 * ppq).
 */
export function RegionTools({ region, ppq, onMove, onTrimStart, onTrimEnd, onResize, onClear }: RegionToolsProps) {
  const bar = ppq * 4;
  const disabled = region === null;
  const startTick = region?.startTick ?? 0;
  const endTick = region === null ? 0 : region.startTick + region.lengthTick;

  return (
    <View className="gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold text-zinc-300">Region</Text>
        <Text className="text-[11px] text-zinc-500">
          {region === null
            ? 'empty'
            : `[${startTick}–${endTick}) · ${region.notes.length} notes`}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-1.5">
        <ToolButton label="◀ move" disabled={disabled} onPress={() => onMove(-bar)} />
        <ToolButton label="move ▶" disabled={disabled} onPress={() => onMove(bar)} />
        <ToolButton label="trim start ▶" disabled={disabled} onPress={() => onTrimStart(bar)} />
        <ToolButton label="◀ trim start" disabled={disabled} onPress={() => onTrimStart(-bar)} />
        <ToolButton label="trim end ◀" disabled={disabled} onPress={() => onTrimEnd(-bar)} />
        <ToolButton label="trim end ▶" disabled={disabled} onPress={() => onTrimEnd(bar)} />
        <ToolButton label="shorter" disabled={disabled} onPress={() => onResize(-bar)} />
        <ToolButton label="longer" disabled={disabled} onPress={() => onResize(bar)} />
        <ToolButton label="clear" disabled={disabled} onPress={onClear} />
      </View>
    </View>
  );
}
