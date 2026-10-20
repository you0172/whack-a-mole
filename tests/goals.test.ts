import { describe, expect, it } from 'vitest';
import { GOAL_POOL, applyGoalBonus, goalProgress, pickGoal } from '../src/game/goals';
import { seededRandom } from '../src/game/engine';

const input = (overrides: Partial<Parameters<typeof goalProgress>[1]> = {}) => ({
  score: 0,
  bestCombo: 0,
  stats: { hits: 0, golden: 0, bombs: 0, escaped: 0, emptySwings: 0 },
  ...overrides,
});

describe('goal pool (R9)', () => {
  it('offers several distinct, reachable goals', () => {
    expect(GOAL_POOL.length).toBeGreaterThanOrEqual(4);
    const ids = GOAL_POOL.map((goal) => goal.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const goal of GOAL_POOL) {
      expect(goal.label.length).toBeGreaterThan(0);
      expect(goal.target).toBeGreaterThan(0);
    }
  });

  it('picks deterministically for the same seed', () => {
    const a = pickGoal(seededRandom(99));
    const b = pickGoal(seededRandom(99));
    expect(a.id).toBe(b.id);
  });

  it('never returns undefined, even for out-of-range rng values', () => {
    expect(pickGoal(() => 0).id).toBe(GOAL_POOL[0]!.id);
    expect(pickGoal(() => 1).id).toBe(GOAL_POOL[GOAL_POOL.length - 1]!.id);
  });
});

describe('goalProgress', () => {
  it('starts at zero and is not done', () => {
    const goal = GOAL_POOL.find((entry) => entry.id === 'hits30')!;
    const progress = goalProgress(goal, input());
    expect(progress.current).toBe(0);
    expect(progress.done).toBe(false);
    expect(progress.label).toBe(goal.label);
  });

  it('clamps the displayed progress to the target', () => {
    const goal = GOAL_POOL.find((entry) => entry.id === 'hits30')!;
    const progress = goalProgress(
      goal,
      input({ stats: { hits: 100, golden: 0, bombs: 0, escaped: 0, emptySwings: 0 } }),
    );
    expect(progress.current).toBe(goal.target);
    expect(progress.done).toBe(true);
  });

  it('counts golden hits towards the hit-count goal', () => {
    const goal = GOAL_POOL.find((entry) => entry.id === 'hits30')!;
    const progress = goalProgress(
      goal,
      input({ stats: { hits: 10, golden: 5, bombs: 0, escaped: 0, emptySwings: 0 } }),
    );
    expect(progress.current).toBe(15);
  });

  it('never reports negative progress', () => {
    const goal = GOAL_POOL.find((entry) => entry.id === 'score500')!;
    const progress = goalProgress(goal, input({ score: -50 }));
    expect(progress.current).toBe(0);
  });
});

describe('applyGoalBonus (R9: +20%)', () => {
  it('adds the bonus when the goal is met', () => {
    expect(applyGoalBonus(500, true, 0.2)).toBe(600);
  });

  it('rounds to an integer', () => {
    expect(applyGoalBonus(333, true, 0.2)).toBe(400);
  });

  it('leaves the score untouched when the goal is missed', () => {
    expect(applyGoalBonus(500, false, 0.2)).toBe(500);
  });
});
