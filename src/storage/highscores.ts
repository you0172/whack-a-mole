const BEST_KEY = 'whack-a-mole:best:v1';

/** Read the persisted high score. Never throws (private mode, disabled storage). */
export const readBestScore = (): number => {
  try {
    const raw = globalThis.localStorage?.getItem(BEST_KEY);
    if (raw === null || raw === undefined) return 0;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

/** Persist the high score if it beats the previous one. Returns the stored value. */
export const writeBestScore = (score: number): number => {
  const best = Math.max(readBestScore(), Math.floor(score));
  try {
    globalThis.localStorage?.setItem(BEST_KEY, String(best));
  } catch {
    /* storage unavailable — keep playing, just don't persist */
  }
  return best;
};

export const clearBestScore = (): void => {
  try {
    globalThis.localStorage?.removeItem(BEST_KEY);
  } catch {
    /* ignore */
  }
};
