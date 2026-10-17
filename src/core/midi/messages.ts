/**
 * Small MIDI 1.0 helpers: encode the few messages the app sends, and decode the
 * channel messages it reacts to (notes and the sustain pedal / CC 64).
 *
 * `midi-android` already ships a full parser (`parseMidi`) and a note tracker,
 * but this visualizer only needs these handful of cases, so it stays decoupled.
 */

/** Sustain pedal controller number. */
export const SUSTAIN_CONTROLLER = 64;
/** Value at/above which the sustain pedal counts as pressed. */
export const SUSTAIN_PRESSED_THRESHOLD = 64;

export interface NoteMessage {
  type: 'noteOn' | 'noteOff';
  channel: number;
  pitch: number;
  velocity: number;
}

export interface SustainMessage {
  type: 'sustain';
  channel: number;
  down: boolean;
}

export interface OtherMessage {
  type: 'other';
  status: number;
}

export type DecodedMessage = NoteMessage | SustainMessage | OtherMessage;

/**
 * Decodes the channel messages the visualizer cares about. Returns `null` for
 * messages with too few bytes. Unhandled statuses come back as `'other'`.
 */
export function decodeMessage(data: number[]): DecodedMessage | null {
  if (data.length < 2) return null;

  const status = data[0] ?? 0;
  const data1 = data[1] ?? 0;

  if (status >= 0x80 && status <= 0x8f) {
    return { type: 'noteOff', channel: status & 0x0f, pitch: data1, velocity: data[2] ?? 0 };
  }
  if (status >= 0x90 && status <= 0x9f) {
    const velocity = data[2] ?? 0;
    // Note On with velocity 0 is a Note Off.
    return {
      type: velocity > 0 ? 'noteOn' : 'noteOff',
      channel: status & 0x0f,
      pitch: data1,
      velocity,
    };
  }
  if (status >= 0xb0 && status <= 0xbf && data1 === SUSTAIN_CONTROLLER) {
    return {
      type: 'sustain',
      channel: status & 0x0f,
      down: (data[2] ?? 0) >= SUSTAIN_PRESSED_THRESHOLD,
    };
  }
  return { type: 'other', status };
}

export function noteOnBytes(pitch: number, velocity = 100, channel = 0): number[] {
  return [0x90 | (channel & 0x0f), pitch & 0x7f, velocity & 0x7f];
}

export function noteOffBytes(pitch: number, channel = 0): number[] {
  return [0x80 | (channel & 0x0f), pitch & 0x7f, 0];
}

export function sustainPedalBytes(down: boolean, channel = 0): number[] {
  return [0xb0 | (channel & 0x0f), SUSTAIN_CONTROLLER, down ? 127 : 0];
}

export function allNotesOffBytes(channel = 0): number[] {
  return [0xb0 | (channel & 0x0f), 123, 0];
}
