# Piano Studio

A piano-focused MIDI recording app. Connect a physical MIDI keyboard, record
takes, and watch the notes fall toward the keyboard in a Synthesia/DAW-style
**waterfall**. Editing happens at the **region** level (move, trim, resize),
and the app supports both **MIDI input** and **MIDI output**.

Built on the existing Expo project — no unnecessary migrations. The full author
vision is in [`docs/vision.md`](docs/vision.md); the working plan is in
[`plan.md`](plan.md).

## Features

- **Waterfall view** — notes fall vertically toward an 88-key on-screen piano.
  All notes — recorded and live — share a single renderer and the same
  lifecycle: a held key grows anchored to the keyboard; on release the note
  freezes at its real duration, drifts with the flow clock, and fades in the
  top 25% of the view. Recorded notes are synthesized onto that lifecycle
  against the playhead (open while the playhead is inside them, closed after),
  keep their own color, and the waterfall stays clean while the transport is
  stopped.
- **Transport** — play, stop, and record, with tempo and time signature
  controls. Playback always starts from the beginning of the recorded material.
- **Metronome** — audible accent/click pulses (`expo-audio`), with a per-measure accent (1–8 beats); off by default; falls back to visual-only if audio is unavailable. Rendered by the dedicated `Metronome` component.
- **MIDI input** — device enumeration, manual refresh, auto-connect when a
  single device is present, and live note/sustain state from note on/off and
  CC 64 (sustain pedal).
- **On-screen keyboard** — tap or press-and-hold keys; both feed the active
  recording take.
- **Recording takes** — each finished take is committed as an independent
  **region** (with its own color); empty takes create no region. Overdub and
  replace semantics are implemented in the pure core (`commitModes`).
  Commit goes through the pure `commitTake` (`src/core/recording/commitTake.ts`),
  so a region starts where the session started and its notes share the region's
  absolute-tick coordinates. Recording a new take **restarts from the beginning**
  and plays back the previously committed takes via **MIDI out as a reference**
  while the new one is captured (DAW-style overdub reference); starting or
  stopping playback sends all-notes-off so nothing hangs.
- **Region editing** — recolor and delete regions from the track strip.
  Pure move/trim/resize operations exist in the core (`regionEditing`), but
  they are not exposed on-screen yet.
- **MIDI output** — recorded notes are scheduled back out to the connected
  device, with all-notes-off on stop.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Expo SDK 57 (`expo ~57.0.30`), Expo Router (file-based routing) |
| Runtime | React Native 0.86.3, React 19.2.3 |
| Language | TypeScript 6 |
| Styling | NativeWind 4 (Tailwind CSS 3) |
| Animation / gestures | `react-native-reanimated` 4, `react-native-gesture-handler` |
| Audio | `expo-audio` (metronome) |
| MIDI | First-party `midi-android` module (our own code, local tarball) behind a `MidiAdapter` interface |
| Tests | `jest-expo` + `@testing-library/react-native` |
| Lint | ESLint 9 / `eslint-config-expo` |

## Project structure

```
src/
  app/                    Expo Router routes (every file here is a screen)
    _layout.tsx           Root layout
    index.tsx             Main studio screen (transport + waterfall + keyboard)
  components/             UI components
    Waterfall.tsx         Synthesia-style falling-notes view
    PianoKeyboard.tsx     88-key on-screen keyboard (MIDI 21–108)
    PianoRoll.tsx         Classic piano roll (kept in the repo, not the main view)
    Metronome.tsx         Metronome UI control (toggle, tempo, time signature)
    SustainPedal.tsx      Sustain (CC 64) indicator
  core/                   Framework-free, pure, testable logic
    domain/types.ts       Note, Region, Track, Project, PPQ/tempo defaults
    midi/                 MidiAdapter interface + FakeMidiAdapter + MidiAndroidAdapter + message helpers
    recording/            Transport, RecordingSession, commitTake, commitModes, regionEditing, MidiOutPlayer
    waterfall/            noteGeometry, colors, liveNotes, tempo (pure, tested)
  hooks/
    useMidi.ts            React binding over a MidiAdapter (devices, live notes, sustain)
    useStudio.ts          Orchestrates MIDI I/O, transport, recording, playback, region editing
    useMetronome.ts       Metronome state and audio engine
assets/
  sounds/                 Metronome click/accent samples
  images/                 App icons and splash assets
docs/vision.md            Original author vision
plan.md                   Project plan and roadmap
AGENTS.md                 Repository conventions for AI agents
```

The `src/core` modules are deliberately pure (no React, no timers, no I/O) so
the domain, recording engine, and geometry can be tested without hardware or a
device.

## Setup

Requires Node.js and an Expo-compatible environment. This project uses **npm**
(`package-lock.json`); if a `bun.lock` were present, use `bunx` instead of `npx`.

```bash
npm install
```

Always add dependencies through Expo so SDK-compatible versions are resolved:

