import './styles/main.css';
import './styles/v2.css';
import { Sfx } from './audio/sfx';
import { copy } from './copy';
import { createAnalytics, goalResultProps, roundEndProps } from './game/analytics';
import { dailySeed, dateKey, isDailyDone } from './game/daily';
import { GameEngine, seededRandom } from './game/engine';
import { loadSave, recordRound, writeSave, type SaveData } from './storage/save';
import { createBoard } from './ui/board';
import { createEffects } from './ui/effects';
import { createHud } from './ui/hud';
import { createOverlay } from './ui/overlay';

const requireEl = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

type Mode = 'normal' | 'daily';

const appEl = requireEl('app');
const boardEl = requireEl('board');
const pauseButton = requireEl<HTMLButtonElement>('pause-btn');
const soundButton = requireEl<HTMLButtonElement>('sound-toggle');
const announcer = requireEl('announcer');

let save: SaveData = loadSave();
let mode: Mode = 'normal';
let engine = new GameEngine();
let rafId = 0;
let lastTimestamp = 0;
let running = false;
/** Guards the visibilitychange pause against pre-render / prerender events (#20). */
let userEngaged = false;

const sfx = new Sfx();
sfx.setMuted(!save.settings.audio);
const analytics = createAnalytics();
const hud = createHud();
const overlay = createOverlay();
const board = createBoard(boardEl, engine.config.holes, (hole) => whack(hole));
const effects = createEffects(boardEl);

/* ------------------------------------------------------------------ */
/* Announcements (screen readers)                                      */
/* ------------------------------------------------------------------ */

let announceTimer: ReturnType<typeof setTimeout> | undefined;
const announce = (message: string): void => {
  if (announceTimer !== undefined) clearTimeout(announceTimer);
  announcer.textContent = message;
  announceTimer = setTimeout(() => {
    announcer.textContent = '';
  }, 1_500);
};

/* ------------------------------------------------------------------ */
/* Round lifecycle                                                     */
/* ------------------------------------------------------------------ */

const syncPauseButton = (): void => {
  const phase = engine.snapshot.phase;
  pauseButton.disabled = phase === 'idle' || phase === 'over';
  pauseButton.setAttribute('aria-label', phase === 'paused' ? '继续游戏' : '暂停游戏');
  const icon = pauseButton.querySelector('span');
  if (icon) icon.textContent = phase === 'paused' ? '▶' : '⏸';
};

const createEngine = (nextMode: Mode): GameEngine =>
  nextMode === 'daily'
    ? new GameEngine({}, seededRandom(dailySeed(new Date())))
    : new GameEngine({}, Math.random);

const startRound = (nextMode: Mode = 'normal'): void => {
  userEngaged = true;
  mode = nextMode;
  engine = createEngine(nextMode);
  sfx.unlock();
  sfx.start();
  engine.start();
  board.reset();
  effects.reset();
  hud.reset(save.bestScore);
  overlay.hide();
  syncPauseButton();
  analytics.emit('round_start', {
    mode,
    seed: nextMode === 'daily' ? dailySeed(new Date()) : 0,
    goal: engine.goalDefinition.id,
  });
  running = true;
  lastTimestamp = 0;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
};

const endRound = (): void => {
  running = false;
  cancelAnimationFrame(rafId);
  const snapshot = engine.snapshot;
  const previousBest = save.bestScore;
  const result = recordRound(save, {
    score: snapshot.finalScore,
    combo: snapshot.bestCombo,
    comboMs: snapshot.comboMs,
    // R10: playing the daily round is what marks it done; the round goal is a
    // separate mechanic and must not gate this.
    dailyDate: mode === 'daily' ? dateKey(new Date()) : save.dailyDone,
  });
  save = result.save;
  const isNewBest = snapshot.finalScore > previousBest && snapshot.finalScore > 0;

  board.reset();
  effects.reset();
  syncPauseButton();
  sfx.gameOver();
  analytics.emit('round_end', roundEndProps(snapshot));
  analytics.emit('goal_result', goalResultProps(snapshot));
  announce(isNewBest ? copy.announce.newBest : copy.result.eyebrow);
  overlay.showResult({
    score: snapshot.finalScore,
    baseScore: snapshot.score,
    bonus: snapshot.finalScore - snapshot.score,
    best: save.bestScore,
    isNewBest,
    bestCombo: snapshot.bestCombo,
    goal: snapshot.goal,
    stats: snapshot.stats,
  });
  hud.update(snapshot, save.bestScore, engine.config);
};

const setPaused = (paused: boolean): void => {
  if (paused) {
    engine.pause();
    running = false;
    cancelAnimationFrame(rafId);
    syncPauseButton();
    overlay.showPaused(engine.snapshot.score);
    announce(copy.announce.paused);
  } else {
    engine.resume();
    overlay.hide();
    syncPauseButton();
    announce(copy.announce.resumed);
    running = true;
    lastTimestamp = 0;
    rafId = requestAnimationFrame(loop);
  }
};

const togglePause = (): void => {
  const { phase } = engine.snapshot;
  if (phase === 'playing') setPaused(true);
  else if (phase === 'paused') setPaused(false);
};

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

