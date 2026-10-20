import { describe, expect, it } from 'vitest';
import { GameEngine, seededRandom, type RandomSource } from '../src/game/engine';
import { DEFAULT_CONFIG, type GameConfig } from '../src/game/types';

/** Deterministic engine: no bombs, no goldens, no breathing, always first free hole. */
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
      goldenFromLevel: 1,
      bombFromLevel: 1,
      breatheMs: 0,
      holeCooldown: 0,
      ...overrides,
    },
    rng,
  );

describe('PRD v2.0 numeric baseline', () => {
  it('six levels fit inside the 60 s round (Q2: 10 s each, not 12 s)', () => {
    expect(DEFAULT_CONFIG.roundMs).toBe(60_000);
    expect(DEFAULT_CONFIG.levelDurationMs).toBe(10_000);
    expect(DEFAULT_CONFIG.levelDurationMs * DEFAULT_CONFIG.maxLevel).toBe(DEFAULT_CONFIG.roundMs);
  });

  it('uses the PRD target weights and score values (table 13 / appendix D)', () => {
    expect(DEFAULT_CONFIG.goldenChance).toBeCloseTo(0.12);
    expect(DEFAULT_CONFIG.bombChance).toBeCloseTo(0.18);
    expect(DEFAULT_CONFIG.points).toEqual({ normal: 10, golden: 50, bomb: 25 });
    expect(DEFAULT_CONFIG.comboStep).toBe(5);
    expect(DEFAULT_CONFIG.maxMultiplier).toBe(5);
    expect(DEFAULT_CONFIG.minTtlMs).toBe(650);
    expect(DEFAULT_CONFIG.minSpawnMs).toBe(340);
    expect(DEFAULT_CONFIG.goalBonusRate).toBeCloseTo(0.2);
  });
});

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

  it('toggles between playing and paused, and ignores other phases', () => {
    const engine = makeEngine();
    engine.togglePause(); // idle is a no-op
    expect(engine.snapshot.phase).toBe('idle');

    engine.start();
    engine.togglePause();
    expect(engine.snapshot.phase).toBe('paused');

    engine.togglePause();
    expect(engine.snapshot.phase).toBe('playing');
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

  it('keeps scoring from zero after the clamp (review #13)', () => {
    // Consumed rng order: goal (constructor), goal (start), then per spawn: hole, kind.
    const values = [0.5, 0.5, 0.01, 0.01, 0.01, 0.9];
    let cursor = 0;
    const scripted = (): number => values[Math.min(cursor++, values.length - 1)]!;

    const engine = makeEngine({ bombChance: 0.5, goldenChance: 0, baseTtlMs: 100_000 }, scripted);
    engine.start();

    engine.tick(100); // bomb
    expect(engine.snapshot.moles[0]!.kind).toBe('bomb');
    engine.whack(engine.snapshot.moles[0]!.hole);
    expect(engine.snapshot.score).toBe(0);
    expect(engine.snapshot.combo).toBe(0);

    engine.tick(100); // normal mole, scored from zero
    const normal = engine.snapshot.moles.at(-1)!;
    expect(normal.kind).toBe('normal');
    expect(engine.whack(normal.hole).points).toBe(10);
    expect(engine.snapshot.score).toBe(10);
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

  it('freezes the level clock while paused (review #14)', () => {
    const engine = makeEngine({ maxLevel: 6, levelDurationMs: 1_000, roundMs: 60_000 });
    engine.start();
    engine.tick(1_000);
    expect(engine.snapshot.level).toBe(2);
    engine.pause();
    engine.tick(10_000);
    expect(engine.snapshot.level).toBe(2);
    engine.resume();
    engine.tick(1_000);
    expect(engine.snapshot.level).toBe(3);
  });

  it('stops spawning at roundMs and settles once in-flight targets resolve (R6)', () => {
    const engine = makeEngine({ roundMs: 500, baseSpawnMs: 100, baseTtlMs: 300 });
    engine.start();

    // Advance in realistic 16 ms frames so targets are still up at the bell.
    const spawnTimes: number[] = [];
    while (engine.snapshot.elapsedMs < 500 && engine.snapshot.phase === 'playing') {
      const before = engine.snapshot.elapsedMs;
      for (const event of engine.tick(16)) {
        if (event.type === 'spawn') spawnTimes.push(before);
      }
    }

    expect(spawnTimes.length).toBeGreaterThan(0);
    expect(Math.max(...spawnTimes)).toBeLessThan(500);

    const live = engine.snapshot;
    expect(live.phase).toBe('playing');
    expect(live.elapsedMs).toBe(500);
    expect(live.remainingMs).toBe(0);
    expect(live.moles.length).toBeGreaterThan(0);

    let gameover = false;
    for (let frame = 0; frame < 40 && !gameover; frame += 1) {
      gameover = engine.tick(16).some((event) => event.type === 'gameover');
    }
    expect(gameover).toBe(true);
    expect(engine.snapshot.phase).toBe('over');
    expect(engine.snapshot.moles).toHaveLength(0);
    expect(engine.tick(1_000)).toEqual([]);
  });

  it('settles immediately when nothing is in flight at the bell', () => {
    // Nothing can spawn before the bell, so the board is empty when time is up.
    const engine = makeEngine({ roundMs: 500, baseSpawnMs: 900, baseTtlMs: 10 });
    engine.start();
    const events = engine.tick(500);
    expect(events.some((event) => event.type === 'gameover')).toBe(true);
    expect(engine.snapshot.phase).toBe('over');
  });

  it('never holds the round open past the settle grace cap', () => {
    const engine = makeEngine({ roundMs: 200, baseTtlMs: 100_000, settleGraceMs: 300 });
    engine.start();
    engine.tick(100); // a target is up well before the bell
    engine.tick(100); // bell: no new spawns, the target stays
    expect(engine.snapshot.phase).toBe('playing');
    expect(engine.snapshot.moles.length).toBeGreaterThan(0);

    const events = engine.tick(300);
    expect(events.some((event) => event.type === 'gameover')).toBe(true);
    expect(engine.snapshot.moles).toHaveLength(0);
  });

  it('still lets a target be whacked during the settle window', () => {
    const engine = makeEngine({ roundMs: 500, baseTtlMs: 100_000 });
    engine.start();
    engine.tick(100); // a target is up
    engine.tick(400); // bell: it stays on the board
    expect(engine.snapshot.phase).toBe('playing');

    const mole = engine.snapshot.moles[0]!;
    const result = engine.whack(mole.hole);
    expect(result.outcome).toBe('hit');
    expect(engine.snapshot.score).toBe(10);
  });

  it('records how long the best combo lasted (PRD §4.9 record #3)', () => {
    const engine = makeEngine({ roundMs: 1_000, baseSpawnMs: 1_000, baseTtlMs: 100_000 });
    engine.start();

    engine.tick(250);
    engine.whack(engine.snapshot.moles[0]!.hole); // combo starts at t=250
    expect(engine.snapshot.comboMs).toBe(0);

    engine.tick(500);
    expect(engine.snapshot.comboMs).toBe(500);

    engine.tick(250); // reaches the bell, combo is still alive
    engine.tick(5_000); // settle grace expires and the combo is folded in
    expect(engine.snapshot.phase).toBe('over');
    expect(engine.snapshot.comboMs).toBe(750);
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

describe('GameEngine — v2 fairness rules (§4.5)', () => {
  it('shows the first target within 400 ms (R1)', () => {
    const engine = new GameEngine({}, () => 0.5);
    engine.start();
    let elapsedToFirstSpawn = 0;
    for (let i = 0; i < 40; i += 1) {
      const events = engine.tick(10);
      elapsedToFirstSpawn += 10;
      if (events.some((event) => event.type === 'spawn')) break;
    }
    expect(elapsedToFirstSpawn).toBeLessThanOrEqual(400);
  });

  it('keeps level 1 free of golden moles and bombs (table 15)', () => {
    const engine = makeEngine({
      bombChance: 1,
      goldenChance: 1,
      goldenFromLevel: 2,
      bombFromLevel: 3,
      baseTtlMs: 100_000,
    });
    engine.start();
    for (let i = 0; i < 20; i += 1) engine.tick(50);
    expect(engine.snapshot.level).toBe(1);
    expect(engine.snapshot.moles.every((mole) => mole.kind === 'normal')).toBe(true);
  });

  it('never puts a bomb and a golden mole on the board together', () => {
    const engine = makeEngine({
      holes: 9,
      goldenChance: 0.5,
      bombChance: 0.5,
      goldenFromLevel: 1,
      bombFromLevel: 1,
      baseTtlMs: 100_000,
      baseSpawnMs: 10,
      breatheMs: 0,
    });
    engine.start();
    for (let i = 0; i < 300; i += 1) {
      engine.tick(10);
      const kinds = new Set(engine.snapshot.moles.map((mole) => mole.kind));
      expect(kinds.has('bomb') && kinds.has('golden')).toBe(false);
    }
  });

  it('respects the 120 ms breathing gap between spawns', () => {
    const engine = makeEngine({
      baseSpawnMs: 10,
      baseTtlMs: 100_000,
      holes: 9,
      breatheMs: 120,
    });
    engine.start();
    const spawnTimes: number[] = [];
    for (let t = 0; t < 4_000; t += 10) {
      const events = engine.tick(10);
      for (const event of events) {
        if (event.type === 'spawn') spawnTimes.push(t + 10);
      }
    }
    expect(spawnTimes.length).toBeGreaterThan(2);
    for (let i = 1; i < spawnTimes.length; i += 1) {
      expect(spawnTimes[i]! - spawnTimes[i - 1]!).toBeGreaterThanOrEqual(120);
    }
  });

  it('does not reuse a hole within the cooldown window (review #15)', () => {
    const engine = makeEngine({
      holes: 9,
      baseSpawnMs: 10,
      baseTtlMs: 60, // moles die fast, so only the cooldown limits reuse
      breatheMs: 0,
      holeCooldown: 2,
    });
    engine.start();
    const spawnHoles: number[] = [];
    for (let t = 0; t < 3_000; t += 10) {
      for (const event of engine.tick(10)) {
        if (event.type === 'spawn') spawnHoles.push(event.mole.hole);
      }
    }
    expect(spawnHoles.length).toBeGreaterThan(6);
    for (let i = 2; i < spawnHoles.length; i += 1) {
      expect(spawnHoles[i]).not.toBe(spawnHoles[i - 1]);
      expect(spawnHoles[i]).not.toBe(spawnHoles[i - 2]);
    }
  });

  it('gives the golden mole a shorter ttl than a normal one', () => {
    const engine = makeEngine({ bombChance: 0, goldenChance: 1 }, () => 0.5);
    engine.start();
    engine.tick(100);
    const golden = engine.snapshot.moles[0]!;

    const normalEngine = makeEngine();
    normalEngine.start();
    normalEngine.tick(100);
    const normal = normalEngine.snapshot.moles[0]!;

    expect(golden.ttlMs).toBeCloseTo(Math.round(normal.ttlMs * DEFAULT_CONFIG.goldenTtlFactor), 0);
  });
});

describe('GameEngine — round goal (R9)', () => {
  it('exposes a goal with progress that starts at zero', () => {
    const engine = makeEngine();
    engine.start();
    const { goal } = engine.snapshot;
    expect(goal.label.length).toBeGreaterThan(0);
    expect(goal.target).toBeGreaterThan(0);
    expect(goal.current).toBe(0);
    expect(goal.done).toBe(false);
  });

  it('picks the same goal for the same seed (R10)', () => {
    const a = new GameEngine({}, seededRandom(123));
    const b = new GameEngine({}, seededRandom(123));
    expect(a.goalDefinition.id).toBe(b.goalDefinition.id);
  });

  it('adds the 20% bonus to finalScore when the goal is met', () => {
    // rng 0.5 → goal index 2 → "hit 3 golden moles".
    const engine = makeEngine({ goldenChance: 1, bombChance: 0, baseTtlMs: 100_000 }, () => 0.5);
    engine.start();
    expect(engine.goalDefinition.id).toBe('golden3');

    for (let i = 0; i < 3; i += 1) {
      engine.tick(100);
      const mole = engine.snapshot.moles.at(-1);
      if (mole) engine.whack(mole.hole);
    }

    const snapshot = engine.snapshot;
    expect(snapshot.goal.done).toBe(true);
    expect(snapshot.finalScore).toBe(Math.round(snapshot.score * 1.2));
  });

  it('emits a goal event the first time the goal completes', () => {
    const engine = makeEngine({ goldenChance: 1, bombChance: 0, baseTtlMs: 100_000 }, () => 0.5);
    engine.start();
    let goalEvents = 0;
    for (let i = 0; i < 6; i += 1) {
      engine.tick(100);
      const mole = engine.snapshot.moles.at(-1);
      if (mole) engine.whack(mole.hole);
      goalEvents += engine.tick(0).filter((event) => event.type === 'goal').length;
    }
    // The goal can only be announced once.
    const after = engine.tick(1000).filter((event) => event.type === 'goal').length;
    expect(goalEvents + after).toBeLessThanOrEqual(1);
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
