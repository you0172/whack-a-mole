# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-20

This is the 1.0.0 delivery. It replaces the 2026-10-19 drop that also carried the
string `1.0.0` (commit `b0ca616`, still in history): that drop was never tagged or
released, and it shipped before the PRD v2.0 work existed. Both entries keep their
original dates so the record stays readable.

Implements PRD v2.0-a (feel and goals). Rule and value changes are cited to the
PRD section that requires them.

### Added

- **Round goal (R9).** Every round draws one reachable goal, shown in its own strip
  above the board; meeting it adds +20% to the final score and the bonus counts
  towards the personal best.
- **Daily challenge (R10).** A date-derived seed gives everyone the same round;
  the entry sits on the start screen and the seed is injectable, so the run is
  reproducible.
- **Analytics pipeline (R14).** The eight events from appendix C are emitted with
  their PRD payloads. The default transport is `null` — events are buffered in
  memory and nothing is sent anywhere (Q3 is still open).
- **Save file (R4.10).** `wam.save.v1` holds best score, best combo, daily state,
  achievements and audio settings, and migrates the v1 key additively: a missing
  field takes its default, an unknown one is dropped, records are never wiped.
- **Hit feedback (§4.6).** Hole press, 4–6 particles (24 on screen max), floating
  +10 / +50 / −25 (4 max, oldest replaced), a frame glow from 3× combo, and the
  PRD sound spec: 620 Hz square for a hit, a 660/880/1100 arpeggio for golden, a
  220 → 60 Hz sawtooth fall for bombs, and a dry tick for a miss.
- **Verification tooling.** `npm run verify` (typecheck + tests + coverage + build
  - 20 KB gzip gate) and `npm run smoke`, which plays a real round in headless
    Edge over CDP and writes screenshots plus `artifacts/smoke-result.json`.

### Changed

- **Difficulty is 10 s per level (Q2).** v1 used 12 s × 6 = 72 s inside a 60 s
  round, so level 6 was unreachable. The new clock makes all six levels fit.
- **Target weights and gating (§4.3.1, table 15).** Bombs 12% → 18%, golden
  10% → 12%; level 1 shows only normal moles, golden moles start at L2 and bombs
  at L3.
- **Fairness rules (§4.5).** A hole is not reused within two spawns, a bomb and a
  golden mole never share the board, and two spawns are never closer than 120 ms.
- **First target within 400 ms (R1).** The spawn accumulator is primed on start
  instead of waiting out a full interval.
- **Pause covers the difficulty clock (review #14)** and ignores prerender or
  background-prefetch `visibilitychange` events (review #20).
- **HUD (§4.8).** Five items with the combo cell showing the live multiplier.
- **Settlement (§4.8).** Order fixed to score → record → best combo → goal result
  → play again, with the supporting stats demoted to one quiet line.
- **Interface language.** Player-facing copy is zh-CN (N5) and lives in
  `src/copy.ts`.
- **Coverage gate** now spans `src/game` and `src/storage` with a 95% statement
  threshold (§6 可测性).

### Fixed

- **Settlement no longer cuts a round short (R6).** Hitting zero used to clear the
  board and settle instantly; now spawning stops at the bell while in-flight targets
  finish their ttl (whackable), with a 1.6 s grace cap so a stuck target cannot hold
  the round open.
- **"Longest combo" is real data (PRD §4.9).** The browser was writing total round
  time into `bestComboMs`. The engine now tracks when a combo started, folds its
  length in when the combo breaks, and exposes `comboMs`; the save gets a real value.
- **A daily round counts as played when it ends (R10).** Marking it done was gated
  behind achieving the round goal, so most days never registered.
- **Focus returns to the board** when the overlay closes instead of staying on a
  node that was just hidden (R12).
- **Lint is green again.** `scripts/*.mjs` are outside the TypeScript project, so the
  type-aware rules could not parse them; they are ignored like the existing
  `docs/capture.mjs`, and `asNonNegativeInt` no longer stringifies unknown input
  (`no-base-to-string`).
- **Formatting is green again** and generated `artifacts/` are ignored by prettier
  and git.
- Moles could overflow their hole and paint over the footer — holes now clip
  their mole, and the browser smoke test asserts it.
- `visibilitychange` fired by prerender no longer pauses a round that has not
  been played yet.
- Mid-round exits report a partial `round_end` on `pagehide` (review #21).
- The browser smoke test no longer takes its start-screen screenshot before the
  timing assertions: a full-page capture stalled the renderer and made a healthy
  250 ms first target look like 934 ms.

### Removed

- `src/storage/highscores.ts` and its test, superseded by the save module.

### Deferred

- Offline PWA (R13, SHOULD) and the share card (v2.0-c).

## [Unreleased]

### Planned

- Endless mode with accelerating spawns
- Sound theme selector
- Local multi-player leaderboard
- Offline PWA (R13) and the 1080×1350 share card (v2.0-c)

## [1.0.0] — 2026-10-19 (superseded)

Untagged, unreleased drop that carried the same version string. Kept for the record;
the 2026-10-20 entry above is the delivery.

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
