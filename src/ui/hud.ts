import { copy } from '../copy';
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

/**
 * Reads the HUD elements once, then only writes what actually changed.
 *
 * PRD §4.8 fixes the HUD at five items (score, combo multiplier, level, personal
 * best, remaining time). The round goal (R9) sits in its own strip above the board
 * so it never competes with them for attention.
 */
export const createHud = (): HudHandle => {
  const scoreEl = requireEl('score');
  const comboEl = requireEl('combo');
  const levelEl = requireEl('level');
  const bestEl = requireEl('best');
  const timerFill = requireEl('timer-fill');
  const timerValue = requireEl('timer-value');
  const goalText = requireEl('goal-text');
  const goalProgress = requireEl('goal-progress');
  const goalChip = requireEl('goal');
  const app = requireEl('app');

  let lastScore = -1;
  let lastCombo = -1;
  let lastMultiplier = -1;
  let lastLevel = -1;
  let lastBest = -1;
  let lastSeconds = -1;
  let lastPercent = -1;
  let lastGoal = '';

  const update = (snapshot: GameSnapshot, best: number, config: GameConfig): void => {
    if (snapshot.score !== lastScore) {
      scoreEl.textContent = snapshot.score.toLocaleString('zh-CN');
      lastScore = snapshot.score;
    }

    if (snapshot.combo !== lastCombo || snapshot.multiplier !== lastMultiplier) {
      comboEl.textContent = snapshot.combo > 0 ? `x${snapshot.multiplier}` : '—';
      comboEl.classList.toggle('is-hot', snapshot.multiplier > 1);
      comboEl.dataset.combo = String(snapshot.combo);
      // PRD §4.3.2: the frame glows from 3× upwards to say "don't break it".
      app.classList.toggle('is-fever', snapshot.multiplier >= 3);
      lastCombo = snapshot.combo;
      lastMultiplier = snapshot.multiplier;
    }

    if (snapshot.level !== lastLevel) {
      levelEl.textContent = String(snapshot.level);
      if (lastLevel !== -1) {
        levelEl.classList.add('bump');
        globalThis.setTimeout(() => levelEl.classList.remove('bump'), 320);
      }
      lastLevel = snapshot.level;
    }

    if (best !== lastBest) {
      bestEl.textContent = best.toLocaleString('zh-CN');
      lastBest = best;
    }

    const seconds = Math.ceil(snapshot.remainingMs / 1000);
    if (seconds !== lastSeconds) {
      timerValue.textContent = `${seconds}`;
      // R6: the last ten seconds are highlighted visually, with no extra sound.
      timerValue.classList.toggle('is-critical', seconds <= 10);
      timerFill.classList.toggle('is-critical', seconds <= 10);
      lastSeconds = seconds;
    }

    const percent = Math.max(0, Math.min(100, (snapshot.remainingMs / config.roundMs) * 100));
    if (Math.abs(percent - lastPercent) > 0.2) {
      timerFill.style.width = `${percent.toFixed(2)}%`;
      lastPercent = percent;
    }

    const goalValue = snapshot.goal.done
      ? copy.hud.goalDone
      : `${snapshot.goal.current}/${snapshot.goal.target}`;
    const signature = `${snapshot.goal.label}|${goalValue}`;
    if (signature !== lastGoal) {
      goalText.textContent = snapshot.goal.label;
      goalProgress.textContent = goalValue;
      goalChip.classList.toggle('is-done', snapshot.goal.done);
      lastGoal = signature;
    }
  };

  const reset = (best: number): void => {
    lastScore = -1;
    lastCombo = -1;
    lastMultiplier = -1;
    lastLevel = -1;
    lastBest = -1;
    lastSeconds = -1;
    lastPercent = -1;
    lastGoal = '';
    bestEl.textContent = best.toLocaleString('zh-CN');
    timerFill.style.width = '100%';
    timerValue.classList.remove('is-critical');
    timerFill.classList.remove('is-critical');
    goalChip.classList.remove('is-done');
    app.classList.remove('is-fever');
  };

  return { update, reset };
};
