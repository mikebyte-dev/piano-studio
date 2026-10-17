import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MidiAndroidAdapter } from '../core/midi/MidiAndroidAdapter';
import type { MidiAdapter, MidiDevice, MidiMessage } from '../core/midi/MidiAdapter';
import { decodeMessage } from '../core/midi/messages';

export interface UseMidiOptions {
  /** Adapter to use. Defaults to the real `midi-android` adapter (injectable for tests). */
  adapter?: MidiAdapter;
  /** Optional observer of every raw inbound message (used by the recording layer). */
  onMidiMessage?: (message: MidiMessage) => void;
}

export interface UseMidiResult {
  /** Whether the platform reports MIDI support. */
  supported: boolean;
  devices: MidiDevice[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  /** A device is currently open. */
  isOpen: boolean;
  /** Pitches currently held down. */
  activeNotes: Set<number>;
  /** Pitches released while the sustain pedal was down. */
  sustainedNotes: Set<number>;
  /** Sustain pedal (CC 64) state. */
  sustainDown: boolean;
  error: string | null;
  lastMessage: MidiMessage | null;

  refreshDevices: () => Promise<MidiDevice[]>;
  /** Opens the device for input AND output (ports 0/0). */
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sends raw MIDI bytes to the open device (MIDI out). */
  sendMessage: (bytes: number[]) => Promise<void>;
  /** Clears live note/sustain state (e.g. on stop/panic). */
  resetNotes: () => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * React binding over a `MidiAdapter`.
 *
 * Owns device enumeration, connection state and live note state. Inbound note
 * on/off messages update `activeNotes`; a release while the sustain pedal is
 * down moves the pitch to `sustainedNotes`, and lifting the pedal clears it.
 */
export function useMidi(options: UseMidiOptions = {}): UseMidiResult {
  const adapter = useMemo<MidiAdapter>(
    () => options.adapter ?? new MidiAndroidAdapter(),
    [options.adapter],
  );

  const onMidiMessageRef = useRef(options.onMidiMessage);
  useEffect(() => {
    onMidiMessageRef.current = options.onMidiMessage;
  }, [options.onMidiMessage]);

  const [supported] = useState(() => adapter.isSupported());
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set());
  const [sustainedNotes, setSustainedNotes] = useState<Set<number>>(() => new Set());
  const [sustainDown, setSustainDown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<MidiMessage | null>(null);

  // Refs mirror the values the long-lived listeners must read without re-subscribing.
  const sustainDownRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refreshDevices = useCallback(async (): Promise<MidiDevice[]> => {
    try {
      const list = await adapter.listDevices();
      setDevices(list);
      setError(null);
      return list;
    } catch (err) {
      setError(toMessage(err));
      return [];
    }
  }, [adapter]);

  const connect = useCallback(
    async (deviceId: string): Promise<void> => {
      try {
        setError(null);
        // Ports 0/0 keep both input and output enabled.
        await adapter.openDevice(deviceId, 0, 0);
        setSelectedId(deviceId);
        setIsOpen(true);
        setActiveNotes(new Set());
        setSustainedNotes(new Set());
      } catch (err) {
        setIsOpen(false);
        setError(toMessage(err));
      }
    },
    [adapter],
  );

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await adapter.closeDevice();
    } catch (err) {
      setError(toMessage(err));
    }
    sustainDownRef.current = false;
    setIsOpen(false);
    setActiveNotes(new Set());
    setSustainedNotes(new Set());
    setSustainDown(false);
  }, [adapter]);

  const sendMessage = useCallback(
    async (bytes: number[]): Promise<void> => {
      try {
        await adapter.sendMessage(bytes);
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [adapter],
  );

  const resetNotes = useCallback(() => {
    sustainDownRef.current = false;
    setActiveNotes(new Set());
    setSustainedNotes(new Set());
    setSustainDown(false);
  }, []);

  // Initial device enumeration (deferred to avoid synchronous setState in effect).
  useEffect(() => {
    const handle = setTimeout(() => {
      void refreshDevices();
    }, 0);
    return () => clearTimeout(handle);
  }, [adapter, refreshDevices]);

  // Inbound messages -> live note / sustain state.
  useEffect(() => {
    return adapter.onMessage((message) => {
      setLastMessage(message);
      onMidiMessageRef.current?.(message);

      const decoded = decodeMessage(message.data);
      if (decoded === null) return;

      if (decoded.type === 'noteOn') {
        const pitch = decoded.pitch;
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.add(pitch);
          return next;
        });
        setSustainedNotes((prev) => {
          if (!prev.has(pitch)) return prev;
          const next = new Set(prev);
          next.delete(pitch);
          return next;
        });
        return;
      }

      if (decoded.type === 'noteOff') {
        const pitch = decoded.pitch;
        setActiveNotes((prev) => {
          if (!prev.has(pitch)) return prev;
          const next = new Set(prev);
          next.delete(pitch);
          return next;
        });
        if (sustainDownRef.current) {
          setSustainedNotes((prev) => {
            const next = new Set(prev);
            next.add(pitch);
            return next;
          });
        }
        return;
      }

      if (decoded.type === 'sustain') {
        if (decoded.down) {
          sustainDownRef.current = true;
          setSustainDown(true);
        } else {
          sustainDownRef.current = false;
          setSustainDown(false);
          setSustainedNotes((prev) => (prev.size === 0 ? prev : new Set()));
        }
      }
    });
  }, [adapter]);

  // Device removal -> drop the open device and surface an error.
  useEffect(() => {
    return adapter.onDeviceRemoved((deviceId) => {
      if (selectedIdRef.current !== deviceId) return;
      void adapter.closeDevice().catch(() => undefined);
      sustainDownRef.current = false;
      setIsOpen(false);
      setActiveNotes(new Set());
      setSustainedNotes(new Set());
      setSustainDown(false);
      setError(`Device disconnected: ${deviceId}`);
    });
  }, [adapter]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      void adapter.closeDevice().catch(() => undefined);
    };
  }, [adapter]);

  return {
    supported,
    devices,
    selectedId,
    setSelectedId,
    isOpen,
    activeNotes,
    sustainedNotes,
    sustainDown,
    error,
    lastMessage,
    refreshDevices,
    connect,
    disconnect,
    sendMessage,
    resetNotes,
  };
}
