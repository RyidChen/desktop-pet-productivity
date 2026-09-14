# Desktop Pet Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in this session. Steps use checkbox syntax for tracking.

**Goal:** Deliver a runnable Windows transparent pet with a collapsible focus panel, music, tasks and local persistence.
**Architecture:** Electron main process owns timer, storage and window placement. Two isolated renderers display pet/panel; the hidden panel keeps Web Audio running. Plain JS/CSS/SVG, no UI framework.
**Tech Stack:** Electron, Node built-in test runner, Web Audio, original SVG artwork.
**Spec:** `docs/superpowers/specs/2026-09-10-desktop-pet-design.md` (approved September 10).

## Global Constraints
- Windows first; Traditional Chinese; warm white and sage; original 2D cat.
- No accounts, remote pages, downloaded copyrighted media, or frontend framework.
- Main-process timer; hidden panel must not interrupt audio or timer.
- Sleep pauses; restart restores paused; split statistics at local midnight.
- Persist JSON atomically with backup; warn on storage and media errors.

## Task 1 — Timer, tasks, persistence
Files: `src/model.cjs`, `src/store.cjs`, `tests/model.test.cjs`, `tests/store.test.cjs`, `package.json`.
Interfaces: `FocusModel(saved)`, `dispatch(action, payload, now)`, `tick(now)`, `snapshot(now)`, `pause(now)`; `Store(directory).load()/save(data)`.
- [x] Write tests for pause/resume, delayed tick completing once, midnight split, task validation, restart excluding offline time, malformed primary recovering backup.
- [x] Run `node --test tests/*.test.cjs` and observe missing behavior.
- [x] Implement deadline-based accounting: consume `min(now, deadline)-lastTick`, divide at local midnight, complete only once, select next mode without auto-start.
- [x] Implement validated task mutations and JSON backup/atomic replacement; preserve corrupted originals.
- [x] Run tests until all real behavioral assertions pass.

## Task 2 — Desktop and visual interface
Files: `src/main.cjs`, `src/preload.cjs`, `src/ui/pet.html`, `src/ui/panel.html`, `src/ui/pet.js`, `src/ui/panel.js`, `src/ui/styles.css`, `src/ui/cat.svg`, `src/ui/audio.js`.
Interfaces: preload exposes only `getState`, `act`, `onState`, `onNotice`, `windowAction`, `chooseMusic`, `readMusic`, `drag`, `hitTest`. Validate all main-process inputs and sender roles.
- [x] Add launch integration check to confirm both pages load, UI buttons mutate real main state, renderer errors are absent, and hidden panel retains playback.
- [x] Create transparent pet window (240×230), warm panel (380×740 constrained to work area), tray, position clamping, forward mouse input only over noninteractive regions.
- [x] Build original cat with SVG body, ears, eyes, scarf, tail and book; animate breathing/blinking and react to timer phase and head movement.
- [x] Build accessible panel with clear primary timer action, edit durations, task entry/list, audio rows, volume controls and daily statistics.
- [x] Implement ambient pentatonic instrument loop plus filtered rain noise in Web Audio. A user gesture starts audio; use audio buffers for selected local MP3/WAV, report decoding failures.
- [x] Add power suspend handler, periodic snapshot saving, renderer security restrictions and tray exit.
- [x] Exercise launch and timer/task/audio interactions against Electron itself. Capture rendered screenshots for visual inspection.

## Task 3 — Delivery and verification
Files: `scripts/package.cjs`, `scripts/smoke.cjs`, `README.md`, `docs/verification.md`, `Start Mori.cmd`.
- [x] Provide a portable Windows folder by copying Electron distribution and app sources using Node filesystem APIs; no extra packaging dependency.
- [x] Provide a double-click launcher for the development version and document portable executable, imported music, storage and exit behavior.
- [x] Run unit tests, real Electron smoke test, JavaScript syntax checks and portable packaging. Check native transparency/drag/click-through if available; report what cannot be observed.
- [x] Review scope against the approved design, fix actual gaps, record evidence and leave the runnable app for the user.

Workspace note: this is a new, dedicated folder with no existing Git repository or baseline tests; work directly here. No existing branch needs isolation or merging.
