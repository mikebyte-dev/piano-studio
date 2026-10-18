import { Text, View } from 'react-native';

export interface SustainPedalProps {
  /** Whether the sustain pedal (CC 64) is currently down. */
  down: boolean;
}

/** Visual indicator for the sustain pedal: a key that turns purple when down. */
export function SustainPedal({ down }: SustainPedalProps) {
  return (
    <View
      className={`h-10 w-16 items-center justify-center rounded-sm border ${
        down ? 'border-violet-500 bg-violet-700' : 'border-zinc-600 bg-zinc-800'
      }`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 4,
      }}
    >
      <Text className={`text-[10px] font-semibold ${down ? 'text-white' : 'text-zinc-400'}`}>
        SUSTAIN
      </Text>
    </View>
  );
}
