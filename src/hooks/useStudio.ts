import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Note, Region } from '../core/domain/types';
import type { MidiAdapter, MidiMessage } from '../core/midi/MidiAdapter';
import { decodeMessage, noteOffBytes, noteOnBytes } from '../core/midi/messages';
import { commitOverdub, commitReplace } from '../core/recording/commitModes';
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

export type RecordMode = 'overdub' | 'replace';

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
  /** 1-based quarter-note beat under the cursor (metronome, off by default). */
  beat: number;
  metronomeEnabled: boolean;
  toggleMetronome: () => void;
  recordMode: RecordMode;
  setRecordMode: (mode: RecordMode) => void;

  // Transport actions
  play: () => void;
  stop: () => void;
  record: () => void;
  seek: (tick: number) => void;
  setTempo: (tempo: number) => void;

  // Take (single region)
  region: Region | null;
  /** Notes captured by the in-progress take, shown while recording. */
  liveNotes: Note[];
  clearRegion: () => void;

  // Region editing
  moveRegionBy: (deltaTick: number) => void;
  trimRegionStartBy: (deltaTick: number) => void;
  trimRegionEndBy: (deltaTick: number) => void;
  resizeRegionBy: (deltaTick: number) => void;

  /** Plays a note on the open device (MIDI out) with local visual feedback. */
  sendNote: (pitch: number, velocity?: number) => void;
}

function clockNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function union(a: Set<number>, b: Set<number>): Set<number> {
  if (b.size === 0) return a;
  if (a.size === 0) return b;
  const next = new Set(a);
  for (const value of b) next.add(value);
  return next;
}

/**
 * Orchestrates MIDI I/O, the transport clock, live recording (overdub/replace),
 * playback over MIDI out and region editing. Composes `useMidi` (device + live
 * note state) with the pure core modules.
 *
 * Note: the metronome has no audio engine — it exposes a beat counter the UI can
 * pulse. Off by default.
 */
export function useStudio(options: UseStudioOptions = {}): UseStudioResult {
  const handleMidiMessageRef = useRef<(message: MidiMessage) => void>(() => {});
  const midi = useMidi({ adapter: options.midiAdapter, onMidiMessage: (m) => handleMidiMessageRef.current(m) });

  const [transport] = useState(() => createTransport({}));
  const [player] = useState(() => new MidiOutPlayer());

  const [transportState, setTransportState] = useState<TransportState>('stopped');
  const [position, setPosition] = useState(0);
  const [tempo, setTempoState] = useState(transport.tempo);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [recordMode, setRecordMode] = useState<RecordMode>('overdub');
  const [region, setRegion] = useState<Region | null>(null);
  const [liveNotes, setLiveNotes] = useState<Note[]>([]);
  const [localPressed, setLocalPressed] = useState<Set<number>>(() => new Set());

  const anchorRef = useRef<{ ms: number; tick: number } | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const regionRef = useRef<Region | null>(null);
  const recordModeRef = useRef<RecordMode>(recordMode);
  const sendMessageRef = useRef(midi.sendMessage);

  useEffect(() => {
    regionRef.current = region;
  }, [region]);
  useEffect(() => {
    recordModeRef.current = recordMode;
  }, [recordMode]);
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
        session.onNoteOn(decoded.pitch, decoded.velocity, currentTick());
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

  const commitTake = useCallback((incoming: Note[], rangeStart: number, rangeEnd: number) => {
    setRegion((prev) => {
      const existing = prev?.notes ?? [];
      const notes =
        recordModeRef.current === 'replace'
          ? commitReplace(existing, incoming, rangeStart, rangeEnd)
          : commitOverdub(existing, incoming);
      const maxEnd = notes.reduce((acc, n) => Math.max(acc, n.startTick + n.durationTick), 0);
      return {
        id: prev?.id ?? 'region-1',
        trackId: prev?.trackId ?? 'track-1',
        startTick: 0,
        lengthTick: Math.max(1, maxEnd, rangeEnd),
        notes,
      };
    });
  }, []);

  const play = useCallback(() => {
    const t = transport;
    const current = regionRef.current;
    if (current !== null) {
      player.schedule(
        offsetNotesForPlayback(current.notes, t.position),
        t.tempo,
        t.ppq,
        sendVia,
      );
    }
    t.play();
    reanchor();
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
      setLiveNotes([]);
      commitTake(notes, session.startTick, endTick);
    }
    t.stop();
    setTransportState(t.state);
    setPosition(t.position);
  }, [commitTake, currentTick, player, transport]);

  const seek = useCallback(
    (tick: number) => {
      const t = transport;
      t.seek(tick);
      if (t.isPlaying) {
        player.cancel();
        const current = regionRef.current;
        if (current !== null) {
          player.schedule(offsetNotesForPlayback(current.notes, t.position), t.tempo, t.ppq, sendVia);
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

  const toggleMetronome = useCallback(() => {
    setMetronomeEnabled((prev) => !prev);
  }, []);

  const clearRegion = useCallback(() => {
    setRegion(null);
  }, []);

  const moveRegionBy = useCallback((deltaTick: number) => {
    setRegion((prev) => (prev === null ? prev : moveRegion(prev, deltaTick)));
  }, []);

  const trimRegionStartBy = useCallback((deltaTick: number) => {
    setRegion((prev) => (prev === null ? prev : trimRegionStart(prev, prev.startTick + deltaTick)));
  }, []);

  const trimRegionEndBy = useCallback((deltaTick: number) => {
    setRegion((prev) => (prev === null ? prev : trimRegionEnd(prev, regionEndTick(prev) + deltaTick)));
  }, []);

  const resizeRegionBy = useCallback((deltaTick: number) => {
    setRegion((prev) => (prev === null ? prev : resizeRegion(prev, prev.lengthTick + deltaTick)));
  }, []);

  const sendNote = useCallback(
    (pitch: number, velocity: number = DEFAULT_VELOCITY) => {
      sendVia(noteOnBytes(pitch, velocity));
      setLocalPressed((prev) => {
        const next = new Set(prev);
        next.add(pitch);
        return next;
      });
      setTimeout(() => {
        sendVia(noteOffBytes(pitch));
        setLocalPressed((prev) => {
          if (!prev.has(pitch)) return prev;
          const next = new Set(prev);
          next.delete(pitch);
          return next;
        });
      }, TAP_DURATION_MS);
    },
    [sendVia],
  );

  const activeNotes = useMemo(
    () => union(midi.activeNotes, localPressed),
    [midi.activeNotes, localPressed],
  );

  const beat = Math.floor(position / transport.ppq) + 1;

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
    beat,
    metronomeEnabled,
    toggleMetronome,
    recordMode,
    setRecordMode,

    play,
    stop,
    record,
    seek,
    setTempo,

    region,
    liveNotes,
    clearRegion,

    moveRegionBy,
    trimRegionStartBy,
    trimRegionEndBy,
    resizeRegionBy,

    sendNote,
  };
}
