import { describe, expect, it } from 'vitest';
import { dailySeed, dateKey, isDailyDone } from '../src/game/daily';

describe('dateKey', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('dailySeed (R10)', () => {
  it('gives the same seed for the same day', () => {
    const morning = new Date(2026, 9, 20, 8, 0, 0);
    const evening = new Date(2026, 9, 20, 23, 30, 0);
    expect(dailySeed(morning)).toBe(dailySeed(evening));
  });

  it('gives a different seed on the next day', () => {
    expect(dailySeed(new Date(2026, 9, 20))).not.toBe(dailySeed(new Date(2026, 9, 21)));
  });

  it('stays a positive 32-bit integer', () => {
    for (let day = 1; day <= 28; day += 1) {
      const seed = dailySeed(new Date(2026, 1, day));
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});

describe('isDailyDone', () => {
  it('is true only for the matching date key', () => {
    const today = new Date(2026, 9, 20);
    expect(isDailyDone('2026-10-20', today)).toBe(true);
    expect(isDailyDone('2026-10-19', today)).toBe(false);
    expect(isDailyDone(null, today)).toBe(false);
  });
});
