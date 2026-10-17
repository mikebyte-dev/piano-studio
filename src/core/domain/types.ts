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
}

export interface Track {
  id: string;
  name: string;
  regions: Region[];
  muted: boolean;
  solo: boolean;
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
