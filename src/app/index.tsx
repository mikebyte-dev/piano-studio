import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PianoKeyboard } from '../components/PianoKeyboard';
import { Waterfall } from '../components/Waterfall';
import { useStudio } from '../hooks/useStudio';



export default function Index() {
  const studio = useStudio();
  const { devices, isOpen, connect } = studio;
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const autoConnectedRef = useRef(false);

  // Auto-connect when a single device is available.
  useEffect(() => {
    if (isOpen) return;
    if (devices.length === 1 && !autoConnectedRef.current) {
      autoConnectedRef.current = true;
      void connect(devices[0].id);
    }
    if (devices.length === 0) autoConnectedRef.current = false;
  }, [devices, isOpen, connect]);

  const recordedNotes = [...(studio.region?.notes ?? []), ...studio.liveNotes];

  // Computer-keyboard input for the central octave (testing). Chromatic C4..B4.
  const { sendNote } = studio;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const map: Record<string, number> = {
      a: 60, w: 61, r: 62, f: 63, s: 64, n: 65,
      l: 66, e: 67, u: 68, i: 69, y: 70, o: 71,
    };
    const handler = (event: KeyboardEvent) => {
      const pitch = map[event.key.toLowerCase()];
      if (pitch === undefined) return;
      if (event.repeat) return;
      event.preventDefault();
      sendNote(pitch);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendNote]);

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      {/* Top transport bar */}
      <View className="flex-row flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <Text className="mr-2 text-lg font-bold text-white">Piano Studio</Text>

        <Pressable
          onPress={studio.transportState === 'playing' ? studio.stop : studio.play}
          className="rounded-md bg-emerald-600 px-3 py-1.5"
        >
          <Text className="text-sm font-semibold text-white">
            {studio.transportState === 'playing' ? 'Stop' : 'Play'}
          </Text>
        </Pressable>

        <Pressable
          onPress={studio.transportState === 'recording' ? studio.stop : studio.record}
          className="rounded-md bg-red-600 px-3 py-1.5"
        >
          <Text className="text-sm font-semibold text-white">
            {studio.transportState === 'recording' ? 'Stop Rec' : 'Rec'}
          </Text>
        </Pressable>

        <View className="flex-row items-center gap-1">
          <Pressable onPress={() => studio.setTempo(studio.tempo - 5)} className="rounded bg-zinc-800 px-2 py-1">
            <Text className="text-white">-</Text>
          </Pressable>
          <Text className="w-12 text-center text-white">{studio.tempo}</Text>
          <Pressable onPress={() => studio.setTempo(studio.tempo + 5)} className="rounded bg-zinc-800 px-2 py-1">
            <Text className="text-white">+</Text>
          </Pressable>
        </View>

        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-zinc-400">TS</Text>
          <Pressable
            onPress={() => studio.setTimeSignature(studio.timeSignature - 1)}
            className="rounded bg-zinc-800 px-2 py-1"
          >
            <Text className="text-white">-</Text>
          </Pressable>
          <Text className="w-8 text-center text-white">{studio.timeSignature}/4</Text>
          <Pressable
            onPress={() => studio.setTimeSignature(studio.timeSignature + 1)}
            className="rounded bg-zinc-800 px-2 py-1"
          >
            <Text className="text-white">+</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={studio.toggleMetronome}
          className={`rounded-md px-3 py-1.5 ${studio.metronomeEnabled ? 'bg-amber-500' : 'bg-zinc-800'}`}
        >
          <Text className="text-sm font-semibold text-white">Metronome</Text>
        </Pressable>

        {/* Device menu */}
        <View className="flex-row items-center gap-1">
          {studio.devices.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-w-[200px]">
              {studio.devices.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => void studio.connect(d.id)}
                  className={`mr-1 rounded px-2 py-1 ${studio.selectedId === d.id ? 'bg-blue-600' : 'bg-zinc-800'}`}
                >
                  <Text className="text-xs text-white">{d.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text className="text-xs text-zinc-400">
              {studio.devices.length === 0 ? 'No device' : studio.devices[0]?.name}
            </Text>
          )}
          <Pressable onPress={() => void studio.refreshDevices()} className="rounded bg-zinc-800 px-2 py-1">
            <Text className="text-xs text-white">↻</Text>
          </Pressable>
        </View>

        {studio.error ? <Text className="text-xs text-red-400">{studio.error}</Text> : null}
      </View>

      {/* Recorded track */}
      {studio.region ? (
        <View className="flex-row items-center gap-2 px-3 py-1">
          <View
            style={{ backgroundColor: studio.region.notes[0]?.color ?? '#22c55e' }}
            className="h-4 w-4 rounded"
          />
          <Text className="text-xs text-zinc-300">Track 1 · {studio.region.notes.length} notes</Text>
          <Pressable onPress={studio.clearRegion} className="ml-auto rounded bg-zinc-800 px-2 py-1">
            <Text className="text-xs text-white">Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Waterfall */}
      <View
        className="flex-1"
        onLayout={(e) => setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <Waterfall
          recordedNotes={recordedNotes}
          activeNotes={studio.activeNotes}
          position={studio.position}
          ppq={studio.ppq}
          width={layout.width}
          height={layout.height}
          activeColor={studio.recordingColor}
          animate={studio.transportState !== 'stopped' || studio.activeNotes.size > 0 || studio.liveNotes.length > 0}
        />
      </View>

      {/* Piano keyboard (key highlight hidden while recording) */}
      <View className="h-36">
        <PianoKeyboard
          activeNotes={studio.transportState === 'recording' ? new Set() : studio.activeNotes}
          sustainedNotes={studio.sustainedNotes}
          onKeyPress={studio.sendNote}
        />
      </View>

      <Text className="px-3 py-1 text-xs text-zinc-500">
        {studio.sustainDown ? 'Sustain: down' : 'Sustain: up'} · beat {studio.beat} · notes {recordedNotes.length}
      </Text>
    </SafeAreaView>
  );
}