import { DEFAULT_PPQ, DEFAULT_TEMPO } from '../domain/types';

/**
 * Musical transport: a pure state machine over an absolute tick timeline.
 *
 * No timers, no I/O. The clock that advances `position` lives outside (see
 * `useStudio`), which keeps this testable and lets the UI own the frame loop.
 *
 * Contract (see `__tests__/Transport.test.ts`):
 * - `advance(delta)` adds to the position in ANY state (including stopped).
 * - `play()` / `record()` do not move the position.
 * - `stop()` keeps the position and returns to `stopped`.
 * - `seek(tick)` clamps negative ticks to 0 and never changes the state.
 * - `setTempo` / `setPpq` reject non-positive and NaN values (they throw).
 */
export type TransportState = 'stopped' | 'playing' | 'recording';

export interface TransportOptions {
  tempo?: number;
  ppq?: number;
}

export interface Transport {
  readonly state: TransportState;
  /** Absolute position on the tick timeline. */
  readonly position: number;
  readonly tempo: number;
  readonly ppq: number;
  readonly isPlaying: boolean;
  readonly isRecording: boolean;

  play(): void;
  record(): void;
  stop(): void;
  seek(tick: number): void;
  advance(deltaTick: number): void;
  setTempo(tempo: number): void;
  setPpq(ppq: number): void;
  reset(): void;
}

/** Ticks per quarter note. */
export function msPerTick(tempo: number, ppq: number): number {
  return 60000 / (tempo * ppq);
}

export function msToTick(ms: number, tempo: number, ppq: number): number {
  return ms / msPerTick(tempo, ppq);
}

export function tickToMs(tick: number, tempo: number, ppq: number): number {
  return tick * msPerTick(tempo, ppq);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, received ${value}`);
  }
}

export class TransportImpl implements Transport {
  private _state: TransportState = 'stopped';
  private _position = 0;
  private _tempo: number;
  private _ppq: number;

  constructor(options: TransportOptions = {}) {
    this._tempo = options.tempo ?? DEFAULT_TEMPO;
    this._ppq = options.ppq ?? DEFAULT_PPQ;
  }

  get state(): TransportState {
    return this._state;
  }

  get position(): number {
    return this._position;
  }

  get tempo(): number {
    return this._tempo;
  }

  get ppq(): number {
    return this._ppq;
  }

  get isPlaying(): boolean {
    return this._state !== 'stopped';
  }

  get isRecording(): boolean {
    return this._state === 'recording';
  }

  play(): void {
    this._state = 'playing';
  }

  record(): void {
    this._state = 'recording';
  }

  stop(): void {
    this._state = 'stopped';
  }

  seek(tick: number): void {
    this._position = Math.max(0, tick);
  }

  advance(deltaTick: number): void {
    this._position = Math.max(0, this._position + deltaTick);
  }

  setTempo(tempo: number): void {
    assertPositiveInteger(tempo, 'tempo');
    this._tempo = tempo;
  }

  setPpq(ppq: number): void {
    assertPositiveInteger(ppq, 'ppq');
    this._ppq = ppq;
  }

  reset(): void {
    this._position = 0;
    this._state = 'stopped';
  }
}

export function createTransport(options: TransportOptions = {}): Transport {
  return new TransportImpl(options);
}
