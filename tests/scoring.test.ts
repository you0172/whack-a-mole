import { describe, expect, it } from 'vitest';
import { createConfig } from '../src/game/types';
import { basePointsFor, multiplierFor, pointsFor, rankFor } from '../src/game/scoring';

const config = createConfig({
  comboStep: 5,
  maxMultiplier: 5,
  points: { normal: 10, golden: 50, bomb: 25 },
});

describe('multiplierFor', () => {
  it('stays at 1x for the first combo step', () => {
    expect(multiplierFor(0, config)).toBe(1);
    expect(multiplierFor(4, config)).toBe(1);
  });

  it('climbs by one every comboStep hits', () => {
    expect(multiplierFor(5, config)).toBe(2);
    expect(multiplierFor(10, config)).toBe(3);
    expect(multiplierFor(15, config)).toBe(4);
  });

  it('caps at maxMultiplier', () => {
    expect(multiplierFor(20, config)).toBe(5);
    expect(multiplierFor(500, config)).toBe(5);
  });

  it('treats negative combos defensively', () => {
    expect(multiplierFor(-3, config)).toBe(1);
  });

  it('degrades gracefully with comboStep = 0', () => {
    expect(multiplierFor(10, createConfig({ comboStep: 0 }))).toBe(1);
  });
});

describe('basePointsFor', () => {
  it('returns positive points for moles and a negative score for bombs', () => {
    expect(basePointsFor('normal', config)).toBe(10);
    expect(basePointsFor('golden', config)).toBe(50);
    expect(basePointsFor('bomb', config)).toBe(-25);
  });
});

describe('pointsFor', () => {
  it('scales with the combo multiplier', () => {
    expect(pointsFor('normal', 1, config)).toBe(10);
    expect(pointsFor('normal', 3, config)).toBe(30);
    expect(pointsFor('golden', 2, config)).toBe(100);
  });

  it('penalises bombs without multiplying the penalty', () => {
    expect(pointsFor('bomb', 1, config)).toBe(-25);
  });
});

describe('rankFor', () => {
  it('maps scores to increasing ranks', () => {
    expect(rankFor(0).label).toBe('Warming Up');
    expect(rankFor(400).label).toBe('Rookie');
    expect(rankFor(1200).label).toBe('Getting Warm');
    expect(rankFor(2500).label).toBe('Sharpshooter');
    expect(rankFor(4000).label).toBe('Mole Hunter');
    expect(rankFor(9999).label).toBe('Legendary');
  });

  it('returns the lowest rank for negative input', () => {
    expect(rankFor(-100).label).toBe('Warming Up');
  });
});
