export interface MidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
}

export interface MidiMessage {
  deviceId: string;
  data: number[];
  /** Timestamp in milliseconds. */
  timestamp: number;
}

export type MidiMessageCallback = (msg: MidiMessage) => void;

export type DeviceRemovedCallback = (deviceId: string) => void;

export interface MidiAdapter {
  isSupported(): boolean;
  listDevices(): Promise<MidiDevice[]>;
  openDevice(deviceId: string, sendPort?: number, receivePort?: number): Promise<void>;
  closeDevice(): Promise<void>;
  sendMessage(bytes: number[]): Promise<void>;
  /** Subscribe to inbound messages. Returns an unsubscribe function. */
  onMessage(cb: MidiMessageCallback): () => void;
  /** Subscribe to device-removed events. Returns an unsubscribe function. */
  onDeviceRemoved(cb: DeviceRemovedCallback): () => void;
}
