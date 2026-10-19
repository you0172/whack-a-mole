import type { GameConfig, MoleKind } from './types';

/**
 * Combo multiplier: 1x for the first `comboStep` hits, then one extra
 * multiplier every `comboStep` hits, capped at `maxMultiplier`.
 */
export const multiplierFor = (combo: number, config: GameConfig): number => {
  if (config.comboStep <= 0) return 1;
  const bonus = Math.floor(Math.max(0, combo) / config.comboStep);
  return Math.min(1 + bonus, config.maxMultiplier);
};

/**
 * Base score for a mole kind. The bomb is a penalty, so it is returned
 * negative — callers multiply by the combo multiplier.
 */
export const basePointsFor = (kind: MoleKind, config: GameConfig): number => {
  switch (kind) {
    case 'normal':
      return config.points.normal;
    case 'golden':
      return config.points.golden;
    case 'bomb':
      return -config.points.bomb;
  }
};

/** Round score awarded for whacking `kind` at the given multiplier. */
export const pointsFor = (kind: MoleKind, multiplier: number, config: GameConfig): number =>
  basePointsFor(kind, config) * multiplier;

export interface Rank {
  readonly label: string;
  readonly emoji: string;
}

const RANKS: ReadonlyArray<{ min: number; rank: Rank }> = [
  { min: 6000, rank: { label: 'Legendary', emoji: '👑' } },
  { min: 4000, rank: { label: 'Mole Hunter', emoji: '🏆' } },
  { min: 2500, rank: { label: 'Sharpshooter', emoji: '🎯' } },
  { min: 1200, rank: { label: 'Getting Warm', emoji: '🔥' } },
  { min: 400, rank: { label: 'Rookie', emoji: '🌱' } },
  { min: 0, rank: { label: 'Warming Up', emoji: '💤' } },
];

/** Purely cosmetic rank shown on the game-over screen. */
export const rankFor = (score: number): Rank =>
  (RANKS.find((entry) => score >= entry.min) ?? RANKS[RANKS.length - 1]!).rank;
