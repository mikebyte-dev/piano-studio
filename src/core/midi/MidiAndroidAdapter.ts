import MidiAndroidModule, { type MidiDevice as MdDevice } from 'midi-android';

import type {
  DeviceRemovedCallback,
  MidiAdapter,
  MidiDevice,
  MidiMessage,
  MidiMessageCallback,
} from './MidiAdapter';

/**
 * Real `MidiAdapter` backed by the `midi-android` native module (Android
 * `android.media.midi` on device, Web MIDI API on web).
 *
 * The module exposes a neutral surface, so this adapter is a thin translation
 * layer into our own `MidiAdapter` contract. Ports follow the module's
 * convention: `-1` disables a direction, `0` selects the first port.
 */
function toNeutralDevice(device: MdDevice): MidiDevice {
  return {
    id: String(device.id),
    name: device.name,
    manufacturer: device.manufacturer,
  };
}

export class MidiAndroidAdapter implements MidiAdapter {
  isSupported(): boolean {
    return MidiAndroidModule.isSupported();
  }

  async listDevices(): Promise<MidiDevice[]> {
    const devices = await MidiAndroidModule.listDevices();
    return devices.map(toNeutralDevice);
  }

  async openDevice(deviceId: string, sendPort?: number, receivePort?: number): Promise<void> {
    await MidiAndroidModule.openDevice(deviceId, sendPort, receivePort);
  }

  async closeDevice(): Promise<void> {
    await MidiAndroidModule.closeDevice();
  }

  async sendMessage(bytes: number[]): Promise<void> {
    await MidiAndroidModule.sendMessage(bytes);
  }

  onMessage(cb: MidiMessageCallback): () => void {
    const subscription = MidiAndroidModule.addListener('onMessage', (event) => {
      const message: MidiMessage = {
        deviceId: event.deviceId,
        data: event.data,
        timestamp: event.timestamp,
      };
      cb(message);
    });
    return () => subscription.remove();
  }

  onDeviceRemoved(cb: DeviceRemovedCallback): () => void {
    const subscription = MidiAndroidModule.addListener('onDeviceRemoved', (event) => {
      cb(event.deviceId);
    });
    return () => subscription.remove();
  }
}
