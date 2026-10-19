import { multiplierFor } from '../game/scoring';
import type { GameConfig, GameSnapshot } from '../game/types';

export interface HudHandle {
  update(snapshot: GameSnapshot, best: number, config: GameConfig): void;
  reset(best: number): void;
}

const requireEl = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

/** Reads the HUD elements once, then only writes what actually changed. */
export const createHud = (): HudHandle => {
  const scoreEl = requireEl('score');
  const comboEl = requireEl('combo');
  const levelEl = requireEl('level');
  const bestEl = requireEl('best');
  const timerFill = requireEl('timer-fill');
  const timerValue = requireEl('timer-value');

  let lastScore = -1;
  let lastCombo = -1;
  let lastLevel = -1;
  let lastBest = -1;
  let lastSeconds = -1;
  let lastPercent = -1;

  const update = (snapshot: GameSnapshot, best: number, config: GameConfig): void => {
    if (snapshot.score !== lastScore) {
      scoreEl.textContent = snapshot.score.toLocaleString('en-US');
      lastScore = snapshot.score;
    }

    const multiplier = multiplierFor(snapshot.combo, config);
    if (snapshot.combo !== lastCombo) {
      comboEl.textContent = snapshot.combo > 0 ? `${snapshot.combo}` : '—';
      comboEl.classList.toggle('is-hot', multiplier > 1);
      comboEl.dataset.multiplier = `x${multiplier}`;
      lastCombo = snapshot.combo;
    }

    if (snapshot.level !== lastLevel) {
      levelEl.textContent = String(snapshot.level);
      levelEl.classList.add('bump');
      globalThis.setTimeout(() => levelEl.classList.remove('bump'), 320);
      lastLevel = snapshot.level;
    }

    if (best !== lastBest) {
      bestEl.textContent = best.toLocaleString('en-US');
      lastBest = best;
    }

    const seconds = Math.ceil(snapshot.remainingMs / 1000);
    if (seconds !== lastSeconds) {
      timerValue.textContent = `${seconds}`;
      timerValue.classList.toggle('is-critical', seconds <= 10);
      timerFill.classList.toggle('is-critical', seconds <= 10);
      lastSeconds = seconds;
    }

    const percent = Math.max(0, Math.min(100, (snapshot.remainingMs / config.roundMs) * 100));
    if (Math.abs(percent - lastPercent) > 0.2) {
      timerFill.style.width = `${percent.toFixed(2)}%`;
      lastPercent = percent;
    }
  };

  const reset = (best: number): void => {
    lastScore = -1;
    lastCombo = -1;
    lastLevel = -1;
    lastBest = -1;
    lastSeconds = -1;
    lastPercent = -1;
    bestEl.textContent = best.toLocaleString('en-US');
    timerFill.style.width = '100%';
  };

  return { update, reset };
};
