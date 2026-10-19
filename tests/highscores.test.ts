import { readBestScore, writeBestScore, clearBestScore } from '../src/storage/highscores';
import { describe, expect, it, beforeEach, vi } from 'vitest';

describe('highscores', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });

  it('starts at zero', () => {
    expect(readBestScore()).toBe(0);
  });

  it('persists a new best', () => {
    expect(writeBestScore(120)).toBe(120);
    expect(readBestScore()).toBe(120);
  });

  it('never lowers the stored best', () => {
    writeBestScore(300);
    expect(writeBestScore(150)).toBe(300);
    expect(readBestScore()).toBe(300);
  });

  it('ignores corrupted values', () => {
    localStorage.setItem('whack-a-mole:best:v1', 'not-a-number');
    expect(readBestScore()).toBe(0);
  });

  it('survives storage failures', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(readBestScore()).toBe(0);
    expect(() => writeBestScore(10)).not.toThrow();
    expect(() => clearBestScore()).not.toThrow();
  });
});
