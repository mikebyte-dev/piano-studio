import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { FakeMidiAdapter } from '../../core/midi/FakeMidiAdapter';
import { useStudio } from '../useStudio';

// `midi-android` ships raw TypeScript in node_modules (not transformed by Jest).
// The hook under test is always injected with a `FakeMidiAdapter`, so the real
// native module is stubbed out to keep the import chain loadable.
jest.mock('midi-android', () => ({
  __esModule: true,
  default: {
    isSupported: () => false,
    listDevices: async () => [],
    openDevice: async () => undefined,
    closeDevice: async () => undefined,
    sendMessage: async () => undefined,
    addListener: () => ({ remove: () => undefined }),
  },
}));

/**
 * Spec: recording a new take while an earlier take exists must schedule the
 * earlier take's notes for MIDI-out playback ("reference") during recording, so
 * the user hears the previous material as a guide.
 *
 * Test-first: written from the spec, BEFORE implementation. It is expected to
 * FAIL on the current code because `record()` does not schedule the existing
 * takes for reference playback.
 *
 * Timing: fake timers. `msPerTick = 60000 / (tempo * ppq)`. Notes are scheduled
 * relative to the recording start position (0 here), so a note that starts at
 * tick 0 fires its note-on through a 0-delay timer; `advanceTimersByTime(0)`
 * flushes it.
 */
const NOTE_ON = 0x90; // channel 0

describe('useStudio reference playback while recording a new take', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules the existing take notes for MIDI-out playback when recording a new take', async () => {
    // 1. Adapter with one device.
    const adapter = new FakeMidiAdapter([{ id: 'dev1', name: 'Dev' }]);

    // 2. Render the hook.
    const { result } = await renderHook(() => useStudio({ midiAdapter: adapter }));

    // 3. Flush the initial (deferred) device enumeration.
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    // 4. Open the device.
    await act(async () => {
      await result.current.connect('dev1');
    });

    // 5. First take: record one note (pitch 60) and stop it.
    await act(async () => {
      result.current.record();
    });
    await act(async () => {
      result.current.startNote(60);
    });
    await act(async () => {
      result.current.stopNote(60);
    });
    await act(async () => {
      result.current.stop();
    });

    expect(result.current.regions).toHaveLength(1);

    // 6. Record a second take: the existing take must be scheduled as reference.
    const before = adapter.sentMessages.length;

    await act(async () => {
      result.current.record();
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    const newMsgs = adapter.sentMessages.slice(before);

    // The existing take's note-on (pitch 60, velocity 100) must be re-sent.
    expect(newMsgs).toContainEqual([NOTE_ON, 60, 100]);
  });

  it('does not throw when recording a new take with no existing takes', async () => {
    const adapter = new FakeMidiAdapter([{ id: 'dev1', name: 'Dev' }]);
    const { result } = await renderHook(() => useStudio({ midiAdapter: adapter }));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await act(async () => {
      await result.current.connect('dev1');
    });

    const before = adapter.sentMessages.length;
    await act(async () => {
      result.current.record();
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    const newMsgs = adapter.sentMessages.slice(before);
    // Nothing to reference: no note-on should be sent. (An all-notes-off from
    // the player's cancel on record is acceptable and ignored here.)
    expect(newMsgs.filter((m) => m[0] === NOTE_ON)).toHaveLength(0);
  });
});
