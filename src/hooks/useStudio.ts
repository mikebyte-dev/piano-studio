import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Note, Region } from '../core/domain/types';
import type { MidiAdapter, MidiMessage } from '../core/midi/MidiAdapter';
import { decodeMessage, noteOffBytes, noteOnBytes } from '../core/midi/messages';
import { commitTake } from '../core/recording/commitTake';
import { MidiOutPlayer, offsetNotesForPlayback } from '../core/recording/MidiOutPlayer';
import {
  moveRegion,
  regionEndTick,
  resizeRegion,
  trimRegionEnd,
  trimRegionStart,
} from '../core/recording/regionEditing';
import { RecordingSession } from '../core/recording/RecordingSession';
import { createTransport, msToTick, type TransportState } from '../core/recording/Transport';
import { useMidi, type UseMidiResult } from './useMidi';

/** Beats-per-measure range accepted by the time-signature control. */
const TIME_SIGNATURE_MIN = 1;
const TIME_SIGNATURE_MAX = 8;

const DEFAULT_VELOCITY = 100;
/** How long an on-screen key tap keeps the note down (ms). */
const TAP_DURATION_MS = 300;
const CLOCK_INTERVAL_MS = 33;

export interface UseStudioOptions {
  /** Adapter injected into `useMidi` (defaults to the real one). */
  midiAdapter?: MidiAdapter;
}

export interface UseStudioResult {
  // MIDI / device
  supported: boolean;
  devices: UseMidiResult['devices'];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  isOpen: boolean;
  error: string | null;
  lastMessage: UseMidiResult['lastMessage'];
  refreshDevices: UseMidiResult['refreshDevices'];
  connect: UseMidiResult['connect'];
  disconnect: UseMidiResult['disconnect'];

  // Live notes
  activeNotes: Set<number>;
  sustainedNotes: Set<number>;
  sustainDown: boolean;

  // Transport
  transportState: TransportState;
  position: number;
  tempo: number;
  ppq: number;
  /** Color applied to notes captured by the next recording. */
  recordingColor: string;
  setRecordingColor: (color: string) => void;

  // Metronome
  /** Whether the metronome click is audible. */
  metronomeEnabled: boolean;
  setMetronomeEnabled: (enabled: boolean) => void;
  /** Beats per measure (1..8); the accent falls on the first. */
  timeSignature: number;
  setTimeSignature: (value: number) => void;

  // Transport actions
  play: () => void;
  stop: () => void;
  record: () => void;
  seek: (tick: number) => void;
  setTempo: (tempo: number) => void;

  // Takes (multiple independent recordings)
  /** Every committed take, in recording order. */
  regions: Region[];
  /** Id of the region editing actions target; `null` falls back to the last region. */
  selectedRegionId: string | null;
  setSelectedRegionId: (id: string | null) => void;
  /** Backward-compatible alias for the most recently committed region. */
  region: Region | null;
  /** Notes captured by the in-progress take, shown while recording. */
  liveNotes: Note[];
  /** Every recorded note (all regions flattened) plus the in-progress take. */
  recordedNotes: Note[];
  /** Removes the region with the given id; keeps the selection valid. */
  deleteRegion: (id: string) => void;

  // Region editing
  moveRegionBy: (deltaTick: number) => void;
  trimRegionStartBy: (deltaTick: number) => void;
  trimRegionEndBy: (deltaTick: number) => void;
  resizeRegionBy: (deltaTick: number) => void;
  /** Sets the display color of the region with the given id. */
  setRegionColor: (id: string, color: string) => void;

  /** Plays a note on the open device (MIDI out) with local visual feedback. */
  sendNote: (pitch: number, velocity?: number) => void;
  /** Presses and sustains a note until `stopNote` (press-in/out keyboard). */
  startNote: (pitch: number, velocity?: number) => void;
  /** Releases a note previously pressed with `startNote`. */
  stopNote: (pitch: number) => void;
}

function clockNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Applies `updater` to the selected region (or the last one when nothing is
 * selected / the id is unknown), returning a new array. Pure.
 */
function mapSelectedRegion(
  regions: Region[],
  selectedRegionId: string | null,
  updater: (region: Region) => Region,
): Region[] {
  if (regions.length === 0) return regions;
  const found = selectedRegionId === null ? -1 : regions.findIndex((r) => r.id === selectedRegionId);
  const target = found === -1 ? regions.length - 1 : found;
  const next = [...regions];
  next[target] = updater(regions[target]);
  return next;
}

