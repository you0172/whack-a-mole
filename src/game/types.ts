/** The three things that can pop out of a hole. */
export type MoleKind = 'normal' | 'golden' | 'bomb';

/** High-level state machine phases. */
export type Phase = 'idle' | 'playing' | 'paused' | 'over';

/** Immutable description of one currently exposed mole. */
export interface Mole {
  readonly id: number;
  readonly hole: number;
  readonly kind: MoleKind;
  /** Milliseconds left before the mole escapes. */
  readonly remainingMs: number;
  /** Total lifespan this mole was given. */
  readonly ttlMs: number;
}

/** Aggregate counters for the current round. */
export interface RoundStats {
  hits: number;
  golden: number;
  bombs: number;
  escaped: number;
  emptySwings: number;
}

/** Progress of the round goal, rendered in the HUD and at settlement. */
export interface GoalProgress {
  readonly id: string;
  /** Localised, already-formatted description shown to the player. */
  readonly label: string;
  readonly current: number;
  readonly target: number;
  readonly done: boolean;
}

/** Everything the renderer needs, produced by the engine on demand. */
export interface GameSnapshot {
  readonly phase: Phase;
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly multiplier: number;
  readonly level: number;
  readonly elapsedMs: number;
  readonly remainingMs: number;
  readonly roundMs: number;
  readonly moles: readonly Mole[];
  readonly stats: Readonly<RoundStats>;
  readonly goal: GoalProgress;
  /** Score including the goal bonus — this is the number written to the record. */
  readonly finalScore: number;
  /** Longest combo streak this round, in milliseconds (PRD §4.9 record #3). */
  readonly comboMs: number;
}

/** Side effects the engine reports so the UI layer can react. */
export type GameEvent =
  | { readonly type: 'spawn'; readonly mole: Mole }
  | { readonly type: 'escape'; readonly mole: Mole }
  | { readonly type: 'levelup'; readonly level: number }
  | { readonly type: 'goal'; readonly goal: GoalProgress }
  | { readonly type: 'gameover' };

/** Outcome of a player whacking a hole. */
export type WhackOutcome = 'hit' | 'golden' | 'bomb' | 'empty' | 'ignored';

export interface WhackResult {
  readonly outcome: WhackOutcome;
  readonly points: number;
  readonly combo: number;
  readonly multiplier: number;
  readonly mole: Mole | null;
}

/** Tunable rules. All durations in milliseconds. */
export interface GameConfig {
  readonly holes: number;
  readonly roundMs: number;
  readonly levelDurationMs: number;
  readonly maxLevel: number;
  readonly baseSpawnMs: number;
  readonly minSpawnMs: number;
  readonly baseTtlMs: number;
  readonly minTtlMs: number;
  readonly goldenTtlFactor: number;
  /** Weight of bombs in the type draw (PRD table 13: ~18%). */
  readonly bombChance: number;
  /** Weight of golden moles in the type draw (PRD table 13: ~12%). */
  readonly goldenChance: number;
  /** Earliest level that may spawn a golden mole (PRD table 15: L2). */
  readonly goldenFromLevel: number;
  /** Earliest level that may spawn a bomb (PRD table 15: L3). */
  readonly bombFromLevel: number;
  /** Minimum gap between two spawns — the "breathing" rule (PRD §4.5: 120 ms). */
  readonly breatheMs: number;
  /** How many previous spawns must not reuse the same hole (PRD §4.5 / review #15). */
  readonly holeCooldown: number;
  /** Consecutive hits per extra multiplier step (PRD §4.3.2: every 5). */
  readonly comboStep: number;
  readonly maxMultiplier: number;
  /** Delay before the first target of a round, so R1's 400 ms promise holds. */
  readonly firstSpawnDelayMs: number;
  /** Hard cap on the post-round settle window, so a stuck target cannot hang it (R6). */
  readonly settleGraceMs: number;
  /** Bonus rate applied to the round score when the goal is met (R9: +20%). */
  readonly goalBonusRate: number;
  readonly points: {
    readonly normal: number;
    readonly golden: number;
    readonly bomb: number;
  };
}

export const DEFAULT_CONFIG: GameConfig = {
  holes: 9,
  roundMs: 60_000,
  // PRD §4.4 / Q2: six levels must fit inside a 60 s round, so 10 s each.
  levelDurationMs: 10_000,
  maxLevel: 6,
  baseSpawnMs: 900,
  minSpawnMs: 340,
  baseTtlMs: 1_500,
  minTtlMs: 650,
  goldenTtlFactor: 0.7,
  bombChance: 0.18,
  goldenChance: 0.12,
  goldenFromLevel: 2,
  bombFromLevel: 3,
  breatheMs: 120,
  holeCooldown: 2,
  comboStep: 5,
  maxMultiplier: 5,
  goalBonusRate: 0.2,
  firstSpawnDelayMs: 250,
  settleGraceMs: 1_600,
  points: {
    normal: 10,
    golden: 50,
    bomb: 25,
  },
};

export const createConfig = (overrides: Partial<GameConfig> = {}): GameConfig => ({
  ...DEFAULT_CONFIG,
  ...overrides,
  points: { ...DEFAULT_CONFIG.points, ...overrides.points },
});
