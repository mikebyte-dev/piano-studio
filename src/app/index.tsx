import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Metronome } from '../components/Metronome';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { SustainPedal } from '../components/SustainPedal';
import { Waterfall } from '../components/Waterfall';
import { useStudio } from '../hooks/useStudio';

/** Preset palette for per-track color picking. */
const TRACK_COLORS = [
  '#22c55e',
  '#3b82f6',
  '#ef4444',
  '#eab308',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
] as const;



export default function Index() {
  const studio = useStudio();
  const { devices, isOpen, connect } = studio;
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [paletteRegionId, setPaletteRegionId] = useState<string | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const keyboardHeight = isLandscape
    ? Math.max(96, Math.round(windowHeight * 0.28))
    : Math.max(144, Math.round(windowHeight * 0.18));
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

  const recordedNotes = studio.recordedNotes;

  return (
    <SafeAreaView className="relative flex-1 bg-zinc-900">
      {/* Header */}
      <View className="border-b border-zinc-800 px-3 py-2">
        <Text className="text-lg font-bold text-white">Piano Studio</Text>
      </View>

      {/* Transport bar: devices · Play/Rec · Metronome */}
      <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
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
              {studio.devices.length === 0 ? 'Sin dispositivo' : studio.devices[0]?.name}
            </Text>
          )}
          <Pressable onPress={() => void studio.refreshDevices()} className="rounded bg-zinc-800 px-2 py-1">
            <Text className="text-xs text-white">↻</Text>
          </Pressable>
        </View>

        {/* Transport controls */}
        <View className="flex-row gap-2">
          <Pressable
            onPress={studio.transportState === 'playing' ? studio.stop : studio.play}
            className="rounded-md bg-emerald-600 px-3 py-1.5"
          >
            <Text className="text-sm font-semibold text-white">
              {studio.transportState === 'playing' ? 'Detener' : 'Reproducir'}
            </Text>
          </Pressable>

          <Pressable
            onPress={studio.transportState === 'recording' ? studio.stop : studio.record}
            className="rounded-md bg-red-600 px-3 py-1.5"
          >
            <Text className="text-sm font-semibold text-white">
              {studio.transportState === 'recording' ? 'Det. grab.' : 'Grabar'}
            </Text>
          </Pressable>
        </View>

        {/* Metronome */}
        <Metronome
          tempo={studio.tempo}
          isPlaying={studio.transportState !== 'stopped'}
          position={studio.position}
          ppq={studio.ppq}
          enabled={studio.metronomeEnabled}
          onEnabledChange={studio.setMetronomeEnabled}
          timeSignature={studio.timeSignature}
          onTimeSignatureChange={studio.setTimeSignature}
          onTempoChange={studio.setTempo}
        />
      </View>

      {studio.error ? <Text className="px-3 py-1 text-xs text-red-400">{studio.error}</Text> : null}

      {/* Recorded tracks */}
      {studio.regions.length > 0 ? (
        <View style={{ height: isLandscape ? 36 : 44 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="items-center px-3"
            className="h-full"
          >
            {studio.regions.map((region, i) => {
              const selected = studio.selectedRegionId === region.id;
              return (
                <View
                  key={region.id}
                  className={`mr-2 flex-row items-center gap-2 rounded px-2 py-1 ${selected ? 'bg-zinc-700' : 'bg-zinc-900'}`}
                >
                  <Pressable
                    onPress={() => {
                      studio.setSelectedRegionId(region.id);
                      setPaletteRegionId((prev) => (prev === region.id ? null : region.id));
                    }}
                    className="flex-row items-center gap-2"
                    accessibilityLabel={`Opciones de color de pista ${i + 1}`}
                  >
                    <View
                      style={{ backgroundColor: region.color ?? region.notes[0]?.color ?? '#22c55e' }}
                      className="h-4 w-4 rounded"
                    />
                    <Text className="text-xs text-zinc-300">
                      Pista {i + 1} · {region.notes.length} notas
                    </Text>
                  </Pressable>
                  {paletteRegionId === region.id ? (
                    <View className="flex-row items-center gap-1">
                      {TRACK_COLORS.map((color) => (
                        <Pressable
                          key={color}
                          onPress={() => {
                            studio.setRegionColor(region.id, color);
                            setPaletteRegionId(null);
                          }}
                          style={{ backgroundColor: color }}
                          className="h-3.5 w-3.5 rounded-full border border-zinc-500"
                          accessibilityLabel={`Establecer color de pista ${color}`}
                        />
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      studio.deleteRegion(region.id);
                      setPaletteRegionId((prev) => (prev === region.id ? null : prev));
                    }}
                    className="rounded bg-zinc-800 px-2 py-1"
                  >
                    <Text className="text-xs text-white">Eliminar</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Waterfall */}
      <View
        className="flex-1 relative bg-zinc-800"
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
          isScrolling={studio.transportState !== 'stopped'}
          tempo={studio.tempo}
        />
        <View className="absolute bottom-2 right-2 z-10">
          <SustainPedal down={studio.sustainDown} />
        </View>
      </View>

      {/* Red felt strip, separated by a dark gray margin with black borders */}
      <View className="w-full border-y border-black bg-zinc-900 px-0 pt-2 pb-0">
        <View className="h-[3px] w-full rounded-sm bg-red-600" />
      </View>

      {/* Piano keyboard (keys highlight in every mode) */}
      <View style={{ height: keyboardHeight }} className="mb-3">
        <PianoKeyboard
          activeNotes={studio.activeNotes}
          sustainedNotes={studio.sustainedNotes}
          onKeyDown={studio.startNote}
          onKeyUp={studio.stopNote}
        />
      </View>
    </SafeAreaView>
  );
}