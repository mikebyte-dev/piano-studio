import type {
  DeviceRemovedCallback,
  MidiAdapter,
  MidiDevice,
  MidiMessage,
  MidiMessageCallback,
} from './MidiAdapter';

export interface FakeMidiAdapterOptions {
  /** Whether isSupported() reports true. Defaults to true. */
  supported?: boolean;
}

/**
 * In-memory MidiAdapter for tests and hardware-free development.
 *
 * - Devices are settable via the constructor or setDevices().
 * - Messages passed to sendMessage() are captured in `sentMessages`.
 * - Inbound messages are scripted with emit() and delivered to onMessage listeners.
 * - Open state is tracked (isOpen / currentDeviceId / currentSendPort / currentReceivePort).
 * - removeDevice() simulates a disconnect and notifies onDeviceRemoved listeners.
 */
export class FakeMidiAdapter implements MidiAdapter {
  /** Every byte array passed to sendMessage(), in order. */
  readonly sentMessages: number[][] = [];

  private devices: MidiDevice[];
  private readonly supported: boolean;

  private currentDeviceId: string | null = null;
  private currentSendPort: number | undefined;
  private currentReceivePort: number | undefined;

  private readonly messageListeners = new Set<MidiMessageCallback>();
  private readonly deviceRemovedListeners = new Set<DeviceRemovedCallback>();

  constructor(devices: MidiDevice[] = [], options: FakeMidiAdapterOptions = {}) {
    this.devices = [...devices];
    this.supported = options.supported ?? true;
  }

  // --- Scripting helpers -------------------------------------------------

  setDevices(devices: MidiDevice[]): void {
    this.devices = [...devices];
  }

  get isOpen(): boolean {
    return this.currentDeviceId !== null;
  }

  get openedDeviceId(): string | null {
    return this.currentDeviceId;
  }

  get openedSendPort(): number | undefined {
    return this.currentSendPort;
  }

  get openedReceivePort(): number | undefined {
    return this.currentReceivePort;
  }

  /** Simulates an inbound message and notifies onMessage listeners. */
  emit(data: number[], timestamp: number = Date.now(), deviceId?: string): void {
    const message: MidiMessage = {
      deviceId: deviceId ?? this.currentDeviceId ?? '',
      data: [...data],
      timestamp,
    };
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  /** Simulates a device disconnect and notifies onDeviceRemoved listeners. */
  removeDevice(deviceId: string): void {
    this.devices = this.devices.filter((device) => device.id !== deviceId);
    if (this.currentDeviceId === deviceId) {
      this.currentDeviceId = null;
      this.currentSendPort = undefined;
      this.currentReceivePort = undefined;
    }
    for (const listener of this.deviceRemovedListeners) {
      listener(deviceId);
    }
  }

  // --- MidiAdapter -------------------------------------------------------

  isSupported(): boolean {
    return this.supported;
  }

  async listDevices(): Promise<MidiDevice[]> {
    return [...this.devices];
  }

  async openDevice(deviceId: string, sendPort?: number, receivePort?: number): Promise<void> {
    this.currentDeviceId = deviceId;
    this.currentSendPort = sendPort;
    this.currentReceivePort = receivePort;
  }

  async closeDevice(): Promise<void> {
    this.currentDeviceId = null;
    this.currentSendPort = undefined;
    this.currentReceivePort = undefined;
  }

  async sendMessage(bytes: number[]): Promise<void> {
    this.sentMessages.push([...bytes]);
  }

  onMessage(cb: MidiMessageCallback): () => void {
    this.messageListeners.add(cb);
    return () => {
      this.messageListeners.delete(cb);
    };
  }

  onDeviceRemoved(cb: DeviceRemovedCallback): () => void {
    this.deviceRemovedListeners.add(cb);
    return () => {
      this.deviceRemovedListeners.delete(cb);
    };
  }
}
