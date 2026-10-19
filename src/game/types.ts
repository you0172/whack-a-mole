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

/** Everything the renderer needs, produced by the engine on demand. */
export interface GameSnapshot {
  readonly phase: Phase;
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly level: number;
  readonly elapsedMs: number;
  readonly remainingMs: number;
  readonly roundMs: number;
  readonly moles: readonly Mole[];
  readonly stats: Readonly<RoundStats>;
}

/** Side effects the engine reports so the UI layer can react. */
export type GameEvent =
  | { readonly type: 'spawn'; readonly mole: Mole }
  | { readonly type: 'escape'; readonly mole: Mole }
  | { readonly type: 'levelup'; readonly level: number }
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
  readonly bombChance: number;
  readonly goldenChance: number;
  readonly comboStep: number;
  readonly maxMultiplier: number;
  readonly points: {
    readonly normal: number;
    readonly golden: number;
    readonly bomb: number;
  };
}

export const DEFAULT_CONFIG: GameConfig = {
  holes: 9,
  roundMs: 60_000,
  levelDurationMs: 12_000,
  maxLevel: 6,
  baseSpawnMs: 900,
  minSpawnMs: 340,
  baseTtlMs: 1_500,
  minTtlMs: 650,
  goldenTtlFactor: 0.7,
  bombChance: 0.12,
  goldenChance: 0.1,
  comboStep: 5,
  maxMultiplier: 5,
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
