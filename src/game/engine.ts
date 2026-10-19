import { levelAt, spawnIntervalAt, ttlAt } from './difficulty';
import { multiplierFor, pointsFor } from './scoring';
import {
  createConfig,
  type GameConfig,
  type GameEvent,
  type GameSnapshot,
  type Mole,
  type MoleKind,
  type Phase,
  type RoundStats,
  type WhackResult,
} from './types';

export type RandomSource = () => number;

const emptyStats = (): RoundStats => ({
  hits: 0,
  golden: 0,
  bombs: 0,
  escaped: 0,
  emptySwings: 0,
});

/**
 * Deterministic, framework-agnostic game engine.
 *
 * The engine owns *all* game rules. It never touches the DOM and takes its
 * randomness from an injected `RandomSource`, which makes every rule — spawn
 * timing, difficulty ramps, scoring — directly testable.
 *
 * Drive it with `tick(dtMs)` (typically from `requestAnimationFrame`) and read
 * the latest state with `snapshot`.
 */
export class GameEngine {
  readonly config: GameConfig;

  private readonly rng: RandomSource;
  private phase: Phase = 'idle';
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private level = 1;
  private elapsedMs = 0;
  private moles: Mole[] = [];
  private spawnAccMs = 0;
  private nextId = 1;
  private stats: RoundStats = emptyStats();

  constructor(config: Partial<GameConfig> = {}, rng: RandomSource = Math.random) {
    this.config = createConfig(config);
    this.rng = rng;
  }

  get snapshot(): GameSnapshot {
    return {
      phase: this.phase,
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      level: this.level,
      elapsedMs: this.elapsedMs,
      remainingMs: Math.max(0, this.config.roundMs - this.elapsedMs),
      roundMs: this.config.roundMs,
      moles: this.moles.map((mole) => ({ ...mole })),
      stats: { ...this.stats },
    };
  }

  /** Begin a fresh round. Calling this mid-round restarts immediately. */
  start(): void {
    this.phase = 'playing';
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.level = 1;
    this.elapsedMs = 0;
    this.spawnAccMs = 0;
    this.nextId = 1;
    this.moles = [];
    this.stats = emptyStats();
  }

  pause(): void {
    if (this.phase === 'playing') this.phase = 'paused';
  }

  resume(): void {
    if (this.phase === 'paused') this.phase = 'playing';
  }

  togglePause(): void {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  /**
   * Advance the simulation by `dtMs` and return everything that happened,
   * in order. A delta larger than the round length ends the round immediately.
   */
  tick(dtMs: number): GameEvent[] {
    if (this.phase !== 'playing') return [];

    const events: GameEvent[] = [];
    const dt = Math.max(0, dtMs);
    if (dt === 0) return events;

    this.elapsedMs += dt;

    // 1. Age the exposed moles and let the slow ones escape.
    const survivors: Mole[] = [];
    for (const mole of this.moles) {
      const remainingMs = mole.remainingMs - dt;
      if (remainingMs > 0) {
        survivors.push({ ...mole, remainingMs });
      } else {
        this.stats.escaped += 1;
        this.combo = 0;
        events.push({ type: 'escape', mole });
      }
    }
    this.moles = survivors;

    // 2. Spawn new moles. The interval shrinks as the level rises, so we
    //    re-read it after every spawn.
    this.spawnAccMs += dt;
    for (;;) {
      const interval = spawnIntervalAt(this.level, this.config);
      if (this.spawnAccMs < interval) break;
      this.spawnAccMs -= interval;
      const spawned = this.spawnOne();
      if (spawned) events.push({ type: 'spawn', mole: spawned });
    }

    // 3. Difficulty ramp.
    const nextLevel = levelAt(this.elapsedMs, this.config);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      events.push({ type: 'levelup', level: nextLevel });
    }

    // 4. Round end.
    if (this.elapsedMs >= this.config.roundMs) {
      this.elapsedMs = this.config.roundMs;
      this.phase = 'over';
      this.moles = [];
      this.spawnAccMs = 0;
      events.push({ type: 'gameover' });
    }

    return events;
  }

  /**
   * Attempt to whack the mole in `hole`. Whacking an empty hole is harmless
   * but breaks the combo-detection myth: it is recorded, not punished.
   */
  whack(hole: number): WhackResult {
    if (this.phase !== 'playing') {
      return { outcome: 'ignored', points: 0, combo: this.combo, multiplier: 1, mole: null };
    }

    const index = this.moles.findIndex((mole) => mole.hole === hole);
    if (index === -1) {
      this.stats.emptySwings += 1;
      return {
        outcome: 'empty',
        points: 0,
        combo: this.combo,
        multiplier: multiplierFor(this.combo, this.config),
        mole: null,
      };
    }

    const mole = this.moles[index]!;
    this.moles = this.moles.filter((_, i) => i !== index);

    return this.scoreHit(mole);
  }

  private scoreHit(mole: Mole): WhackResult {
    if (mole.kind === 'bomb') {
      this.stats.bombs += 1;
      this.combo = 0;
      const points = pointsFor('bomb', 1, this.config);
      this.score = Math.max(0, this.score + points);
      return { outcome: 'bomb', points, combo: 0, multiplier: 1, mole };
    }

    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const multiplier = multiplierFor(this.combo, this.config);
    const points = pointsFor(mole.kind, multiplier, this.config);
    this.score += points;

    if (mole.kind === 'golden') this.stats.golden += 1;
    else this.stats.hits += 1;

    return {
      outcome: mole.kind === 'golden' ? 'golden' : 'hit',
      points,
      combo: this.combo,
      multiplier,
      mole,
    };
  }

  private spawnOne(): Mole | null {
    const occupied = new Set(this.moles.map((mole) => mole.hole));
    const free: number[] = [];
    for (let hole = 0; hole < this.config.holes; hole += 1) {
      if (!occupied.has(hole)) free.push(hole);
    }
    if (free.length === 0) return null;

    const hole = free[Math.floor(this.rng() * free.length)] ?? free[0]!;
    const kind = this.pickKind();
    const ttlMs =
      kind === 'golden'
        ? Math.round(ttlAt(this.level, this.config) * this.config.goldenTtlFactor)
        : ttlAt(this.level, this.config);

    const mole: Mole = {
      id: this.nextId,
      hole,
      kind,
      remainingMs: ttlMs,
      ttlMs,
    };
    this.nextId += 1;
    this.moles = [...this.moles, mole];
    return mole;
  }

  private pickKind(): MoleKind {
    const roll = this.rng();
    if (roll < this.config.bombChance) return 'bomb';
    if (roll < this.config.bombChance + this.config.goldenChance) return 'golden';
    return 'normal';
  }
}

/** Small, dependency-free PRNG (mulberry32) — handy for tests and replays. */
export const seededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
