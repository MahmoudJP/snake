# Changelog

## 2026-10-15 — Neon Coil update

- Publish the latest hardened engine, input, collision, timing and browser compatibility fixes.
- Add English, Arabic and Japanese UI, a complete power-up/food guide, local history with Clear/Undo, and explicit End run.
- Restore interrupted runs in a paused state with explicit Resume/Discard and validated versioned local checkpoints.
- Add dependency-free regression coverage for all engine plugins, localization, history and interrupted-run ownership.

# Changelog

## Unreleased

- Rebuilt the game as **Neon Circuit** with a responsive game shell and live
  score, level, combo, speed, length, power-up, and mode telemetry.
- Added Classic, Rush, and Zen modes with unique speed, wall, obstacle, combo,
  and progression rules.
- Added a mobile direction pad, swipe controls, keyboard restart, automatic
  pause on tab changes, sound/music/haptic toggles, and reduced-motion support.
- Added per-mode best scores and a clearer pause/game-over/replay flow.
- Fixed obstacle collisions, which previously did not end a run.
- Fixed rapid direction input so queued turns can no longer reverse the snake
  unfairly between movement steps.
- Improved screen-reader labels, keyboard focus, status announcements, and
  semantic controls around the canvas.
