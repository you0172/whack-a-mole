/**
 * Save file (PRD §4.10).
 *
 * One key, `wam.save.v1`, holding every persistent field. Migration is additive:
 * a missing field takes its default and the rest is kept, so a schema change can
 * never wipe a player's records (the rollback rule in §10.2 depends on this).
 */

export const SAVE_KEY = 'wam.save.v1';
/** Legacy key from v1, read once during migration. */
export const LEGACY_BEST_KEY = 'whack-a-mole:best:v1';
export const SAVE_VERSION = 1;

export interface SaveData {
  readonly schemaVersion: number;
  readonly bestScore: number;
  readonly bestCombo: number;
  /** Longest combo streak measured in milliseconds, ready for a future timer. */
  readonly bestComboMs: number;
  /** Date key (`YYYY-MM-DD`) of the last completed daily challenge, or null. */
  readonly dailyDone: string | null;
  readonly achievements: readonly string[];
  readonly settings: { readonly audio: boolean };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SAVE: SaveData = {
  schemaVersion: SAVE_VERSION,
  bestScore: 0,
  bestCombo: 0,
  bestComboMs: 0,
  dailyDone: null,
  achievements: [],
  settings: { audio: true },
};

/** localStorage when available; null in private mode, SSR or tests without it. */
export const resolveStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * Coerce a persisted value to a non-negative integer.
 *
 * Only numbers and numeric strings are accepted. Anything else — objects, arrays,
 * booleans — becomes 0 rather than being stringified, which would turn `[7]` into
 * 7 and `{}` into NaN by accident.
 */
const asNonNegativeInt = (value: unknown): number => {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

/**
 * Normalise whatever was on disk into a complete SaveData. Unknown fields are
 * dropped, missing fields fall back to defaults, and a corrupt value never
 * throws or clears the key.
 */
export const migrateSave = (raw: unknown, legacyBestScore = 0): SaveData => {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const settings =
    source.settings && typeof source.settings === 'object'
      ? (source.settings as Record<string, unknown>)
      : {};

  return {
    schemaVersion: SAVE_VERSION,
    bestScore: Math.max(asNonNegativeInt(source.bestScore), asNonNegativeInt(legacyBestScore)),
    bestCombo: asNonNegativeInt(source.bestCombo),
    bestComboMs: asNonNegativeInt(source.bestComboMs),
    dailyDone: typeof source.dailyDone === 'string' ? source.dailyDone : null,
    achievements: Array.isArray(source.achievements)
      ? source.achievements.filter((entry): entry is string => typeof entry === 'string')
      : [],
    settings: { audio: typeof settings.audio === 'boolean' ? settings.audio : true },
  };
};

export const loadSave = (storage: StorageLike | null = resolveStorage()): SaveData => {
  if (!storage) return DEFAULT_SAVE;
  try {
    const raw = storage.getItem(SAVE_KEY);
    const legacy = asNonNegativeInt(storage.getItem(LEGACY_BEST_KEY));
    if (raw === null) return migrateSave(null, legacy);
    return migrateSave(JSON.parse(raw), legacy);
  } catch {
    return DEFAULT_SAVE;
  }
};

export const writeSave = (
  save: SaveData,
  storage: StorageLike | null = resolveStorage(),
): SaveData => {
  if (!storage) return save;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage full or unavailable — the round still played, just not persisted */
  }
  return save;
};

export const clearSave = (storage: StorageLike | null = resolveStorage()): void => {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
    storage.removeItem(LEGACY_BEST_KEY);
  } catch {
    /* ignore */
  }
};

export interface RoundRecord {
  readonly score: number;
  readonly combo: number;
  readonly comboMs?: number;
  readonly dailyDate?: string | null;
}

export interface RecordResult {
  readonly save: SaveData;
  readonly isNewBest: boolean;
  readonly isNewCombo: boolean;
}

/**
 * Fold one finished round into the save file. `score` is expected to already
 * include the goal bonus (R9: the bonus counts towards the record).
 */
export const recordRound = (
  save: SaveData,
  round: RoundRecord,
  storage: StorageLike | null = resolveStorage(),
): RecordResult => {
  const score = asNonNegativeInt(round.score);
  const combo = asNonNegativeInt(round.combo);
  const comboMs = asNonNegativeInt(round.comboMs ?? 0);

  const next: SaveData = {
    schemaVersion: SAVE_VERSION,
    bestScore: Math.max(save.bestScore, score),
    bestCombo: Math.max(save.bestCombo, combo),
    bestComboMs: Math.max(save.bestComboMs, comboMs),
    dailyDone: round.dailyDate ?? save.dailyDone,
    achievements: save.achievements,
    settings: save.settings,
  };

  writeSave(next, storage);

  return {
    save: next,
    isNewBest: score > save.bestScore && score > 0,
    isNewCombo: combo > save.bestCombo && combo > 0,
  };
};