```bash
npx expo install <package>
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` / `npx expo start` | Start the dev server |
| `npm run android` / `npx expo run:android` | Build and run the Android app locally |
| `npm run ios` / `npx expo run:ios` | Build and run the iOS app locally |
| `npm run web` | Start the web target |
| `npm run lint` / `npx expo lint` | Lint |
| `npm run typecheck` / `npx tsc --noEmit` | Typecheck |
| `npm test` / `npx jest` | Run the test suite |
| `npx expo-doctor` | Diagnose dependency and config issues |
| `npx expo install --fix` | Fix incompatible package versions |

Run lint and typecheck before considering any task done.

## MIDI support

MIDI is isolated behind the `MidiAdapter` interface (`src/core/midi/MidiAdapter.ts`):

- **`FakeMidiAdapter`** — an in-memory adapter for tests and hardware-free
  development. Devices are settable, sent messages are captured, and inbound
  messages are scripted. It lets the whole core and UI run without hardware.
- **`MidiAndroidAdapter`** — the real adapter, backed by our own **first-party
  `midi-android`** native module (Android's `android.media.midi` on device, the
  Web MIDI API on web). It is a thin translation layer into the same interface.
  This module is our own code — not a third-party or MIT-licensed dependency.

`useMidi` owns device enumeration, connection state, and live note/sustain
state; `useStudio` layers the transport, recording, and playback on top.

Notes:

- **MIDI does not work in Expo Go.** The app uses `expo-dev-client`, so it must
  be run as a development build (`npx expo run:android` locally, or
  `eas build --profile development`).
- The `midi-android` module is **first-party** — our own code, developed in a
  separate satellite project, consumed here from a local tarball
  (`midi-android-0.1.0.tgz`, `file:` dependency). It is not a third-party or
  MIT-licensed dependency.
- The satellite repository/package name `midi-android` is **pending rename**;
  the current name is provisional.
- The physical keyboard connects over USB. Opening a device enables both input
  and output on ports `0/0`.

## Recording & waterfall

- **Transport** (`src/core/recording/Transport.ts`) is a pure tick-timeline
  state machine (`stopped`/`playing`/`recording`). The clock that advances the
  position lives in `useStudio`, keeping the state machine testable.
- **`RecordingSession`** captures a live take from note on/off events on an
  absolute tick timeline (velocity-0 note-on is treated as note-off; re-triggers
  close the previous note; active notes are flushed on stop).
- **`commitModes`** implements **overdub** (keep existing material, append) and
  **replace** (drop only the notes overlapping the recording range, keep the
  rest) as pure functions.
- **`regionEditing`** provides pure move/trim/resize operations; notes use
  absolute ticks shared with their region.
- **Waterfall geometry is pure** (`src/core/waterfall/noteGeometry.ts`,
  `colors.ts`, `liveNotes.ts`, `tempo.ts`). `liveNotes` is exposed to React via
  `useSyncExternalStore`. The note's time-based minimum length is a
  display-only floor and never affects the stored or sounded duration.
- **One renderer for all notes** (`src/components/Waterfall.tsx`): recorded
  and live notes both go through `liveNoteGeometry`. Committed notes are
  synthesized as live notes on the transport time base (`flowTick = position`)
  — open (anchored, growing) while the playhead is inside the note, closed
  (frozen, rising) after — with the region's color. The waterfall is clean
  when the transport is stopped, and the in-progress take is drawn only
  through the `liveNotes` store: `useStudio.recordedNotes` holds committed
  regions only, so nothing renders twice.
- **Animation runs at ~60 fps**: the transport/UI clock in `useStudio` ticks
  every 16 ms (previously 33 ms); the waterfall's own animation clock was
  already 16 ms. Recording timestamps do not ride this clock — `currentTick()`
  uses `performance.now()`.

## Tests

Testing uses `jest-expo` with `@testing-library/react-native`:

```bash
npx jest
```

The suite covers the pure core only — there are no component tests; testable
behavior is extracted into pure modules (`src/core/**`). Test-first is the
convention for new behavior. Current status: **12 test suites, 232 tests, all
passing**.

## Known limitations

- Region move/trim/resize have no on-screen control yet (only recolor + delete
  on the track strip); the pure ops live in `regionEditing`.
- `commitModes` (overdub/replace) pure functions exist and are tested, but the
  recording flow stores each finished take as an independent region —
  overdub/replace are not applied in the UI flow.
- No persistence/export or desktop target yet (Fases 7 and 8, not started).
- No count-in/countdown feature (a commit message mentions it, but it is not
  implemented).
- MIDI hardware verification pending in the satellite `midi-android` project.

## Roadmap

Not yet implemented (see [`plan.md`](plan.md)):

- **Persistence / export** (`expo-sqlite` + `expo-file-system`) — optional.
- **Desktop target** (Electron/Tauri + `react-native-web` + Web MIDI) —
  decided, not started.

Real hardware verification of the MIDI layer is pending on the satellite
`midi-android` project.
