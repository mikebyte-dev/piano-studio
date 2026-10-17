import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  PianoKeyboard,
  PianoRoll,
  RegionTools,
  SustainPedal,
  TransportBar,
} from '../components';
import type { MidiDevice } from '../core/midi/MidiAdapter';
import { useStudio } from '../hooks';

export default function Index() {
  const studio = useStudio();

  const selectedDevice: MidiDevice | undefined = studio.devices.find(
    (device) => device.id === studio.selectedId,
  );

  const statusLine = !studio.supported
    ? 'MIDI not supported on this platform'
    : studio.isOpen
      ? `Opened: ${selectedDevice?.name ?? studio.selectedId}`
      : 'MIDI ready — select a device and press Connect';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerClassName="pb-8">
        <View className="px-4 pt-2">
          <Text className="text-3xl font-bold text-white">Piano Studio</Text>
          <Text className="mt-1 text-xs text-zinc-400">{statusLine}</Text>
          {studio.error ? (
            <Text className="mt-1 text-xs text-red-400">{studio.error}</Text>
          ) : null}
        </View>

        <View className="mt-3 px-4">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Devices
          </Text>
          <View className="rounded-lg border border-zinc-800 bg-zinc-900">
            {studio.devices.length === 0 ? (
              <Text className="px-3 py-3 text-xs text-zinc-500">No MIDI devices found</Text>
            ) : (
              studio.devices.map((device) => {
                const selected = device.id === studio.selectedId;
                return (
                  <Pressable
                    key={device.id}
                    onPress={() => studio.setSelectedId(device.id)}
                    className={`border-b border-zinc-800 px-3 py-2 ${selected ? 'bg-sky-900/40' : ''}`}
                  >
                    <Text className="text-sm text-white">{device.name || `Device ${device.id}`}</Text>
                    <Text className="text-[11px] text-zinc-500">
                      {device.manufacturer ? `${device.manufacturer} · ` : ''}
                      {device.id}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>

        <View className="mt-2 flex-row gap-2 px-4">
          <Pressable
            onPress={() => {
              if (studio.selectedId) void studio.connect(studio.selectedId);
            }}
            disabled={studio.selectedId === null}
            className={`flex-1 rounded-md px-3 py-2 ${
              studio.selectedId === null ? 'bg-zinc-800' : 'bg-sky-600'
            }`}
          >
            <Text className="text-center text-sm font-semibold text-white">Connect</Text>
          </Pressable>
          <Pressable
            onPress={() => void studio.disconnect()}
            disabled={!studio.isOpen}
            className={`flex-1 rounded-md px-3 py-2 ${studio.isOpen ? 'bg-zinc-700' : 'bg-zinc-800'}`}
          >
            <Text className="text-center text-sm font-semibold text-white">Disconnect</Text>
          </Pressable>
          <Pressable
            onPress={() => void studio.refreshDevices()}
            className="rounded-md bg-zinc-700 px-3 py-2"
          >
            <Text className="text-center text-sm font-semibold text-white">Refresh</Text>
          </Pressable>
        </View>

        <View className="mt-4 px-4">
          <TransportBar
            state={studio.transportState}
            position={studio.position}
            ppq={studio.ppq}
            tempo={studio.tempo}
            beat={studio.beat}
            metronomeEnabled={studio.metronomeEnabled}
            recordMode={studio.recordMode}
            onPlay={studio.play}
            onStop={studio.stop}
            onRecord={studio.record}
            onToggleMetronome={studio.toggleMetronome}
            onToggleRecordMode={() =>
              studio.setRecordMode(studio.recordMode === 'overdub' ? 'replace' : 'overdub')
            }
          />
        </View>

        <View className="mt-2 flex-row items-center gap-2 px-4">
          <Text className="text-xs text-zinc-500">Tempo</Text>
          <Pressable
            onPress={() => studio.setTempo(Math.max(20, studio.tempo - 10))}
            className="rounded bg-zinc-800 px-2 py-1"
          >
            <Text className="text-xs text-white">−10</Text>
          </Pressable>
          <Text className="text-xs text-zinc-300">{studio.tempo} BPM</Text>
          <Pressable
            onPress={() => studio.setTempo(studio.tempo + 10)}
            className="rounded bg-zinc-800 px-2 py-1"
          >
            <Text className="text-xs text-white">+10</Text>
          </Pressable>
          <View className="flex-1" />
          <Text className="text-xs text-zinc-500">
            {(studio.region?.notes.length ?? 0) + studio.liveNotes.length} notes
          </Text>
        </View>

        <View className="mt-3 px-4">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Piano roll
          </Text>
          <View className="overflow-hidden rounded-lg border border-zinc-800">
            <PianoRoll
              notes={studio.region?.notes ?? []}
              liveNotes={studio.liveNotes}
              positionTick={studio.position}
              ppq={studio.ppq}
              follow={studio.transportState !== 'stopped'}
              onSeek={studio.seek}
            />
          </View>
        </View>

        <View className="mt-4 px-2">
          <PianoKeyboard
            activeNotes={studio.activeNotes}
            sustainedNotes={studio.sustainedNotes}
            onKeyPress={studio.sendNote}
          />
        </View>

        <View className="mt-3 flex-row items-center justify-between px-4">
          <SustainPedal down={studio.sustainDown} />
          <Text className="text-[11px] text-zinc-500">
            Tap a key to send MIDI out
          </Text>
        </View>

        <View className="mt-3 px-4">
          <RegionTools
            region={studio.region}
            ppq={studio.ppq}
            onMove={studio.moveRegionBy}
            onTrimStart={studio.trimRegionStartBy}
            onTrimEnd={studio.trimRegionEndBy}
            onResize={studio.resizeRegionBy}
            onClear={studio.clearRegion}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#18181b',
  },
});
