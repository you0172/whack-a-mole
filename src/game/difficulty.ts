import type { GameConfig } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Level grows every `levelDurationMs`, starting at 1 and capped at `maxLevel`.
 */
export const levelAt = (elapsedMs: number, config: GameConfig): number => {
  if (config.levelDurationMs <= 0) return config.maxLevel;
  const raw = 1 + Math.floor(elapsedMs / config.levelDurationMs);
  return clamp(raw, 1, config.maxLevel);
};

/**
 * How far through the difficulty curve we are, as a 0..1 ratio.
 * Level 1 maps to 0, the final level maps to 1.
 */
export const difficultyRatio = (level: number, config: GameConfig): number => {
  // A single-level game has no curve: it sits on the base (easiest) values.
  if (config.maxLevel <= 1) return 0;
  return clamp((level - 1) / (config.maxLevel - 1), 0, 1);
};

/** Linear interpolation between two values along the difficulty curve. */
export const tweenAtLevel = (
  level: number,
  config: GameConfig,
  from: number,
  to: number,
): number => {
  const ratio = difficultyRatio(level, config);
  return from + (to - from) * ratio;
};

/** Delay between spawns at a given level (smaller = harder). */
export const spawnIntervalAt = (level: number, config: GameConfig): number =>
  Math.round(tweenAtLevel(level, config, config.baseSpawnMs, config.minSpawnMs));

/** How long a normal mole stays visible at a given level. */
export const ttlAt = (level: number, config: GameConfig): number =>
  Math.round(tweenAtLevel(level, config, config.baseTtlMs, config.minTtlMs));
