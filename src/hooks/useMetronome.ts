import { useCallback, useEffect, useRef, useState } from 'react';

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

export interface UseMetronomeOptions {
  /** Transport tempo in BPM; drives the free-run period and the playing sync. */
  tempo: number;
  /** True while the transport is running; beats then follow `position`. */
  isPlaying: boolean;
  /** Transport position in ticks. */
  position: number;
  /** Ticks per quarter note. */
  ppq: number;
  /** Whether the metronome click is on (controlled by the caller). */
  enabled: boolean;
  /** Requests a new enabled value (the caller owns the state). */
  onEnabledChange: (enabled: boolean) => void;
  /** Beats per measure (1..8); the accent falls on the first. */
  timeSignature: number;
  /** Requests a new time signature (the caller owns the state). */
  onTimeSignatureChange: (value: number) => void;
}

export interface UseMetronomeResult {
  enabled: boolean;
  /** Beat number of the last pulse, wrapping 1..timeSignature each measure. */
  beat: number;
  /** Beats per measure (1..8); the accent falls on the first. */
  timeSignature: number;
  toggle: () => void;
  setTimeSignature: (value: number) => void;
}

const DEFAULT_TEMPO = 120;

/**
 * Controlled metronome: the caller owns the enabled / time-signature
 * state and passes them in; this hook owns only the beat display and the audio
 * engine (accent + click).
 *
 * - Stopped (`!isPlaying`): free-runs on its own timer at `60000 / tempo` ms,
 *   starting on the downbeat (beat 1, accent).
 * - Playing: beats are derived from the transport `position`
 *   (`floor(position / ppq)`), so the clicks stay locked to the recording tempo.
 *
 * Degrades to visual-only when audio is unavailable (e.g. web without assets).
 */
export function useMetronome({
  tempo,
  isPlaying,
  position,
  ppq,
  enabled,
  onEnabledChange,
  timeSignature,
  onTimeSignatureChange,
}: UseMetronomeOptions): UseMetronomeResult {
  const [beat, setBeat] = useState(1);

  const accentPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const clickPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  // True once the async audio setup has run; `playClick` no-ops until then.
  const audioReadyRef = useRef(false);

  // Latest inputs, read inside timers without re-arming them.
  const tempoRef = useRef(tempo);
  const timeSignatureRef = useRef(timeSignature);
  // Last beat index already fired (free-run or derived from position).
  const lastIndexRef = useRef<number | null>(null);
  // Invalidates stale timer callbacks across effect runs (e.g. StrictMode remounts).
  const generationRef = useRef(0);

  useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);
  useEffect(() => {
    timeSignatureRef.current = timeSignature;
  }, [timeSignature]);

  const playClick = useCallback(async (accent: boolean) => {
    // Audio not set up yet, or this player failed to load: stay silent. The
    // caller still advances the beat, so the metronome remains visual-only.
    if (!audioReadyRef.current) return;
    const player = accent ? accentPlayerRef.current : clickPlayerRef.current;
    if (player === null || !player.isLoaded) return;
    try {
      await player.seekTo(0);
      player.play();
    } catch {
      // Audio unavailable: metronome stays visual-only.
    }
  }, []);

  // Audio engine: two click sounds (accent + non-accent), created once.
  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      // Configure the audio session before any player touches the OS.
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
      } catch {
        // Audio mode unavailable: the players below may still work.
      }
      if (cancelled) return;

      // Each player is created in its own try block so one failure does not
      // disable the other; a missing player simply degrades to visual-only.
      let accent: ReturnType<typeof createAudioPlayer> | null = null;
      let click: ReturnType<typeof createAudioPlayer> | null = null;
      try {
        accent = createAudioPlayer(require('../../assets/sounds/accent.wav'));
      } catch {
        accent = null;
      }
      try {
        click = createAudioPlayer(require('../../assets/sounds/click.wav'));
      } catch {
        click = null;
      }
      if (cancelled) {
        try { accent?.remove(); } catch { /* noop */ }
        try { click?.remove(); } catch { /* noop */ }
        return;
      }
      accentPlayerRef.current = accent;
      clickPlayerRef.current = click;
      audioReadyRef.current = true;
    };

    void setup();

    return () => {
      cancelled = true;
      try { accentPlayerRef.current?.remove(); } catch { /* noop */ }
      try { clickPlayerRef.current?.remove(); } catch { /* noop */ }
      accentPlayerRef.current = null;
      clickPlayerRef.current = null;
      audioReadyRef.current = false;
    };
  }, []);

  // Forget the last beat on any play/enable transition so the incoming mode's
  // first pulse fires exactly once (no duplicates, no missed downbeat).
  useEffect(() => {
    lastIndexRef.current = null;
  }, [enabled, isPlaying]);

  // Free-run while enabled and stopped: own timer adapting to the current tempo.
  // The downbeat (beat 1, accent) fires immediately (0 ms), then every
  // `60000 / tempo` ms. All pulses run from the timer callback, never
  // synchronously in the effect body. The generation token invalidates any
  // stale callback left over from a previous run (e.g. StrictMode remounts),
  // so the downbeat never double-fires.
  useEffect(() => {
    const generation = ++generationRef.current;
    if (!enabled || isPlaying) return;
    let index = -1;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const bpm = tempoRef.current > 0 ? tempoRef.current : DEFAULT_TEMPO;
      const delay = index < 0 ? 0 : 60000 / bpm;
      timer = setTimeout(() => {
        if (generationRef.current !== generation) return;
        index += 1;
        lastIndexRef.current = index;
        void playClick(index % timeSignatureRef.current === 0);
        setBeat((index % timeSignatureRef.current) + 1);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [enabled, isPlaying, playClick]);

  // While playing, derive the beat from the transport position (single clock).
  useEffect(() => {
    if (!enabled || !isPlaying) return;
    const index = ppq > 0 ? Math.floor(position / ppq) : 0;
    if (lastIndexRef.current === index) return;
    lastIndexRef.current = index;
    void playClick(index % timeSignatureRef.current === 0);
    setBeat((index % timeSignatureRef.current) + 1);
  }, [enabled, isPlaying, position, ppq, playClick]);

  const toggle = useCallback(() => {
    onEnabledChange(!enabled);
  }, [enabled, onEnabledChange]);

  const setTimeSignature = useCallback(
    (value: number) => {
      onTimeSignatureChange(value);
    },
    [onTimeSignatureChange],
  );

  return { enabled, beat, timeSignature, toggle, setTimeSignature };
}
