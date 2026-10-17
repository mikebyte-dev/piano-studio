export type NoteId = string;

export interface Note {
  id: NoteId;
  pitch: number;
  velocity: number;
  startTick: number;
  durationTick: number;
  /** Optional display color (hex). Used to color recorded takes in the waterfall. */
  color?: string;
}

export interface Region {
  id: string;
  trackId: string;
  startTick: number;
  lengthTick: number;
  notes: Note[];
  /** Optional display color (hex) of the take/track. */
  color?: string;
}

export interface Track {
  id: string;
  name: string;
  regions: Region[];
  muted: boolean;
  solo: boolean;
  /** Optional display color (hex). */
  color?: string;
  /** Optional identifier of the MIDI input device this track is bound to. */
  inputDeviceId?: string;
  /** Optional MIDI channel (0-15). */
  channel?: number;
  /** Optional track start position in ticks. */
  startTimeTick?: number;
  /** Optional track duration in ticks. */
  durationTick?: number;
}

export interface Project {
  id: string;
  name: string;
  tracks: Track[];
  tempo: number;
  ppq: number;
}

export const DEFAULT_PPQ = 480;
export const DEFAULT_TEMPO = 120;
