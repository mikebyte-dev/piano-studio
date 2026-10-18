# Recording Refactor Implementation Plan

> **For agentic workers:** Implement task-by-task with fresh subagent per task (subagent tool) + reviewer, or native inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recording flow coherent (record → commit region with correct coordinates → play → delete) by extracting the commit logic into a pure, tested `commitTake`, fixing the region coordinate invariant, and deleting dead/misleading code (`TransportBar`, `RegionTools`, `recordMode`, `clearRegion`).

**Architecture:** A new pure function `commitTake(notes, sessionStartTick, color, regionIndex): Region | null` in `src/core/recording/commitTake.ts` owns region construction (this fixes `startTick: 0` while notes use absolute ticks, which breaks the `regionEditing` invariant). `useStudio` calls it inside `stop()` and drops the dead `recordMode`/`clearRegion` APIs; the two unwired components and their barrel re-exports are deleted. `commitModes.ts` stays (future capability) with no plumbing changes.

**Tech Stack:** TypeScript 6, Expo SDK 57 / React Native 0.86.3, Jest (`jest-expo` preset, `@jest/globals`).

**Spec:** No separate design doc exists; this plan argues from the 2026-10-18 refactor request (Goal/Architecture above) plus project state in `plan.md` and `AGENTS.md`. Verified baseline read on 2026-10-18: 10 suites / 220 tests green.

## Global Constraints

- DoD (plan.md, verbatim): `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` must pass before declaring the plan done.
- Full test gate every task: `npx jest` green. Baseline **10 suites / 220 tests**; expected after Task 2: **11 suites / 230 tests** (10 new `commitTake` tests).
- Test-first (plan.md decision): new behavior gets tests written from the contract before implementation; tests are never edited to make them pass.
- No new React/hook/component tests: this repo extracts testable logic into pure modules under `src/core/**` (plan.md). Task 4 is verified by typecheck + lint + full jest, not by new hook tests.
- npm project (`package-lock.json`) → use `npx`, not `bunx`.
- Expo SDK 57 — this refactor touches **no** Expo/React Native APIs; add **no** dependencies.
- Keep `src/core/recording/commitModes.ts` and its tests untouched (future capability, unwired by design).
- Remove **only** `recordMode`, `setRecordMode`, `clearRegion`, `RecordMode` from `useStudio`. The `region` alias, `deleteRegion`, `moveRegionBy`/`trimRegion*By`/`resizeRegionBy` stay.
- Language: `plan.md` stays Spanish, `README.md` stays English, UI strings stay Spanish — match each file's existing voice.
- Git: commit per task only after that task's gate is green; never `git push`. The intentionally red commit of Task 1 is part of the TDD flow (plan.md: "tests rojos primero").

## Review Focus

Failure modes no task's tests fully exercise, most likely first, each with its pin:

