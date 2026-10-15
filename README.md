# Neon Coil

A polished, dependency-free Snake game for desktop and mobile. It runs entirely
in the browser and includes three distinct circuits, responsive touch controls,
combos, evolving levels, arena hazards, special food, power-ups, procedural
audio, motion preferences, and per-mode personal bests.

## Play locally

Open `index.html` directly, or serve this folder with any static file server.
No install or build step is required.

## Controls

- Arrow keys or WASD: move
- Space, P, or Escape: pause and resume
- R: restart
- Touch: swipe on the arena or use the on-screen direction pad

## Game modes

- **Classic Circuit:** balanced speed, wrap walls, and evolving obstacles.
- **Rush Protocol:** faster movement, hard walls, and earlier hazards.
- **Zen Flow:** slower movement, wrap walls, and no arena obstacles.

Scores and preferences are stored only in the current browser. The published GitHub source is also previewed inside Mahmoud Studio. The latest published main branch is streamed by the existing owner-only Mahmoud Studio runner.


## Regression checks

Run `node scripts/test-neon-coil.mjs`. The harness loads every plugin and verifies movement, collision protection, modes, arena hazards, timers, input, storage migration, pause, time freeze, berry scoring, and circuit completion.

This repository is the game source. The Koryuu portfolio embeds the same static files under `public/play/neon-coil`; synchronize and validate both copies when updating the game.

Letter controls use physical W/A/S/D/P/R keys, so alternate language layouts remain playable. IME composition and editable fields are excluded. Vibration requires browser/device support; otherwise its control is disabled. Choose English, Arabic or Japanese before a run. The guide explains every power/food and pauses play while open. Recent runs are saved locally; Clear offers Undo and retains best scores. See `docs/STATUS.md` for current validation and remaining device boundaries.