const loop = (timestamp: number): void => {
  if (!running) return;

  const dt = lastTimestamp === 0 ? 0 : Math.min(timestamp - lastTimestamp, 250);
  lastTimestamp = timestamp;

  const events = engine.tick(dt);

  for (const event of events) {
    switch (event.type) {
      case 'escape':
        sfx.escape();
        analytics.emit('escape', {
          type: event.mole.kind,
          hole: event.mole.hole,
          ttl: event.mole.ttlMs,
          level: engine.snapshot.level,
        });
        break;
      case 'levelup':
        sfx.levelUp();
        announce(copy.announce.level(event.level));
        break;
      case 'goal': {
        sfx.goal();
        announce(copy.announce.goal(event.goal.label));
        break;
      }
      default:
        break;
    }
  }

  const snapshot = engine.snapshot;
  board.render(snapshot);
  hud.update(snapshot, save.bestScore, engine.config);

  if (events.some((event) => event.type === 'gameover')) {
    endRound();
    return;
  }

  rafId = requestAnimationFrame(loop);
};

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

function whack(hole: number): void {
  userEngaged = true;
  sfx.unlock();
  const snapshotBefore = engine.snapshot;
  const result = engine.whack(hole);
  if (result.outcome === 'ignored') return;

  const snapshot = engine.snapshot;

  if (result.outcome === 'empty') {
    // R2: a miss is acknowledged, never punished.
    sfx.empty();
    board.pulse(hole, 'empty');
    analytics.emit('miss_click', {
      hole,
      level: snapshotBefore.level,
      t_ms: snapshotBefore.elapsedMs,
    });
    return;
  }

  analytics.emit('hit', {
    type: result.outcome === 'golden' ? 'golden' : result.outcome === 'bomb' ? 'bomb' : 'normal',
    hole,
    combo_before: snapshotBefore.combo,
    level: snapshotBefore.level,
    t_ms: snapshotBefore.elapsedMs,
  });

  if (result.outcome === 'hit') {
    sfx.hit(result.combo);
    board.pulse(hole, 'hit');
    effects.floatText(hole, `+${result.points}`, 'good');
    effects.burst(hole, 'good');
    announce(copy.announce.hit(result.points, result.combo, result.multiplier));
  } else if (result.outcome === 'golden') {
    sfx.golden();
    board.pulse(hole, 'golden');
    effects.floatText(hole, `+${result.points}`, 'gold');
    effects.burst(hole, 'gold');
    announce(copy.announce.golden(result.points));
  } else {
    sfx.bomb();
    board.pulse(hole, 'bomb');
    effects.floatText(hole, `−${Math.abs(result.points)}`, 'bad');
    effects.burst(hole, 'bad');
    announce(copy.announce.bomb(result.points));
  }

  hud.update(snapshot, save.bestScore, engine.config);
}

const syncSoundButton = (): void => {
  const muted = sfx.isMuted;
  soundButton.setAttribute('aria-pressed', String(!muted));
  soundButton.setAttribute('aria-label', muted ? '打开声音' : '静音');
  const icon = soundButton.querySelector('span');
  if (icon) icon.textContent = muted ? '🔇' : '🔊';
};

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  const key = event.key;

  if (key >= '1' && key <= '9') {
    const hole = Number(key) - 1;
    if (hole < engine.config.holes) {
      event.preventDefault();
      whack(hole);
    }
    return;
  }

  switch (key.toLowerCase()) {
    case 'p':
    case 'escape':
      event.preventDefault();
      togglePause();
      break;
    case 'r':
      event.preventDefault();
      startRound(mode);
      break;
    case 'm':
      event.preventDefault();
      sfx.unlock();
      sfx.toggleMuted();
      save = writeSave({ ...save, settings: { audio: !sfx.isMuted } });
      syncSoundButton();
      announce(sfx.isMuted ? copy.announce.soundOff : copy.announce.soundOn);
      break;
    case ' ':
      if (overlay.mode === 'paused') {
        event.preventDefault();
        setPaused(false);
      } else if (engine.snapshot.phase !== 'playing') {
        event.preventDefault();
        startRound('normal');
      }
      break;
    default:
      break;
  }
});

overlay.onAction(() => {
  if (overlay.mode === 'paused') setPaused(false);
  else startRound('normal');
});

overlay.onSecondary(() => {
  startRound('daily');
});

pauseButton.addEventListener('click', () => {
  userEngaged = true;
  sfx.unlock();
  togglePause();
});

soundButton.addEventListener('click', () => {
  userEngaged = true;
  sfx.unlock();
  sfx.toggleMuted();
  save = writeSave({ ...save, settings: { audio: !sfx.isMuted } });
  syncSoundButton();
  announce(sfx.isMuted ? copy.announce.soundOff : copy.announce.soundOn);
});

document.addEventListener('visibilitychange', () => {
  // Review #20: only a real, engaged user losing focus pauses the round; a
  // prerender or background prefetch must not put the game into PAUSED.
  if (!userEngaged) return;
  if (document.hidden && engine.snapshot.phase === 'playing') setPaused(true);
});

// Review #21: a round abandoned mid-way still reports a partial round_end, so the
// funnel is not silently missing players (browser support for pagehide permitting).
globalThis.addEventListener('pagehide', () => {
  if (engine.snapshot.phase !== 'playing') return;
  analytics.emit('round_end', { ...roundEndProps(engine.snapshot), partial: true });
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
if (reduceMotion) document.documentElement.classList.add('reduce-motion');

syncSoundButton();
hud.reset(save.bestScore);
board.reset();
syncPauseButton();
overlay.showStart(save.bestScore, isDailyDone(save.dailyDone, new Date()));
analytics.emit('session_start', { ref: document.referrer || 'direct' });

// Tells the browser smoke test (and any future E2E) that the app finished booting.
appEl.dataset.ready = 'true';
