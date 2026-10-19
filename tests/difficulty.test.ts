import { describe, expect, it } from 'vitest';
import { createConfig } from '../src/game/types';
import { difficultyRatio, levelAt, spawnIntervalAt, ttlAt } from '../src/game/difficulty';

const config = createConfig({ maxLevel: 6, levelDurationMs: 10_000 });

describe('levelAt', () => {
  it('starts at level 1', () => {
    expect(levelAt(0, config)).toBe(1);
    expect(levelAt(9_999, config)).toBe(1);
  });

  it('advances one level per levelDurationMs', () => {
    expect(levelAt(10_000, config)).toBe(2);
    expect(levelAt(25_000, config)).toBe(3);
    expect(levelAt(40_000, config)).toBe(5);
  });

  it('never exceeds maxLevel', () => {
    expect(levelAt(10_000_000, config)).toBe(6);
  });

  it('returns maxLevel when levelDurationMs is zero', () => {
    expect(levelAt(0, createConfig({ levelDurationMs: 0 }))).toBe(config.maxLevel);
  });
});

describe('difficultyRatio', () => {
  it('maps the first level to 0 and the last to 1', () => {
    expect(difficultyRatio(1, config)).toBe(0);
    expect(difficultyRatio(config.maxLevel, config)).toBe(1);
  });

  it('is monotonic', () => {
    const values = [1, 2, 3, 4, 5, 6].map((level) => difficultyRatio(level, config));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });

  it('handles a single-level game by staying on base difficulty', () => {
    const flat = createConfig({ maxLevel: 1 });
    expect(difficultyRatio(1, flat)).toBe(0);
    expect(spawnIntervalAt(1, flat)).toBe(flat.baseSpawnMs);
    expect(ttlAt(1, flat)).toBe(flat.baseTtlMs);
  });
});

describe('spawnIntervalAt / ttlAt', () => {
  it('uses the config extremes at the ends of the curve', () => {
    expect(spawnIntervalAt(1, config)).toBe(config.baseSpawnMs);
    expect(spawnIntervalAt(config.maxLevel, config)).toBe(config.minSpawnMs);
    expect(ttlAt(1, config)).toBe(config.baseTtlMs);
    expect(ttlAt(config.maxLevel, config)).toBe(config.minTtlMs);
  });

  it('gets strictly faster as levels rise', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let level = 1; level <= config.maxLevel; level += 1) {
      const interval = spawnIntervalAt(level, config);
      expect(interval).toBeLessThan(previous);
      previous = interval;
    }
  });

  it('shortens the window to react as levels rise', () => {
    expect(ttlAt(2, config)).toBeLessThan(ttlAt(1, config));
    expect(ttlAt(6, config)).toBeLessThan(ttlAt(5, config));
  });
});
