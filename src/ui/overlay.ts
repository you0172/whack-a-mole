import { copy } from '../copy';
import type { GoalProgress, RoundStats } from '../game/types';

export type OverlayMode = 'start' | 'paused' | 'over';

export interface OverlayResult {
  /** Score including the goal bonus — the number the player keeps. */
  readonly score: number;
  /** Score before the goal bonus. */
  readonly baseScore: number;
  readonly bonus: number;
  readonly best: number;
  readonly isNewBest: boolean;
  readonly bestCombo: number;
  readonly goal: GoalProgress;
  readonly stats: RoundStats;
}

export interface OverlayHandle {
  readonly mode: OverlayMode;
  showStart(best: number, dailyDone: boolean): void;
  showPaused(score: number): void;
  showResult(result: OverlayResult): void;
  hide(): void;
  onAction(handler: () => void): void;
  onSecondary(handler: () => void): void;
}

const requireEl = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

/**
 * The three screens: start, paused, settlement (PRD §4.8).
 *
 * Settlement reads top-to-bottom in the order the PRD fixes: score → record →
 * best combo → goal result → "play again". Everything else is demoted to a single
 * quiet line so the screen is readable in under three seconds (§10.3).
 */
export const createOverlay = (): OverlayHandle => {
  const root = requireEl('overlay');
  const card = requireEl('overlay-card');
  const eyebrow = requireEl('overlay-eyebrow');
  const title = requireEl('overlay-title');
  const body = requireEl('overlay-body');
  const statsEl = requireEl('overlay-stats');
  const detailEl = requireEl('overlay-detail');
  const action = requireEl<HTMLButtonElement>('overlay-action');
  const secondary = requireEl<HTMLButtonElement>('overlay-secondary');

  let currentMode: OverlayMode = 'start';
  let actionHandler: (() => void) | null = null;
  let secondaryHandler: (() => void) | null = null;

  action.addEventListener('click', () => actionHandler?.());
  secondary.addEventListener('click', () => secondaryHandler?.());

  const open = (): void => {
    root.hidden = false;
    root.classList.add('overlay--visible');
    action.focus({ preventScroll: true });
  };

  const addRow = (label: string, value: string, emphasis = false): void => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (emphasis) dd.classList.add('is-emphasis');
    statsEl.append(dt, dd);
  };

  const showStart = (best: number, dailyDone: boolean): void => {
    currentMode = 'start';
    card.classList.remove('overlay__card--record');
    eyebrow.textContent = copy.start.eyebrow;
    title.textContent = copy.start.title;
    body.textContent = copy.start.body;
    statsEl.hidden = true;
    statsEl.replaceChildren();
    detailEl.hidden = false;
    detailEl.textContent =
      best > 0 ? `历史最佳 ${best.toLocaleString('zh-CN')} 分` : '还没记录，这一局就是基线';
    // R10: the daily challenge is offered from the first visit of the day, not
    // only after it has already been played.
    secondary.hidden = false;
    secondary.textContent = dailyDone ? '今日挑战（已完成，可重玩）' : '今日挑战';
    action.textContent = best > 0 ? copy.start.actionAgain : copy.start.action;
    open();
  };

  const showPaused = (score: number): void => {
    currentMode = 'paused';
    card.classList.remove('overlay__card--record');
    eyebrow.textContent = copy.paused.eyebrow;
    title.textContent = copy.paused.title;
    body.textContent = copy.paused.body(score.toLocaleString('zh-CN'));
    statsEl.hidden = true;
    statsEl.replaceChildren();
    detailEl.hidden = true;
    secondary.hidden = true;
    action.textContent = copy.paused.action;
    open();
  };

  const showResult = (result: OverlayResult): void => {
    currentMode = 'over';
    card.classList.toggle('overlay__card--record', result.isNewBest);
    eyebrow.textContent = result.isNewBest ? copy.result.eyebrowNewBest : copy.result.eyebrow;
    title.textContent = copy.result.title(result.score.toLocaleString('zh-CN'));
    body.textContent = result.isNewBest
      ? copy.result.subtitleNewBest
      : copy.result.subtitle(result.best.toLocaleString('zh-CN'));

    statsEl.replaceChildren();
    addRow(copy.result.rows.score, result.score.toLocaleString('zh-CN'), true);
    addRow(copy.result.rows.record, result.isNewBest ? copy.result.yes : copy.result.no);
    addRow(copy.result.rows.combo, `${result.bestCombo} 次`);
    addRow(
      copy.result.rows.goal,
      result.goal.done
        ? copy.result.goalDone(result.bonus)
        : copy.result.goalMissed(result.goal.current, result.goal.target),
    );
    statsEl.hidden = false;

    detailEl.hidden = false;
    detailEl.textContent = [
      `${copy.result.rows.golden} ${result.stats.golden}`,
      `${copy.result.rows.bombs} ${result.stats.bombs}`,
      `${copy.result.rows.escaped} ${result.stats.escaped}`,
      `${copy.result.rows.misses} ${result.stats.emptySwings}`,
    ].join(' · ');

    secondary.hidden = true;
    action.textContent = copy.result.action;
    open();
  };

  const hide = (): void => {
    root.classList.remove('overlay--visible');
    root.hidden = true;
    // R12: never leave focus on a node we just hid — keyboard players would lose
    // their place and the next Tab press would start from the document top.
    const target =
      document.querySelector<HTMLElement>('#board .hole') ?? document.getElementById('board');
    target?.focus({ preventScroll: true });
  };

  const onAction = (handler: () => void): void => {
    actionHandler = handler;
  };

  const onSecondary = (handler: () => void): void => {
    secondaryHandler = handler;
  };

  return {
    get mode() {
      return currentMode;
    },
    showStart,
    showPaused,
    showResult,
    hide,
    onAction,
    onSecondary,
  };
};
