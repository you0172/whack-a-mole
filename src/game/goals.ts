import type { GoalProgress, RoundStats } from './types';

export type RandomSource = () => number;

/** What a goal measures: the numbers the engine already tracks each round. */
export interface GoalInput {
  readonly score: number;
  readonly bestCombo: number;
  readonly stats: Readonly<RoundStats>;
}

export interface GoalDefinition {
  readonly id: string;
  /** Amount of `measure` needed to complete the goal. */
  readonly target: number;
  /** Text shown in the HUD, before progress is appended. */
  readonly label: string;
  /** How far the player currently is. */
  measure(input: GoalInput): number;
}

/**
 * The round-goal pool (PRD §4.9, R9).
 *
 * Every goal is reachable in one round by a competent player and none of them
 * punish failure: missing a goal costs the bonus, never points.
 */
export const GOAL_POOL: readonly GoalDefinition[] = [
  {
    id: 'combo3',
    target: 15,
    label: '连击到 3× 倍率',
    measure: (input) => input.bestCombo,
  },
  {
    id: 'score500',
    target: 500,
    label: '本局拿到 500 分',
    measure: (input) => input.score,
  },
  {
    id: 'golden3',
    target: 3,
    label: '命中 3 只金鼠',
    measure: (input) => input.stats.golden,
  },
  {
    id: 'hits30',
    target: 30,
    label: '命中 30 次',
    measure: (input) => input.stats.hits + input.stats.golden,
  },
];

/** Pick the round goal. Deterministic for a given random source (R10). */
export const pickGoal = (rng: RandomSource): GoalDefinition => {
  const index = Math.floor(rng() * GOAL_POOL.length);
  return GOAL_POOL[Math.min(Math.max(index, 0), GOAL_POOL.length - 1)]!;
};

/** Snapshot the goal's progress for the HUD and the settlement screen. */
export const goalProgress = (goal: GoalDefinition, input: GoalInput): GoalProgress => {
  const current = Math.max(0, goal.measure(input));
  return {
    id: goal.id,
    label: goal.label,
    current: Math.min(current, goal.target),
    target: goal.target,
    done: current >= goal.target,
  };
};

/** Round score including the goal bonus (R9: +20%, counted into the record). */
export const applyGoalBonus = (score: number, done: boolean, rate: number): number =>
  done ? Math.round(score * (1 + rate)) : score;
