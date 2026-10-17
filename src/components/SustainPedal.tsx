import { Text, View } from 'react-native';

export interface SustainPedalProps {
  /** Whether the sustain pedal (CC 64) is currently down. */
  down: boolean;
}

/** Visual indicator for the sustain pedal. */
export function SustainPedal({ down }: SustainPedalProps) {
  return (
    <View className="flex-row items-center gap-2">
      <View
        className={`h-8 w-14 items-center justify-center rounded-md border ${
          down ? 'border-violet-400 bg-violet-500' : 'border-zinc-600 bg-zinc-800'
        }`}
      >
        <Text className={`text-[10px] font-semibold ${down ? 'text-white' : 'text-zinc-400'}`}>
          SUSTAIN
        </Text>
      </View>
      <Text className={`text-xs ${down ? 'text-violet-300' : 'text-zinc-500'}`}>
        {down ? 'pressed' : 'released'}
      </Text>
    </View>
  );
}
