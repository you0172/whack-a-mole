/** Daily challenge seed (R10, Q6 default: derived from the local date). */

/** Local calendar date as `YYYY-MM-DD`. */
export const dateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Stable 32-bit seed for a date (FNV-1a over the date key).
 *
 * Same day → same seed → same mole sequence for everyone, which is the whole
 * point of the daily challenge. Review #25 is explicit that local clock tampering
 * is allowed and not defended against: the daily is local bragging rights only
 * and never gates an achievement.
 */
export const dailySeed = (date: Date): number => {
  let hash = 0x811c9dc5;
  for (const char of dateKey(date)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/** Has today's daily challenge already been finished? */
export const isDailyDone = (dailyDone: string | null, date: Date): boolean =>
  dailyDone === dateKey(date);
