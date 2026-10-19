import { describe, expect, it } from 'vitest';
import { GameEngine, seededRandom, type RandomSource } from '../src/game/engine';
import type { GameConfig } from '../src/game/types';

/** Deterministic engine: no bombs, no goldens, always picks the first free hole. */
const makeEngine = (
  overrides: Partial<GameConfig> = {},
  rng: RandomSource = () => 0.5,
): GameEngine =>
  new GameEngine(
    {
      holes: 3,
      roundMs: 10_000,
      levelDurationMs: 1_000,
      maxLevel: 1,
      baseSpawnMs: 100,
      minSpawnMs: 100,
      baseTtlMs: 1_000,
      minTtlMs: 1_000,
      bombChance: 0,
      goldenChance: 0,
      ...overrides,
    },
    rng,
  );

describe('GameEngine — lifecycle', () => {
  it('starts idle and ignores ticks before start()', () => {
    const engine = makeEngine();
    expect(engine.snapshot.phase).toBe('idle');
    expect(engine.tick(1_000)).toEqual([]);
    expect(engine.snapshot.elapsedMs).toBe(0);
  });

  it('start() enters playing with a clean slate', () => {
    const engine = makeEngine();
    engine.start();
    const snapshot = engine.snapshot;
    expect(snapshot.phase).toBe('playing');
    expect(snapshot.score).toBe(0);
    expect(snapshot.combo).toBe(0);
    expect(snapshot.level).toBe(1);
    expect(snapshot.moles).toHaveLength(0);
  });

  it('spawns a mole once the spawn interval elapses', () => {
    const engine = makeEngine();
    engine.start();
    expect(engine.tick(99).some((event) => event.type === 'spawn')).toBe(false);
    const events = engine.tick(1);
    expect(events.some((event) => event.type === 'spawn')).toBe(true);
    expect(engine.snapshot.moles).toHaveLength(1);
  });

  it('never exposes more moles than there are holes', () => {
    const engine = makeEngine({ holes: 2, baseSpawnMs: 10, baseTtlMs: 10_000 });
    engine.start();
    for (let i = 0; i < 50; i += 1) engine.tick(10);
    expect(engine.snapshot.moles.length).toBeLessThanOrEqual(2);
  });
});

describe('GameEngine — scoring', () => {
  it('awards points and grows the combo on a hit', () => {
    const engine = makeEngine();
    engine.start();
    engine.tick(100);
    const mole = engine.snapshot.moles[0]!;
    const result = engine.whack(mole.hole);

    expect(result.outcome).toBe('hit');
    expect(result.points).toBe(10);
    expect(result.combo).toBe(1);
    expect(engine.snapshot.score).toBe(10);
    expect(engine.snapshot.moles).toHaveLength(0);
  });

  it('applies the combo multiplier after every combo step', () => {
    const engine = makeEngine({ baseTtlMs: 100_000, baseSpawnMs: 10 });
    engine.start();

    for (let hit = 0; hit < 5; hit += 1) {
      engine.tick(10);
      const mole = engine.snapshot.moles.at(-1);
      if (mole) engine.whack(mole.hole);
    }

    engine.tick(10);
    const target = engine.snapshot.moles.at(-1)!;
    const result = engine.whack(target.hole);
    expect(result.combo).toBe(6);
    expect(result.multiplier).toBe(2);
    expect(result.points).toBe(20);
  });

  it('records empty swings without touching the combo', () => {
    const engine = makeEngine();
    engine.start();
    engine.tick(100);
    const mole = engine.snapshot.moles[0]!;
    engine.whack(mole.hole);

    const emptyHole = [0, 1, 2].find((hole) => hole !== mole.hole)!;
    const result = engine.whack(emptyHole);

    expect(result.outcome).toBe('empty');
    expect(engine.snapshot.combo).toBe(1);
    expect(engine.snapshot.stats.emptySwings).toBe(1);
  });

  it('punishes bombs, resets the combo and never drops below zero', () => {
    const engine = makeEngine({ bombChance: 1 }, () => 0.01);
    engine.start();
    engine.tick(100);
    const bomb = engine.snapshot.moles[0]!;
    expect(bomb.kind).toBe('bomb');

    const result = engine.whack(bomb.hole);
    expect(result.outcome).toBe('bomb');
    expect(result.points).toBe(-25);
    expect(engine.snapshot.score).toBe(0);
    expect(engine.snapshot.combo).toBe(0);
    expect(engine.snapshot.stats.bombs).toBe(1);
  });

  it('rewards golden moles with their higher value', () => {
    const engine = makeEngine({ bombChance: 0, goldenChance: 1 }, () => 0.5);
    engine.start();
    engine.tick(100);
    const golden = engine.snapshot.moles[0]!;
    expect(golden.kind).toBe('golden');

    const result = engine.whack(golden.hole);
    expect(result.outcome).toBe('golden');
    expect(result.points).toBe(50);
    expect(engine.snapshot.stats.golden).toBe(1);
  });
});

describe('GameEngine — time and difficulty', () => {
  it('lets a mole escape and breaks the combo when its ttl expires', () => {
    const engine = makeEngine({ baseSpawnMs: 1_000, baseTtlMs: 100 });
    engine.start();

    engine.tick(1_000); // spawn mole A
    const first = engine.snapshot.moles[0]!;
    engine.whack(first.hole);
    expect(engine.snapshot.combo).toBe(1);

    engine.tick(1_000); // spawn mole B (A is long gone)
    expect(engine.snapshot.moles.length).toBe(1);
    engine.tick(100); // B's ttl of 100ms runs out

    const snapshot = engine.snapshot;
    expect(snapshot.stats.escaped).toBe(1);
    expect(snapshot.combo).toBe(0);
    expect(snapshot.moles.length).toBe(0);
  });

  it('emits levelup when crossing a level boundary', () => {
    const engine = makeEngine({ maxLevel: 3, levelDurationMs: 1_000 });
    engine.start();
    const events = engine.tick(1_000);
    expect(events.some((event) => event.type === 'levelup' && event.level === 2)).toBe(true);
    expect(engine.snapshot.level).toBe(2);
  });

  it('ends the round exactly at roundMs and emits gameover', () => {
    const engine = makeEngine({ roundMs: 500 });
    engine.start();
    const events = engine.tick(500);

    expect(events.some((event) => event.type === 'gameover')).toBe(true);
    const snapshot = engine.snapshot;
    expect(snapshot.phase).toBe('over');
    expect(snapshot.remainingMs).toBe(0);
    expect(snapshot.moles).toHaveLength(0);
    expect(engine.tick(1_000)).toEqual([]);
  });

  it('freezes the simulation while paused', () => {
    const engine = makeEngine();
    engine.start();
    engine.tick(100);
    const before = engine.snapshot;
    engine.pause();
    engine.tick(5_000);
    expect(engine.snapshot.elapsedMs).toBe(before.elapsedMs);
    expect(engine.whack(0).outcome).toBe('ignored');
    engine.resume();
    engine.tick(100);
    expect(engine.snapshot.elapsedMs).toBeGreaterThan(before.elapsedMs);
  });

  it('ignores zero and negative deltas', () => {
    const engine = makeEngine();
    engine.start();
    expect(engine.tick(0)).toEqual([]);
    expect(engine.tick(-50)).toEqual([]);
    expect(engine.snapshot.elapsedMs).toBe(0);
  });
});

describe('seededRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = [a(), a(), a()];
    const second = [b(), b(), b()];
    expect(first).toEqual(second);
  });

  it('stays within [0, 1)', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1_000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
