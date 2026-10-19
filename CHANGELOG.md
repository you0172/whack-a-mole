# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Endless mode with accelerating spawns
- Daily seeded challenge
- Sound theme selector
- Local multi-player leaderboard

## [1.0.0] — 2026-10-19

### Added

- 60-second round loop with six difficulty levels
- Combo multiplier up to 5×, reset by bombs and escapes
- Three mole kinds: normal (+10), golden (+50), bomb (−25)
- Web Audio sound effects synthesised at runtime (hit, golden, bomb, escape, level-up, game over)
- Keyboard controls (`1`–`9`, `P`, `R`, `Space`) and screen-reader announcements
- Persisted personal best in `localStorage`, tolerant of storage failures
- Responsive dark UI with `prefers-reduced-motion` support
- Pure, dependency-injected game engine with 41 unit tests and ~99% coverage
- CI pipeline: lint, format check, typecheck, test, build
- Automatic deployment to GitHub Pages via GitHub Actions
