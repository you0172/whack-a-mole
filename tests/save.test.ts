import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAVE,
  LEGACY_BEST_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  clearSave,
  loadSave,
  migrateSave,
  recordRound,
  resolveStorage,
  writeSave,
  type StorageLike,
} from '../src/storage/save';

const makeStorage = (
  initial: Record<string, string> = {},
): StorageLike & {
  readonly map: Map<string, string>;
} => {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

describe('save migration (§4.10)', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSave(makeStorage())).toEqual(DEFAULT_SAVE);
  });

  it('migrates the v1 high-score key without losing it', () => {
    const storage = makeStorage({ [LEGACY_BEST_KEY]: '1234' });
    const save = loadSave(storage);
    expect(save.bestScore).toBe(1234);
    expect(save.schemaVersion).toBe(SAVE_VERSION);
  });

  it('fills missing fields instead of clearing the file', () => {
    const storage = makeStorage({
      [SAVE_KEY]: JSON.stringify({ bestScore: 700, achievements: ['first-round'] }),
    });
    const save = loadSave(storage);
    expect(save.bestScore).toBe(700);
    expect(save.achievements).toEqual(['first-round']);
    expect(save.bestCombo).toBe(0);
    expect(save.settings.audio).toBe(true);
    expect(save.dailyDone).toBeNull();
  });

  it('survives corrupt JSON', () => {
    const storage = makeStorage({ [SAVE_KEY]: '{not json' });
    expect(loadSave(storage)).toEqual(DEFAULT_SAVE);
  });

  it('drops unknown and wrongly typed fields', () => {
    const save = migrateSave({
      bestScore: '42',
      bestCombo: -3,
      achievements: [1, 'ok', null],
      settings: { audio: 'yes' },
      bogus: true,
    });
    expect(save.bestScore).toBe(42);
    expect(save.bestCombo).toBe(0);
    expect(save.achievements).toEqual(['ok']);
    expect(save.settings.audio).toBe(true);
    expect(save).not.toHaveProperty('bogus');
  });

  it('keeps the larger of the stored and legacy best score', () => {
    const storage = makeStorage({
      [SAVE_KEY]: JSON.stringify({ bestScore: 100 }),
      [LEGACY_BEST_KEY]: '250',
    });
    expect(loadSave(storage).bestScore).toBe(250);
  });

  it('does not throw when storage itself throws', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSave(hostile)).toEqual(DEFAULT_SAVE);
    expect(() => writeSave(DEFAULT_SAVE, hostile)).not.toThrow();
    expect(() => clearSave(hostile)).not.toThrow();
  });
});

describe('recordRound', () => {
  it('stores a new best score and combo', () => {
    const storage = makeStorage();
    const result = recordRound(DEFAULT_SAVE, { score: 900, combo: 17 }, storage);

    expect(result.isNewBest).toBe(true);
    expect(result.isNewCombo).toBe(true);
    expect(result.save.bestScore).toBe(900);
    expect(result.save.bestCombo).toBe(17);
    expect(JSON.parse(storage.map.get(SAVE_KEY)!)).toMatchObject({
      schemaVersion: SAVE_VERSION,
      bestScore: 900,
    });
  });

  it('never lowers an existing record', () => {
    const save = { ...DEFAULT_SAVE, bestScore: 2_000, bestCombo: 40 };
    const result = recordRound(save, { score: 300, combo: 5 }, makeStorage());

    expect(result.isNewBest).toBe(false);
    expect(result.isNewCombo).toBe(false);
    expect(result.save.bestScore).toBe(2_000);
    expect(result.save.bestCombo).toBe(40);
  });

  it('does not call a zero round a new record', () => {
    const result = recordRound(DEFAULT_SAVE, { score: 0, combo: 0 }, makeStorage());
    expect(result.isNewBest).toBe(false);
    expect(result.isNewCombo).toBe(false);
  });

  it('remembers a completed daily challenge', () => {
    const result = recordRound(
      DEFAULT_SAVE,
      { score: 500, combo: 10, dailyDate: '2026-10-20' },
      makeStorage(),
    );
    expect(result.save.dailyDone).toBe('2026-10-20');
  });

  it('pending nothing works without storage', () => {
    const result = recordRound(DEFAULT_SAVE, { score: 100, combo: 2 }, null);
    expect(result.save.bestScore).toBe(100);
  });
});

describe('resolveStorage', () => {
  it('returns null when touching localStorage throws (private mode)', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('access denied by the browser');
      },
    });
    try {
      expect(resolveStorage()).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('returns null when the environment has no localStorage at all', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'localStorage');
    try {
      expect(resolveStorage()).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });
});

describe('clearSave', () => {
  it('removes both the current and the legacy key', () => {
    const storage = makeStorage({
      [SAVE_KEY]: JSON.stringify(DEFAULT_SAVE),
      [LEGACY_BEST_KEY]: '5',
    });
    clearSave(storage);
    expect(storage.map.size).toBe(0);
  });
});
