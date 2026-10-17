import { describe, expect, it, jest } from '@jest/globals';

import { FakeMidiAdapter } from '../FakeMidiAdapter';
import type { MidiDevice, MidiMessage } from '../MidiAdapter';

const DEVICE_A: MidiDevice = { id: 'dev-a', name: 'Device A' };
const DEVICE_B: MidiDevice = { id: 'dev-b', name: 'Device B', manufacturer: 'Acme' };

/**
 * Contract tests for FakeMidiAdapter.
 *
 * These assert the public API promised to consumers of the MidiAdapter
 * interface, not incidental implementation details. Anything the spec leaves
 * open (e.g. whether an empty `deviceId` default is `''` or the first device)
 * is asserted loosely on purpose.
 */
describe('FakeMidiAdapter', () => {
  describe('constructor', () => {
    it('accepts a devices array', async () => {
      const devices = [DEVICE_A, DEVICE_B];
      const adapter = new FakeMidiAdapter(devices);

      await expect(adapter.listDevices()).resolves.toEqual(devices);
    });

    it('accepts an options object', () => {
      expect(new FakeMidiAdapter([], { supported: false }).isSupported()).toBe(false);
    });
  });

  describe('isSupported', () => {
    it('returns true by default', () => {
      expect(new FakeMidiAdapter().isSupported()).toBe(true);
    });

    it('returns the configured value', () => {
      expect(new FakeMidiAdapter([], { supported: false }).isSupported()).toBe(false);
      expect(new FakeMidiAdapter([], { supported: true }).isSupported()).toBe(true);
    });
  });

  describe('listDevices', () => {
    it('returns an empty array by default', async () => {
      await expect(new FakeMidiAdapter().listDevices()).resolves.toEqual([]);
    });

    it('returns the devices provided to the constructor', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);

      await expect(adapter.listDevices()).resolves.toEqual([DEVICE_A, DEVICE_B]);
    });

    it('reflects devices set via setDevices', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);

      adapter.setDevices([DEVICE_B]);

      await expect(adapter.listDevices()).resolves.toEqual([DEVICE_B]);
    });

    it('reflects clearing devices via setDevices([])', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);

      adapter.setDevices([]);

      await expect(adapter.listDevices()).resolves.toEqual([]);
    });
  });

  describe('openDevice', () => {
    it('records the opened device id and enters the open state', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);
      expect(adapter.isOpen).toBe(false);

      await adapter.openDevice(DEVICE_A.id);

      expect(adapter.isOpen).toBe(true);
      expect(adapter.openedDeviceId).toBe(DEVICE_A.id);
    });

    it('records undefined ports when none are provided', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);

      await adapter.openDevice(DEVICE_A.id);

      expect(adapter.openedSendPort).toBeUndefined();
      expect(adapter.openedReceivePort).toBeUndefined();
    });

    it('records the send and receive ports that are provided', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);

      await adapter.openDevice(DEVICE_A.id, 0, 2);

      expect(adapter.openedDeviceId).toBe(DEVICE_A.id);
      expect(adapter.openedSendPort).toBe(0);
      expect(adapter.openedReceivePort).toBe(2);
    });

    it('replaces the open device when a second device is opened', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);

      await adapter.openDevice(DEVICE_A.id, 1, 1);
      await adapter.openDevice(DEVICE_B.id, 3, 4);

      expect(adapter.isOpen).toBe(true);
      expect(adapter.openedDeviceId).toBe(DEVICE_B.id);
      expect(adapter.openedSendPort).toBe(3);
      expect(adapter.openedReceivePort).toBe(4);
    });
  });

  describe('closeDevice', () => {
    it('leaves the open state and clears the opened device', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);
      await adapter.openDevice(DEVICE_A.id, 0, 1);

      await adapter.closeDevice();

      expect(adapter.isOpen).toBe(false);
      // Spec allows either null or undefined here.
      expect(adapter.openedDeviceId).toBeFalsy();
      expect(adapter.openedSendPort).toBeUndefined();
      expect(adapter.openedReceivePort).toBeUndefined();
    });

    it('is a safe no-op when no device is open', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);

      await adapter.closeDevice();

      expect(adapter.isOpen).toBe(false);
      expect(adapter.openedDeviceId).toBeFalsy();
    });
  });

  describe('sendMessage', () => {
    it('starts with no sent messages', () => {
      expect(new FakeMidiAdapter().sentMessages).toEqual([]);
    });

    it('captures each call as a bytes array', async () => {
      const adapter = new FakeMidiAdapter();

      await adapter.sendMessage([0x90, 60, 100]);

      expect(adapter.sentMessages).toEqual([[0x90, 60, 100]]);
    });

    it('accumulates messages across calls, in order', async () => {
      const adapter = new FakeMidiAdapter();

      await adapter.sendMessage([0x90, 60, 100]);
      await adapter.sendMessage([0x80, 60, 0]);
      await adapter.sendMessage([]);

      expect(adapter.sentMessages).toEqual([
        [0x90, 60, 100],
        [0x80, 60, 0],
        [],
      ]);
    });
  });

  describe('onMessage / emit', () => {
    it('delivers an emitted message to the subscriber', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);
      const received: MidiMessage[] = [];
      adapter.onMessage((msg) => received.push(msg));

      adapter.emit([0x90, 61, 77], 1234);

      expect(received).toHaveLength(1);
      expect(received[0]!.data).toEqual([0x90, 61, 77]);
      expect(received[0]!.timestamp).toBe(1234);
      // Spec leaves the no-device default open; only require it to be defined.
      expect(typeof received[0]!.deviceId).toBe('string');
    });

    it('passes an explicit deviceId through unchanged', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);
      const received: MidiMessage[] = [];
      adapter.onMessage((msg) => received.push(msg));

      adapter.emit([1, 2, 3], 999, DEVICE_B.id);

      expect(received).toHaveLength(1);
      expect(received[0]!.deviceId).toBe(DEVICE_B.id);
      expect(received[0]!.timestamp).toBe(999);
      expect(received[0]!.data).toEqual([1, 2, 3]);
    });

    it('defaults the deviceId to the open device when none is given', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);
      await adapter.openDevice(DEVICE_A.id);
      const received: MidiMessage[] = [];
      adapter.onMessage((msg) => received.push(msg));

      adapter.emit([7, 8], 42);

      expect(received).toHaveLength(1);
      expect(received[0]!.deviceId).toBe(DEVICE_A.id);
    });

    it('always produces a defined deviceId and numeric timestamp', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);
      const received: MidiMessage[] = [];
      adapter.onMessage((msg) => received.push(msg));

      adapter.emit([7]);

      expect(received).toHaveLength(1);
      expect(typeof received[0]!.deviceId).toBe('string');
      expect(typeof received[0]!.timestamp).toBe('number');
      expect(Number.isFinite(received[0]!.timestamp)).toBe(true);
    });

    it('stops delivering after unsubscribe', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);
      const listener = jest.fn();
      const unsubscribe = adapter.onMessage(listener);

      adapter.emit([1], 1);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      adapter.emit([2], 2);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('delivers the same message to every subscriber', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);
      const firstReceived: MidiMessage[] = [];
      const secondReceived: MidiMessage[] = [];
      adapter.onMessage((msg) => firstReceived.push(msg));
      adapter.onMessage((msg) => secondReceived.push(msg));

      adapter.emit([9], 5, DEVICE_A.id);

      expect(firstReceived).toHaveLength(1);
      expect(secondReceived).toHaveLength(1);
      expect(firstReceived[0]).toEqual(secondReceived[0]);
    });

    it('keeps delivering to remaining subscribers after one unsubscribes', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);
      const first = jest.fn();
      const second = jest.fn();
      const unsubscribeFirst = adapter.onMessage(first);
      adapter.onMessage(second);

      adapter.emit([1], 1);
      unsubscribeFirst();
      adapter.emit([2], 2);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when there are no subscribers', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);

      expect(() => adapter.emit([1], 1)).not.toThrow();
    });
  });

  describe('onDeviceRemoved / removeDevice', () => {
    it('notifies subscribers with the removed device id', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);
      const removed: string[] = [];
      adapter.onDeviceRemoved((deviceId) => removed.push(deviceId));

      adapter.removeDevice(DEVICE_B.id);

      expect(removed).toEqual([DEVICE_B.id]);
    });

    it('stops notifying after unsubscribe', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);
      const listener = jest.fn();
      const unsubscribe = adapter.onDeviceRemoved(listener);

      adapter.removeDevice(DEVICE_A.id);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      adapter.removeDevice(DEVICE_B.id);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies every subscriber', () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);
      const first = jest.fn();
      const second = jest.fn();
      adapter.onDeviceRemoved(first);
      adapter.onDeviceRemoved(second);

      adapter.removeDevice(DEVICE_A.id);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeDevice', () => {
    it('removes the device from listDevices', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);

      adapter.removeDevice(DEVICE_A.id);

      await expect(adapter.listDevices()).resolves.toEqual([DEVICE_B]);
    });

    it('closes the device when it was the open device', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);
      await adapter.openDevice(DEVICE_A.id, 1, 2);
      expect(adapter.isOpen).toBe(true);

      adapter.removeDevice(DEVICE_A.id);

      expect(adapter.isOpen).toBe(false);
      expect(adapter.openedDeviceId).toBeFalsy();
      await expect(adapter.listDevices()).resolves.toEqual([DEVICE_B]);
    });

    it('leaves the open device open when a different device is removed', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A, DEVICE_B]);
      await adapter.openDevice(DEVICE_A.id);

      adapter.removeDevice(DEVICE_B.id);

      expect(adapter.isOpen).toBe(true);
      expect(adapter.openedDeviceId).toBe(DEVICE_A.id);
    });

    it('is a safe no-op for an unknown device id', async () => {
      const adapter = new FakeMidiAdapter([DEVICE_A]);

      expect(() => adapter.removeDevice('does-not-exist')).not.toThrow();
      await expect(adapter.listDevices()).resolves.toEqual([DEVICE_A]);
    });
  });
});
