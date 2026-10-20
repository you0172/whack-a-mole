import { levelAt, spawnIntervalAt, ttlAt } from './difficulty';
import { applyGoalBonus, goalProgress, pickGoal, type GoalDefinition } from './goals';
import { multiplierFor, pointsFor } from './scoring';
import {
  createConfig,
  type GameConfig,
  type GameEvent,
  type GameSnapshot,
  type GoalProgress,
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
 * The engine owns *all* game rules from PRD v2.0: spawn cadence, the six-step
 * difficulty ramp, target weights with per-level gating, the five fairness rules
 * in §4.5, scoring, the round goal (R9) and the goal bonus.
 *
 * It never touches the DOM and takes its randomness from an injected
 * `RandomSource` (ADR D3), which makes every rule — including the daily-challenge
 * seed — directly testable and replayable.
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
  /** Milliseconds since the last spawn, for the 120 ms breathing rule. */
  private sinceSpawnMs = 0;
  private hasSpawned = false;
  /** Holes used by the most recent spawns, for the same-hole cooldown rule. */
  private recentHoles: number[] = [];
  private nextId = 1;
  private stats: RoundStats = emptyStats();
  private goal: GoalDefinition;
  private goalReached = false;
  /** Regulation time is over: no new targets, but in-flight ones still resolve (R6). */
  private timeUp = false;
  /** Time spent in that settle window, so it can never hang. */
  private settleMs = 0;
  /** When the current combo started; -1 when no combo is running. */
  private comboStartedMs = -1;
  /** Longest completed combo streak, in milliseconds (PRD §4.9 record #3). */
  private bestComboMs = 0;

  constructor(config: Partial<GameConfig> = {}, rng: RandomSource = Math.random) {
    this.config = createConfig(config);
    this.rng = rng;
    this.goal = pickGoal(this.rng);
  }

  get snapshot(): GameSnapshot {
    const progress = this.goalProgressNow();
    return {
      phase: this.phase,
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      multiplier: multiplierFor(this.combo, this.config),
      level: this.level,
      elapsedMs: this.elapsedMs,
      remainingMs: Math.max(0, this.config.roundMs - this.elapsedMs),
      roundMs: this.config.roundMs,
      moles: this.moles.map((mole) => ({ ...mole })),
      stats: { ...this.stats },
      goal: progress,
      finalScore: applyGoalBonus(this.score, progress.done, this.config.goalBonusRate),
      comboMs: Math.max(
        this.bestComboMs,
        this.comboStartedMs >= 0 ? this.elapsedMs - this.comboStartedMs : 0,
      ),
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
    this.moles = [];
    this.nextId = 1;
    this.stats = emptyStats();
    this.goal = pickGoal(this.rng);
    this.goalReached = false;
    this.hasSpawned = false;
    this.sinceSpawnMs = 0;
    this.recentHoles = [];
    this.timeUp = false;
    this.settleMs = 0;
    this.comboStartedMs = -1;
    this.bestComboMs = 0;
    // R1: the first target must appear within 400 ms of the start input, so prime
    // the accumulator instead of waiting a full spawn interval.
    this.spawnAccMs = Math.max(0, spawnIntervalAt(1, this.config) - this.config.firstSpawnDelayMs);
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
   * Advance the simulation by `dtMs` and return everything that happened, in
   * order. A delta larger than the round length ends the round immediately.
   */
  tick(dtMs: number): GameEvent[] {
    if (this.phase !== 'playing') return [];

    const events: GameEvent[] = [];
    const dt = Math.max(0, dtMs);
    if (dt === 0) return events;

    // Regulation time freezes at roundMs; anything after that is the settle window
    // where already-exposed targets finish their ttl (R6).
    if (this.timeUp) this.settleMs += dt;
    else this.elapsedMs += dt;
    this.sinceSpawnMs += dt;

    // The bell closes spawning for the remainder of this tick, so no target can
    // appear after the timer reads zero.
    const atBell = !this.timeUp && this.elapsedMs >= this.config.roundMs;

    // 1. Age the exposed moles and let the slow ones escape.
    const survivors: Mole[] = [];
    for (const mole of this.moles) {
      const remainingMs = mole.remainingMs - dt;
      if (remainingMs > 0) {
        survivors.push({ ...mole, remainingMs });
      } else {
        this.stats.escaped += 1;
        // PRD §4.3.2: an escape costs the combo but never points (Q4 default).
        this.breakCombo();
        events.push({ type: 'escape', mole });
      }
    }
    this.moles = survivors;

    // 2. Spawn new moles. The interval shrinks as the level rises, so it is
    //    re-read after every spawn. The 120 ms breathing rule caps the rate.
    this.spawnAccMs += dt;
    for (;;) {
      if (this.timeUp || atBell) break;
      const interval = spawnIntervalAt(this.level, this.config);
      if (this.spawnAccMs < interval) break;
      if (this.hasSpawned && this.sinceSpawnMs < this.config.breatheMs) break;
      this.spawnAccMs -= interval;
      const spawned = this.spawnOne();
      if (!spawned) break;
      this.sinceSpawnMs = 0;
      this.hasSpawned = true;
      events.push({ type: 'spawn', mole: spawned });
    }

    // 3. Difficulty ramp. Level timing uses accumulated playing time only, so a
    //    pause freezes the curve together with the clock (review #14).
    const nextLevel = levelAt(this.elapsedMs, this.config);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      events.push({ type: 'levelup', level: nextLevel });
    }

    // 4. Goal completion, checked before gameover so the settling round keeps it.
    const progress = this.goalProgressNow();
    if (progress.done && !this.goalReached) {
      this.goalReached = true;
      events.push({ type: 'goal', goal: progress });
    }

    // 5. Regulation ends: stop spawning, keep whatever is on the board.
    if (atBell) {
      this.elapsedMs = this.config.roundMs;
      this.timeUp = true;
    }

    // 6. Settle once the last in-flight target is resolved, or when the grace cap
    //    runs out so a stuck target can never hold the round open.
    if (this.timeUp && (this.moles.length === 0 || this.settleMs >= this.config.settleGraceMs)) {
      this.phase = 'over';
      this.moles = [];
      this.spawnAccMs = 0;
      this.breakCombo();
      events.push({ type: 'gameover' });
    }

    return events;
  }

  /**
   * Attempt to whack the mole in `hole`. Whacking an empty hole is harmless:
   * it is counted as a miss for analytics but never punished (R2).
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

  /** Round goal, exposed for the settlement screen and analytics (R9 / R14). */
  get goalDefinition(): GoalDefinition {
    return this.goal;
  }

  private goalProgressNow(): GoalProgress {
    return goalProgress(this.goal, {
      score: this.score,
      bestCombo: this.bestCombo,
      stats: this.stats,
    });
  }

  /**
   * End the running combo and fold its length into the round record (PRD §4.9
   * keeps "longest combo streak" as one of the three personal records).
   */
  private breakCombo(): void {
    if (this.comboStartedMs >= 0) {
      this.bestComboMs = Math.max(this.bestComboMs, this.elapsedMs - this.comboStartedMs);
    }
    this.combo = 0;
    this.comboStartedMs = -1;
  }

  private scoreHit(mole: Mole): WhackResult {
    if (mole.kind === 'bomb') {
      this.stats.bombs += 1;
      this.breakCombo();
      const points = pointsFor('bomb', 1, this.config);
      // Review #13: clamping to 0 is the whole story — later hits keep adding from 0.
      this.score = Math.max(0, this.score + points);
      return { outcome: 'bomb', points, combo: 0, multiplier: 1, mole };
    }

    if (this.combo === 0) this.comboStartedMs = this.elapsedMs;
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
    const recent = new Set(this.recentHoles);

    const all: number[] = [];
    const free: number[] = [];
    for (let hole = 0; hole < this.config.holes; hole += 1) {
      if (occupied.has(hole)) continue;
      all.push(hole);
      if (!recent.has(hole)) free.push(hole);
    }

    // Prefer a hole that respects the cooldown, but never fail to spawn just
    // because every remaining hole was recently used.
    const pool = free.length > 0 ? free : all;
    if (pool.length === 0) return null;

    const hole = pool[Math.floor(this.rng() * pool.length)] ?? pool[0]!;
    this.recentHoles.push(hole);
    while (this.recentHoles.length > Math.max(0, this.config.holeCooldown)) {
      this.recentHoles.shift();
    }

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

  /**
   * Weighted type draw with per-level gating (PRD table 15) and the §4.5 rule
   * that a bomb and a golden mole are never on the board at the same time.
   */
  private pickKind(): MoleKind {
    const hasGolden = this.moles.some((mole) => mole.kind === 'golden');
    const hasBomb = this.moles.some((mole) => mole.kind === 'bomb');

    const goldenAllowed = this.level >= this.config.goldenFromLevel && !hasBomb;
    const bombAllowed = this.level >= this.config.bombFromLevel && !hasGolden;

    const roll = this.rng();
    if (goldenAllowed && roll < this.config.goldenChance) return 'golden';
    if (
      bombAllowed &&
      roll >= this.config.goldenChance &&
      roll < this.config.goldenChance + this.config.bombChance
    ) {
      return 'bomb';
    }
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