/**
 * Orchestrates MIDI I/O, the transport clock, live recording, playback over
 * MIDI out and region editing. Composes `useMidi` (device + live note state)
 * with the pure core modules.
 *
 * Each finished take is committed as an independent `Region` by the pure
 * `commitTake` (`src/core/recording/commitTake.ts`); empty takes create no
 * region. Editing actions target the selected region, defaulting to the most
 * recent one.
 *
 * The metronome is not part of this hook: it lives in `useMetronome`.
 */
export function useStudio(options: UseStudioOptions = {}): UseStudioResult {
  const handleMidiMessageRef = useRef<(message: MidiMessage) => void>(() => {});
  const midi = useMidi({ adapter: options.midiAdapter, onMidiMessage: (m) => handleMidiMessageRef.current(m) });

  const [transport] = useState(() => createTransport({}));
  const [player] = useState(() => new MidiOutPlayer());

  const [transportState, setTransportState] = useState<TransportState>('stopped');
  const [position, setPosition] = useState(0);
  const [tempo, setTempoState] = useState(transport.tempo);
  const [recordingColor, setRecordingColor] = useState('#22c55e');
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [timeSignature, setTimeSignatureState] = useState(4);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [liveNotes, setLiveNotes] = useState<Note[]>([]);
  const [localPressed, setLocalPressed] = useState<Set<number>>(() => new Set());

  const anchorRef = useRef<{ ms: number; tick: number } | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const regionsRef = useRef<Region[]>([]);
  const regionCounterRef = useRef(0);
  const recordingColorRef = useRef<string>(recordingColor);
  const sendMessageRef = useRef(midi.sendMessage);
  // Reference count of currently-held on-screen pitches. Overlapping presses on
  // the same pitch (re-press before release, duplicated pointer events) must not
  // release the note until the last press has ended, so `stopNote` only drops the
  // pitch from `localPressed` once its count returns to zero.
  const pressCountRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);
  useEffect(() => {
    recordingColorRef.current = recordingColor;
  }, [recordingColor]);
  useEffect(() => {
    sendMessageRef.current = midi.sendMessage;
  }, [midi.sendMessage]);

  const sendVia = useCallback((bytes: number[]) => {
    void sendMessageRef.current(bytes);
  }, []);

  const reanchor = useCallback(() => {
    const t = transport;
    anchorRef.current = { ms: clockNow(), tick: t.position };
  }, [transport]);

  /** Precise position (ticks) at the wall-clock instant a message arrives. */
  const currentTick = useCallback((): number => {
    const t = transport;
    if (!t.isPlaying) return t.position;
    const anchor = anchorRef.current;
    if (anchor === null) return t.position;
    return anchor.tick + msToTick(clockNow() - anchor.ms, t.tempo, t.ppq);
  }, [transport]);

  // Record inbound events into the active take.
  const handleMidiMessage = useCallback(
    (message: MidiMessage) => {
      const session = sessionRef.current;
      if (session === null) return;
      const decoded = decodeMessage(message.data);
      if (decoded === null) return;
      if (decoded.type === 'noteOn') {
        session.onNoteOn(decoded.pitch, decoded.velocity, currentTick(), recordingColorRef.current);
      } else if (decoded.type === 'noteOff') {
        session.onNoteOff(decoded.pitch, currentTick());
      }
    },
    [currentTick],
  );

  useEffect(() => {
    handleMidiMessageRef.current = handleMidiMessage;
  }, [handleMidiMessage]);

  // Transport clock: advances the position and refreshes the live take.
  useEffect(() => {
    if (transportState === 'stopped') return;
    const t = transport;
    anchorRef.current = { ms: clockNow(), tick: t.position };
    const timer = setInterval(() => {
      const anchor = anchorRef.current;
      if (anchor === null) return;
      const target = anchor.tick + msToTick(clockNow() - anchor.ms, t.tempo, t.ppq);
      const delta = target - t.position;
      if (delta > 0) t.advance(delta);
      setPosition(t.position);
      const session = sessionRef.current;
      if (t.isRecording && session !== null) {
        setLiveNotes(session.snapshot(t.position));
      }
    }, CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [transportState, transport]);

  const play = useCallback(() => {
    const t = transport;
    // Play always starts from the beginning of the recorded take.
    t.seek(0);
    const notes = regionsRef.current.flatMap((region) => region.notes);
    if (notes.length > 0) {
      player.schedule(offsetNotesForPlayback(notes, 0), t.tempo, t.ppq, sendVia);
    }
    t.play();
    reanchor();
    setPosition(t.position);
    setTransportState(t.state);
  }, [player, reanchor, sendVia, transport]);

  const record = useCallback(() => {
    const t = transport;
    player.cancel();
    sessionRef.current = new RecordingSession({
      startTick: t.position,
      tempo: t.tempo,
      ppq: t.ppq,
    });
    setLiveNotes([]);
    t.record();
    reanchor();
    setTransportState(t.state);
  }, [player, reanchor, transport]);

  const stop = useCallback(() => {
    const t = transport;
    player.cancel(); // clears playback timers + sends all-notes-off
    const session = sessionRef.current;
    if (session !== null) {
      const endTick = currentTick();
      const notes = session.stop(endTick);
      sessionRef.current = null;
      // Empty take -> commitTake returns null: no region, no regionIndex consumed.
      const region = commitTake(
        notes,
        session.startTick,
        recordingColorRef.current,
        regionCounterRef.current + 1,
      );
      if (region !== null) {
        regionCounterRef.current += 1;
        setRegions((prev) => [...prev, region]);
        setSelectedRegionId(region.id);
      }
    }
    t.stop();
    t.seek(0);
    player.cancel();
    midi.resetNotes();
    setLocalPressed(new Set());
    pressCountRef.current.clear();
    setLiveNotes([]);
    setTransportState(t.state);
    setPosition(0);
  }, [currentTick, midi, player, transport]);

  const seek = useCallback(
    (tick: number) => {
      const t = transport;
      t.seek(tick);
      if (t.isPlaying) {
        player.cancel();
        const notes = regionsRef.current.flatMap((region) => region.notes);
        if (notes.length > 0) {
          player.schedule(offsetNotesForPlayback(notes, t.position), t.tempo, t.ppq, sendVia);
        }
      }
      reanchor();
      setPosition(t.position);
    },
    [player, reanchor, sendVia, transport],
  );

  const setTempo = useCallback(
    (value: number) => {
      try {
        transport.setTempo(value);
      } catch {
        return; // invalid tempo: keep the previous value
      }
      reanchor();
      setTempoState(transport.tempo);
    },
    [reanchor, transport],
  );

  /** Clamps to 1..8 (beats per measure). */
  const setTimeSignature = useCallback((value: number) => {
    const n = Math.max(TIME_SIGNATURE_MIN, Math.min(TIME_SIGNATURE_MAX, Math.round(value)));
    setTimeSignatureState(n);
  }, []);

  const deleteRegion = useCallback(
    (id: string) => {
      const remaining = regions.filter((region) => region.id !== id);
      setRegions(remaining);
      if (selectedRegionId === id) {
        setSelectedRegionId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      }
    },
    [regions, selectedRegionId],
  );

  const moveRegionBy = useCallback(
    (deltaTick: number) => {
      setRegions((prev) => mapSelectedRegion(prev, selectedRegionId, (r) => moveRegion(r, deltaTick)));
    },
    [selectedRegionId],
  );

  const trimRegionStartBy = useCallback(
    (deltaTick: number) => {
      setRegions((prev) =>
        mapSelectedRegion(prev, selectedRegionId, (r) => trimRegionStart(r, r.startTick + deltaTick)),
      );
    },
    [selectedRegionId],
  );

  const trimRegionEndBy = useCallback(
    (deltaTick: number) => {
      setRegions((prev) =>
        mapSelectedRegion(prev, selectedRegionId, (r) => trimRegionEnd(r, regionEndTick(r) + deltaTick)),
      );
    },
    [selectedRegionId],
  );

  const resizeRegionBy = useCallback(
    (deltaTick: number) => {
      setRegions((prev) =>
        mapSelectedRegion(prev, selectedRegionId, (r) => resizeRegion(r, r.lengthTick + deltaTick)),
      );
    },
    [selectedRegionId],
  );

  /** Sets the display color of the region with the given id. */
  const setRegionColor = useCallback((id: string, color: string) => {
    setRegions((prev) => prev.map((region) => (region.id === id ? { ...region, color } : region)));
  }, []);

  const tapTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const sendNote = useCallback(
    (pitch: number, velocity: number = DEFAULT_VELOCITY) => {
      // Clear any pending note-off for this pitch so re-taps don't stack timers.
      const existing = tapTimersRef.current.get(pitch);
      if (existing) clearTimeout(existing);
      sendVia(noteOnBytes(pitch, velocity));
      // Feed the active recording session so mouse/screen taps are captured.
      // `sessionRef` is null unless a recording is in progress, so notes played
      // before pressing RECORD are never captured.
      const session = sessionRef.current;
      if (session !== null) {
        session.onNoteOn(pitch, velocity, currentTick(), recordingColorRef.current);
      }
      setLocalPressed((prev) => {
        const next = new Set(prev);
        next.add(pitch);
        return next;
      });
      const timer = setTimeout(() => {
        sendVia(noteOffBytes(pitch));
        const activeSession = sessionRef.current;
        if (activeSession !== null) {
          activeSession.onNoteOff(pitch, currentTick());
        }
        setLocalPressed((prev) => {
          if (!prev.has(pitch)) return prev;
          const next = new Set(prev);
          next.delete(pitch);
          return next;
        });
        tapTimersRef.current.delete(pitch);
      }, TAP_DURATION_MS);
      tapTimersRef.current.set(pitch, timer);
    },
    [currentTick, sendVia],
  );

  /**
   * Presses a note and sustains it until `stopNote` is called (press-in/out on
   * the on-screen keyboard). Feeds the active recording session while recording.
   */
  const startNote = useCallback(
    (pitch: number, velocity: number = DEFAULT_VELOCITY) => {
      // A sustained press supersedes any pending auto-release tap for this pitch.
      const existing = tapTimersRef.current.get(pitch);
      if (existing) {
        clearTimeout(existing);
        tapTimersRef.current.delete(pitch);
      }
      sendVia(noteOnBytes(pitch, velocity));
      const session = sessionRef.current;
      if (session !== null) {
        session.onNoteOn(pitch, velocity, currentTick(), recordingColorRef.current);
      }
      // Reference-count the press so an overlapping release on the same pitch
      // cannot drop it from `localPressed` while another press is still active.
      pressCountRef.current.set(pitch, (pressCountRef.current.get(pitch) ?? 0) + 1);
      // Always create a new Set (idempotent add) so every press yields a
      // state update, even when the pitch was already held.
      setLocalPressed((prev) => {
        const next = new Set(prev);
        next.add(pitch);
        return next;
      });
    },
    [currentTick, sendVia],
  );

  /** Releases a note previously pressed with `startNote`. */
  const stopNote = useCallback(
    (pitch: number) => {
      // Decrement the press count (floor at 0). A pitch still held by another
      // press stays in `localPressed` and fires no release side effects; only
      // the last release actually stops the note.
      const remaining = Math.max(0, (pressCountRef.current.get(pitch) ?? 0) - 1);
      if (remaining > 0) {
        pressCountRef.current.set(pitch, remaining);
        return;
      }
      pressCountRef.current.delete(pitch);

      // Last press released: now perform the real note-off side effects.
      const existing = tapTimersRef.current.get(pitch);
      if (existing) {
        clearTimeout(existing);
        tapTimersRef.current.delete(pitch);
      }
      sendVia(noteOffBytes(pitch));
      const session = sessionRef.current;
      if (session !== null) {
        session.onNoteOff(pitch, currentTick());
      }
      setLocalPressed((prev) => {
        if (!prev.has(pitch)) return prev;
        const next = new Set(prev);
        next.delete(pitch);
        return next;
      });
    },
    [currentTick, sendVia],
  );

  // Clear pending on-screen tap timers on unmount to avoid stuck notes.
  useEffect(() => {
    const timers = tapTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      player.cancel();
    };
  }, [player]);

  // Always produce a brand-new Set so the value identity changes whenever
  // either input changes; never return an input reference (keeps consumers
  // that rely on reference identity to re-render reactive).
  const activeNotes = useMemo(
    () => new Set([...midi.activeNotes, ...localPressed]),
    [midi.activeNotes, localPressed],
  );

  /** All recorded notes across every take, plus the in-progress take. */
  const recordedNotes = useMemo(
    () => [
      ...regions.flatMap((region) => region.notes.map((n) => ({ ...n, color: region.color ?? n.color }))),
      ...liveNotes,
    ],
    [regions, liveNotes],
  );

  /** Backward-compatible alias: the most recently committed region. */
  const region = regions.length > 0 ? regions[regions.length - 1] : null;

  return {
    supported: midi.supported,
    devices: midi.devices,
    selectedId: midi.selectedId,
    setSelectedId: midi.setSelectedId,
    isOpen: midi.isOpen,
    error: midi.error,
    lastMessage: midi.lastMessage,
    refreshDevices: midi.refreshDevices,
    connect: midi.connect,
    disconnect: midi.disconnect,

    activeNotes,
    sustainedNotes: midi.sustainedNotes,
    sustainDown: midi.sustainDown,

    transportState,
    position,
    tempo,
    ppq: transport.ppq,
    recordingColor,
    setRecordingColor,

    metronomeEnabled,
    setMetronomeEnabled,
    timeSignature,
    setTimeSignature,

    play,
    stop,
    record,
    seek,
    setTempo,

    region,
    regions,
    selectedRegionId,
    setSelectedRegionId,
    liveNotes,
    recordedNotes,
    deleteRegion,

    moveRegionBy,
    trimRegionStartBy,
    trimRegionEndBy,
    resizeRegionBy,
    setRegionColor,

    sendNote,
    startNote,
    stopNote,
  };
}