1. **Region coordinates regress to `startTick: 0`** (the bug this plan fixes): a committed region must start at `sessionStartTick` and fully contain its notes → pinned by `starts the region at sessionStartTick, not at 0` and `preserves the region/note coordinate invariant` (Task 1/2).
2. **Empty take leaks `null` or burns an id**: an empty take must return `null` (no region, no `regionIndex` consumed), and `setRegions` must never receive `null` → pinned by `returns null for an empty take` (Task 1); the hook-side guard is forced by the `Region | null` return type under `npx tsc --noEmit` (Task 4).
3. **`lengthTick` semantics change**: the old inline commit padded the region to the recording end (`rangeEnd`); the new pure signature has no `rangeEnd`, so regions now end at the last note's end (trailing silence excluded) → pinned by `derives lengthTick from the last note end relative to the session start` (Task 1). Downstream safety (verified by inspection, no test): `play()`/`seek()` schedule only `region.notes` (absolute ticks), `Waterfall` renders `recordedNotes` (absolute ticks), and `index.tsx` chips read only `region.color`/`region.notes.length` — none of them read `region.startTick`.
4. **Stranded imports mid-plan**: `TransportBar.tsx` imports `RecordMode` from `useStudio`; removing the type before deleting the component breaks `tsc` at a task boundary → pinned by the task sequencing (Task 3 runs before Task 4), `npx tsc --noEmit` after each task, and grep audits (`TransportBar|RegionTools` after Task 3; `recordMode|RecordMode|clearRegion` after Task 4).
5. **Mid-take color change divergence**: `RecordingSession` stamps `recordingColorRef` per note-on, so notes in one take can carry different colors; `commitTake` must keep a note's existing color and only fill in missing ones → pinned by `keeps a color already present on a note` (Task 1).

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/core/recording/commitTake.ts` | Create | Pure commit: take notes + session metadata → `Region \| null`. Owns the coordinate invariant. |
| `src/core/recording/__tests__/commitTake.test.ts` | Create | Contract tests for `commitTake` (written first). |
| `src/hooks/useStudio.ts` | Modify | Call pure `commitTake` in `stop()`; delete `RecordMode`, `recordMode`/`setRecordMode` state, `clearRegion`, and the old inline `commitTake` callback. |
| `src/hooks/index.ts` | Modify | Drop the `RecordMode` re-export. |
| `src/components/TransportBar.tsx` | Delete | Dead component (unwired, imports `RecordMode`). |
| `src/components/RegionTools.tsx` | Delete | Dead component (unwired). |
| `src/components/index.ts` | Modify | Remove the 4 re-export lines for both deleted components. |
| `plan.md`, `README.md` | Modify | Record the refactor; remove documentation of deleted components. |

**Sequencing note (differs from the requested task order):** the requested order had "refactor useStudio (remove `RecordMode`)" before "remove dead components". That leaves `tsc` red between the two tasks, because `TransportBar.tsx` imports `RecordMode`. The tasks are therefore swapped below (components first, hook second) so **every task boundary is green**. The task contents are exactly as requested.

---

### Task 1: Failing contract test for `commitTake`

**Files:**
- Test: `src/core/recording/__tests__/commitTake.test.ts` (create)

**Interfaces:**
- Consumes: `Note` and `Region` from `src/core/domain/types.ts` — `Note { id, pitch, velocity, startTick, durationTick, color? }`, `Region { id, trackId, startTick, lengthTick, notes, color? }` (VERIFIED).
- Produces: the contract for `commitTake(notes: Note[], sessionStartTick: number, color: string, regionIndex: number): Region | null`, implemented in Task 2 at `src/core/recording/commitTake.ts`.

- [ ] **Step 1: Write the failing test**
  Create `src/core/recording/__tests__/commitTake.test.ts`:

  ```ts
  import { describe, expect, it } from '@jest/globals';

  import type { Note, Region } from '../../domain/types';
  import { commitTake } from '../commitTake';

  /**
   * Contract tests for `commitTake` (`src/core/recording/commitTake.ts`).
   *
   * Written test-first. The invariant (see `regionEditing.ts`): notes use
   * ABSOLUTE ticks and a region shares that coordinate space — a region that
   * starts at tick S holds only notes at >= S, and every note ends at or before
   * S + lengthTick. The old inline commit in `useStudio` violated this with
   * `startTick: 0`.
   *
   * Decisions pinned here (flagged for review):
   *  1. `startTick` is `sessionStartTick`, NOT 0.
   *  2. Empty take -> `null` (no region, no regionIndex consumed).
   *  3. `lengthTick = max(1, maxNoteEnd - sessionStartTick)`: the region ends at
   *     the last note's end; trailing silence is not part of the region (the
   *     pure signature takes no rangeEnd — deliberate change from the old
   *     commit, which padded to the recording end).
   *  4. Notes without a `color` inherit the region color; notes that already
   *     have one keep it. Inputs are never mutated; input order is preserved
   *     (`RecordingSession.stop` already sorts by startTick).
   *  5. Caller guarantee: every note has `startTick >= sessionStartTick`
   *     (`RecordingSession` captures at transport ticks >= its startTick).
   */

  const makeNote = (
    id: string,
    pitch: number,
    startTick: number,
    durationTick: number,
    velocity = 100,
    color?: string,
  ): Note => ({ id, pitch, velocity, startTick, durationTick, ...(color ? { color } : {}) });

  const must = (region: Region | null): Region => {
    if (region === null) throw new Error('expected a region, got null');
    return region;
  };

  describe('commitTake', () => {
    it('returns null for an empty take', () => {
      expect(commitTake([], 0, '#22c55e', 1)).toBeNull();
    });

    it('starts the region at sessionStartTick, not at 0', () => {
      const notes = [makeNote('a', 60, 480, 120)];

      const region = must(commitTake(notes, 480, '#3b82f6', 1));

      expect(region.startTick).toBe(480);
    });

    it('derives lengthTick from the last note end relative to the session start', () => {
      const notes = [makeNote('a', 60, 480, 120), makeNote('b', 64, 540, 60)];

      const region = must(commitTake(notes, 480, '#3b82f6', 1));

      // max note end = max(600, 600) = 600 -> 600 - 480 = 120
      expect(region.lengthTick).toBe(120);
    });

    it('clamps lengthTick to at least 1', () => {
      const notes = [makeNote('a', 60, 100, 0)];

      const region = must(commitTake(notes, 100, '#22c55e', 1));

      expect(region.lengthTick).toBe(1);
    });

    it('builds id and trackId from regionIndex', () => {
      const notes = [makeNote('a', 60, 0, 10)];

      const region = must(commitTake(notes, 0, '#22c55e', 7));

      expect(region.id).toBe('region-7');
      expect(region.trackId).toBe('track-7');
    });

    it('stamps the region color on notes that have none', () => {
      const notes = [makeNote('a', 60, 0, 10)];

      const region = must(commitTake(notes, 0, '#a855f7', 1));

      expect(region.color).toBe('#a855f7');
      expect(region.notes[0].color).toBe('#a855f7');
    });

    it('keeps a color already present on a note', () => {
      const notes = [makeNote('a', 60, 0, 10, 100, '#ef4444')];

      const region = must(commitTake(notes, 0, '#a855f7', 1));

      expect(region.notes[0].color).toBe('#ef4444');
    });

    it('preserves the region/note coordinate invariant', () => {
      const notes = [makeNote('a', 60, 960, 120), makeNote('b', 64, 1020, 240)];

      const region = must(commitTake(notes, 960, '#22c55e', 2));

      for (const note of region.notes) {
        expect(note.startTick).toBeGreaterThanOrEqual(region.startTick);
        expect(note.startTick + note.durationTick).toBeLessThanOrEqual(
          region.startTick + region.lengthTick,
        );
      }
    });

    it('does not mutate its inputs', () => {
      const notes = [makeNote('a', 60, 0, 10), makeNote('b', 64, 20, 10, 100, '#ef4444')];
      const snapshot = JSON.parse(JSON.stringify(notes)) as Note[];

      commitTake(notes, 0, '#22c55e', 1);

      expect(notes).toEqual(snapshot);
    });

    it('returns a new notes array (no aliasing of the input)', () => {
      const notes = [makeNote('a', 60, 0, 10)];

      const region = must(commitTake(notes, 0, '#22c55e', 1));

      expect(region.notes).not.toBe(notes);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails (intentional red phase)** — Run: `npx jest src/core/recording/__tests__/commitTake.test.ts` — Expected: FAIL, `Cannot find module '../commitTake'`. Also `npx tsc --noEmit` reports TS2307 for the same module — **both red by design at this commit**; Task 2 restores green.
- [ ] **Step 3: Commit the red test**
  ```bash
  git add src/core/recording/__tests__/commitTake.test.ts
  git commit -m "test: contract tests for pure commitTake (red)"
  ```

### Task 2: Implement `commitTake`

**Files:**
- Create: `src/core/recording/commitTake.ts`
- Test: `src/core/recording/__tests__/commitTake.test.ts` (from Task 1 — **do not edit it**)

**Interfaces:**
- Consumes: the contract in Task 1's test file.
- Produces (used by Task 4 — exact signature):

  ```ts
  export function commitTake(
    notes: Note[],
    sessionStartTick: number,
    color: string,
    regionIndex: number,
  ): Region | null;
  ```

- [ ] **Step 1: Implement `commitTake` in `src/core/recording/commitTake.ts`** — The signature and Task 1's tests determine the body completely: guard `notes.length === 0` → `null`; tag notes missing `color` with the region `color` (new array, input order preserved, no mutation); `lengthTick = Math.max(1, maxNoteEnd - sessionStartTick)`; `id`/`trackId` = `` `region-${regionIndex}` ``/`` `track-${regionIndex}` ``; `startTick = sessionStartTick`. Not pinned by tests — write the JSDoc contract: notes are absolute-tick notes captured by a `RecordingSession` started at `sessionStartTick` (caller guarantees every `note.startTick >= sessionStartTick`); the function is pure; state that this module owns the region/note coordinate invariant shared with `regionEditing.ts`.
- [ ] **Step 2: Run the test to verify it passes** — Run: `npx jest src/core/recording/__tests__/commitTake.test.ts` — Expected: PASS, 1 suite / 10 tests.
- [ ] **Step 3: Run the full gate** — Run: `npx jest && npx tsc --noEmit && npx expo lint` — Expected: all green; jest reports **11 suites / 230 tests** (10 suites / 220 baseline + this suite). If any Task 1 test fails, fix **`commitTake.ts`**, never the test.
- [ ] **Step 4: Commit**
  ```bash
  git add src/core/recording/commitTake.ts src/core/recording/__tests__/commitTake.test.ts
  git commit -m "feat: add pure commitTake with correct region coordinates"
  ```

### Task 3: Remove dead components + re-exports

**Files:**
- Delete: `src/components/TransportBar.tsx`, `src/components/RegionTools.tsx`
- Modify: `src/components/index.ts:7-10`

**Interfaces:**
- Consumes: nothing (safe first: `TransportBar` imports `RecordMode` from `useStudio`, which still exists at this point — VERIFIED the only importers of both components are `src/components/index.ts` and README text; nothing imports the `src/components` barrel by path, so the barrel keeps its other exports).
- Produces: `src/components/index.ts` exporting only `PianoKeyboard`, `SustainPedal`, `PianoRoll`, `Metronome` (+ their props types); both files gone — a precondition for Task 4's `RecordMode` removal.

- [ ] **Step 1: Delete the components** — Run: `git rm src/components/TransportBar.tsx src/components/RegionTools.tsx`
- [ ] **Step 2: Remove their re-exports from `src/components/index.ts`** — delete these 4 lines exactly:
  ```ts
  export { TransportBar } from './TransportBar';
  export type { TransportBarProps } from './TransportBar';
  export { RegionTools } from './RegionTools';
  export type { RegionToolsProps } from './RegionTools';
  ```
- [ ] **Step 3: Audit for stranded references** — Run: `grep -rn "TransportBar\|RegionTools" src/` — Expected: no matches (use the grep tool if `grep` is unavailable in the shell).
- [ ] **Step 4: Run the full gate** — Run: `npx tsc --noEmit && npx expo lint && npx jest` — Expected: green, **11 suites / 230 tests**.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/index.ts
  git commit -m "chore: remove unused TransportBar and RegionTools components"
  ```

### Task 4: Refactor `useStudio` onto pure `commitTake`; remove dead APIs

**Files:**
- Modify: `src/hooks/useStudio.ts` (see exact edits below; current baseline line numbers 2026-10-18)
- Modify: `src/hooks/index.ts:4`

**Interfaces:**
- Consumes: `commitTake(notes: Note[], sessionStartTick: number, color: string, regionIndex: number): Region | null` from Task 2.
- Produces (what reviewers/other tasks rely on):
  - `UseStudioResult` **no longer** contains `recordMode`, `setRecordMode`, `clearRegion`. Everything else (including `region`, `regions`, `selectedRegionId`, `deleteRegion`, the editing ops) is unchanged.
  - `RecordMode` type is gone from `useStudio.ts`.
  - `src/hooks/index.ts` exports: `useMidi`, `UseMidiOptions`, `UseMidiResult`, `useStudio`, `UseStudioOptions`, `UseStudioResult`.
  - `useStudio` docs no longer claim `recordMode` is surfaced to the UI.

- [ ] **Step 1: Add the import** — in `src/hooks/useStudio.ts` add: `import { commitTake } from '../core/recording/commitTake';` (no name clash: the old local `commitTake` callback is deleted in Step 3).
- [ ] **Step 2: Delete the dead API surface** — in `src/hooks/useStudio.ts` remove, by symbol (baseline lines: 18, 60–61, 90, 154, 565–566, 585):
  - `export type RecordMode = 'overdub' | 'replace';`
  - interface `UseStudioResult` fields `recordMode: RecordMode;` and `setRecordMode: (mode: RecordMode) => void;`
  - interface `UseStudioResult` field `clearRegion: () => void;`
  - state `const [recordMode, setRecordMode] = useState<RecordMode>('overdub');`
  - return entries `recordMode,` / `setRecordMode,` / `clearRegion,`
  - the whole `clearRegion` callback (baseline lines 349–357, starts `const clearRegion = useCallback((`).
- [ ] **Step 3: Replace the inline commit with the pure call** — delete the local `commitTake` callback (baseline lines 242–261, `const commitTake = useCallback((incoming: Note[], rangeStart: number, rangeEnd: number) => {`) and replace the `stop` callback (baseline lines 291–311) with:

  ```ts
  const stop = useCallback(() => {
    const t = transport;
    player.cancel(); // clears playback timers + sends all-notes-off
    const session = sessionRef.current;
    if (session !== null) {
      const endTick = currentTick();
      const notes = session.stop(endTick);
      sessionRef.current = null;
      // Empty take -> commitTake returns null: no region, no regionIndex consumed.
      const region = commitTake(notes, session.startTick, recordingColorRef.current, regionCounterRef.current + 1);
      if (region !== null) {
        regionCounterRef.current += 1;
        setRegions((prev) => [...prev, region]);
        setSelectedRegionId(region.id);
      }
    }
    t.stop();
    t.seek(0);
    player.cancel();
    midi.resetNotes();
    setLocalPressed(new Set());
    pressCountRef.current.clear();
    setLiveNotes([]);
    setTransportState(t.state);
    setPosition(0);
  }, [currentTick, midi, player, transport]);
  ```

  (Identical to the old body except the commit block and `commitTake` removed from the dependency array.)
- [ ] **Step 4: Update the hook's doc comment** — in the `useStudio` JSDoc (baseline lines 131–142), replace the `recordMode` paragraph ("Each finished take is committed as an independent `Region` … `recordMode` is still surfaced for the UI but takes are no longer merged.") with:

  ```ts
   * Each finished take is committed as an independent `Region` by the pure
   * `commitTake` (`src/core/recording/commitTake.ts`); empty takes create no
   * region. Editing actions target the selected region, defaulting to the most
   * recent one.
  ```
- [ ] **Step 5: Drop the `RecordMode` re-export** — in `src/hooks/index.ts` change line 4 from
  ```ts
  export type { RecordMode, UseStudioOptions, UseStudioResult } from './useStudio';
  ```
  to
  ```ts
  export type { UseStudioOptions, UseStudioResult } from './useStudio';
  ```
- [ ] **Step 6: Audit for dead identifiers** — Run: `grep -rn "recordMode\|RecordMode\|clearRegion" src/` — Expected: no matches.
- [ ] **Step 7: Run the full gate** — Run: `npx tsc --noEmit && npx expo lint && npx jest` — Expected: green, **11 suites / 230 tests**. (`tsc` is the real pin here: the `Region | null` return forces the null guard, and any surviving consumer of the removed fields fails compilation.)
- [ ] **Step 8: Commit**
  ```bash
  git add src/hooks/useStudio.ts src/hooks/index.ts
  git commit -m "refactor: useStudio uses pure commitTake; drop recordMode and clearRegion"
  ```

### Task 5: Update docs (`plan.md` note + README)

**Files:**
- Modify: `plan.md`
- Modify: `README.md` (`Project structure`, `Recording takes`, `Recording & waterfall`, `Known limitations`)

**Interfaces:**
- Consumes: the verified final state after Tasks 1–4 (re-run the gate first; expected **11 suites / 230 tests** — write the real numbers, not the expected ones, if they differ and investigate the diff before proceeding).
- Produces: documentation matching the code (repo convention: docs are corrected to reflect real state, as in the 2026-10-17 review).

- [ ] **Step 1: Add the dated note to `plan.md`** — append this bullet at the end of the `### 🟢 Completadas` list (after the "Hito Waterfall Continuo" bullet):

  ```markdown
  - [x] **Refactor de grabación (2026-10-18)** — el commit de tomas se extrajo a la función pura `commitTake` (`src/core/recording/commitTake.ts`, test-first, 10 tests): la región nace ahora en `sessionStartTick` (antes `startTick: 0` con notas en ticks absolutos, rompiendo el invariante de `regionEditing`) y su `lengthTick` cubre hasta el final de la última nota (sin el silencio final de la grabación). `useStudio` deja de exponer `recordMode`/`setRecordMode`/`clearRegion` y el tipo `RecordMode` (era un toggle sin efecto); se eliminaron los componentes sin cablear `TransportBar.tsx` y `RegionTools.tsx` con sus re-exports. `commitModes.ts` se conserva como capacidad futura sin plumbing. `tsc`/`lint`/`jest` en verde (**11 suites / 230 tests**).
  ```
- [ ] **Step 2: Fix the stale architecture line in `plan.md`** — line 38 (`- [x] UI: transporte, …`) currently credits `TransportBar` as a live component; change `` hecha (`Waterfall`, `PianoKeyboard`, `TransportBar`) `` to `` hecha (`Waterfall`, `PianoKeyboard`; transporte integrado en `index.tsx`) ``. (Lines 122/183 are historical records of past states — leave them.)
- [ ] **Step 3: Correct `README.md`** — four edits:
  1. `Project structure`: delete the lines for `TransportBar.tsx` and `RegionTools.tsx`.
  2. `Project structure`: change the `recording/` line to `recording/            Transport, RecordingSession, commitTake, commitModes, regionEditing, MidiOutPlayer`.
  3. `Recording takes` bullet (lines 26–28): append to its end: ` Commit goes through the pure \`commitTake\` (\`src/core/recording/commitTake.ts\`), so a region starts where the session started and its notes share the region's absolute-tick coordinates.`
  4. `Known limitations`: delete the first bullet (`` `TransportBar` and `RegionTools` components exist but are not wired into … ``). Keep the other limitations (region ops on-screen, `commitModes` not applied in the UI flow) — they remain true.
- [ ] **Step 4: Run the final DoD gate** — Run: `npx tsc --noEmit && npx expo lint && npx jest && npx expo-doctor` — Expected: all green; jest **11 suites / 230 tests**.
- [ ] **Step 5: Commit**
  ```bash
  git add plan.md README.md
  git commit -m "docs: record recording refactor in plan.md and README"
  ```

---

## Verification summary

| When | Command | Expected |
| --- | --- | --- |
| End of Task 1 | `npx jest src/core/recording/__tests__/commitTake.test.ts` | FAIL (module missing — intentional red) |
| End of Task 2 | `npx jest` → `npx tsc --noEmit` → `npx expo lint` | green; **11 suites / 230 tests** |
| End of Task 3 | `grep -rn "TransportBar\|RegionTools" src/` + full gate | no matches; green |
| End of Task 4 | `grep -rn "recordMode\|RecordMode\|clearRegion" src/` + full gate | no matches; green |
| End of Task 5 (plan DoD) | `npx tsc --noEmit && npx expo lint && npx jest && npx expo-doctor` | all green |
