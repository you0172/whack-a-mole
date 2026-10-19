import './styles/main.css';
import { Sfx } from './audio/sfx';
import { GameEngine } from './game/engine';
import { rankFor } from './game/scoring';
import type { GameEvent } from './game/types';
import { createBoard } from './ui/board';
import { createHud } from './ui/hud';
import { createOverlay } from './ui/overlay';
import { readBestScore, writeBestScore } from './storage/highscores';

const requireEl = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const boardEl = requireEl('board');
const pauseButton = requireEl<HTMLButtonElement>('pause-btn');
const soundButton = requireEl<HTMLButtonElement>('sound-toggle');
const announcer = requireEl('announcer');

const engine = new GameEngine();
const sfx = new Sfx();
const hud = createHud();
const overlay = createOverlay();

let best = readBestScore();
let rafId = 0;
let lastTimestamp = 0;
let running = false;

const board = createBoard(boardEl, engine.config.holes, (hole) => whack(hole));

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

const syncPauseButton = (phase: 'idle' | 'playing' | 'paused' | 'over'): void => {
  pauseButton.disabled = phase === 'idle' || phase === 'over';
  pauseButton.setAttribute('aria-label', phase === 'paused' ? 'Resume game' : 'Pause game');
  const icon = pauseButton.querySelector('span');
  if (icon) icon.textContent = phase === 'paused' ? '▶' : '⏸';
};

const startRound = (): void => {
  sfx.unlock();
  sfx.start();
  engine.start();
  board.reset();
  hud.reset(best);
  overlay.hide();
  syncPauseButton('playing');
  running = true;
  lastTimestamp = 0;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
};

const endRound = (): void => {
  running = false;
  cancelAnimationFrame(rafId);
  const snapshot = engine.snapshot;
  const isNewBest = snapshot.score > best;
  best = writeBestScore(snapshot.score);
  board.reset();
  syncPauseButton('over');
  sfx.gameOver();
  overlay.showResult({
    score: snapshot.score,
    best,
    isNewBest,
    rank: rankFor(snapshot.score),
    stats: snapshot.stats,
    bestCombo: snapshot.bestCombo,
  });
  hud.update(snapshot, best, engine.config);
};

const setPaused = (paused: boolean): void => {
  if (paused) {
    engine.pause();
    running = false;
    cancelAnimationFrame(rafId);
    syncPauseButton('paused');
    overlay.showPaused(engine.snapshot.score);
  } else {
    engine.resume();
    overlay.hide();
    syncPauseButton('playing');
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

const handleEvents = (events: GameEvent[]): void => {
  for (const event of events) {
    switch (event.type) {
      case 'escape':
        sfx.escape();
        break;
      case 'levelup':
        sfx.levelUp();
        announce(`Level ${event.level}`);
        break;
      case 'spawn':
        break;
      default:
        break;
    }
  }
};

const loop = (timestamp: number): void => {
  if (!running) return;

  const dt = lastTimestamp === 0 ? 0 : Math.min(timestamp - lastTimestamp, 250);
  lastTimestamp = timestamp;

  const events = engine.tick(dt);
  handleEvents(events);

  const snapshot = engine.snapshot;
  board.render(snapshot);
  hud.update(snapshot, best, engine.config);

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
  sfx.unlock();
  const result = engine.whack(hole);
  if (result.outcome === 'ignored') return;

  if (result.outcome === 'hit') {
    sfx.hit(result.combo);
    board.pulse(hole, 'hit');
    if (multiplierLabel(result.multiplier)) {
      announce(
        `Hit for ${result.points}. Combo ${result.combo}, ${multiplierLabel(result.multiplier)}.`,
      );
    } else {
      announce(`Hit for ${result.points}. Combo ${result.combo}.`);
    }
  } else if (result.outcome === 'golden') {
    sfx.golden();
    board.pulse(hole, 'golden');
    announce(`Golden mole! ${result.points} points.`);
  } else if (result.outcome === 'bomb') {
    sfx.bomb();
    board.pulse(hole, 'bomb');
    announce(`Bomb. Minus ${Math.abs(result.points)} points.`);
  }

  if (result.outcome !== 'empty') {
    hud.update(engine.snapshot, best, engine.config);
  }
}

const multiplierLabel = (multiplier: number): string =>
  multiplier > 1 ? `${multiplier} times multiplier` : '';

document.addEventListener('keydown', (event) => {
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
      event.preventDefault();
      togglePause();
      break;
    case 'r':
      event.preventDefault();
      startRound();
      break;
    case ' ':
      if (overlay.mode === 'paused') {
        event.preventDefault();
        setPaused(false);
      } else if (engine.snapshot.phase !== 'playing') {
        event.preventDefault();
        startRound();
      }
      break;
    default:
      break;
  }
});

overlay.onAction(() => {
  if (overlay.mode === 'paused') setPaused(false);
  else startRound();
});

pauseButton.addEventListener('click', () => {
  sfx.unlock();
  togglePause();
});

soundButton.addEventListener('click', () => {
  sfx.unlock();
  const muted = sfx.toggleMuted();
  soundButton.setAttribute('aria-pressed', String(!muted));
  soundButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  const icon = soundButton.querySelector('span');
  if (icon) icon.textContent = muted ? '🔇' : '🔊';
  announce(muted ? 'Sound off' : 'Sound on');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && engine.snapshot.phase === 'playing') setPaused(true);
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
if (reduceMotion) document.documentElement.classList.add('reduce-motion');

hud.reset(best);
board.reset();
syncPauseButton('idle');
overlay.showStart(best);
