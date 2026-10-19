import type { Rank } from '../game/scoring';
import type { RoundStats } from '../game/types';

export type OverlayMode = 'start' | 'paused' | 'over';

export interface OverlayResult {
  readonly score: number;
  readonly best: number;
  readonly isNewBest: boolean;
  readonly rank: Rank;
  readonly stats: RoundStats;
  readonly bestCombo: number;
}

export interface OverlayHandle {
  readonly mode: OverlayMode;
  showStart(best: number): void;
  showPaused(score: number): void;
  showResult(result: OverlayResult): void;
  hide(): void;
  onAction(handler: () => void): void;
}

const requireEl = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

export const createOverlay = (): OverlayHandle => {
  const root = requireEl('overlay');
  const eyebrow = requireEl('overlay-eyebrow');
  const title = requireEl('overlay-title');
  const body = requireEl('overlay-body');
  const statsEl = requireEl('overlay-stats');
  const action = requireEl<HTMLButtonElement>('overlay-action');

  let currentMode: OverlayMode = 'start';
  let actionHandler: (() => void) | null = null;

  action.addEventListener('click', () => actionHandler?.());

  const open = (): void => {
    root.hidden = false;
    root.classList.add('overlay--visible');
    action.focus({ preventScroll: true });
  };

  const showStart = (best: number): void => {
    currentMode = 'start';
    eyebrow.textContent = 'Ready?';
    title.textContent = 'Whack every mole';
    body.innerHTML =
      'Click, tap, or press <kbd>1</kbd>–<kbd>9</kbd>. Sixty seconds. Golden moles are worth 5×, bombs cost you.';
    statsEl.hidden = true;
    statsEl.replaceChildren();
    action.textContent = best > 0 ? 'Play again' : 'Start game';
    open();
  };

  const showPaused = (score: number): void => {
    currentMode = 'paused';
    eyebrow.textContent = 'Paused';
    title.textContent = 'Take a breath';
    body.textContent = `Score so far: ${score.toLocaleString('en-US')}. Press P or the button to jump back in.`;
    statsEl.hidden = true;
    action.textContent = 'Resume';
    open();
  };

  const showResult = (result: OverlayResult): void => {
    currentMode = 'over';
    eyebrow.textContent = result.isNewBest ? 'New personal best 🎉' : 'Time!';
    title.textContent = `You scored ${result.score.toLocaleString('en-US')}`;
    body.textContent = result.isNewBest
      ? 'That is your best run yet. Think you can beat it?'
      : `Personal best stays at ${result.best.toLocaleString('en-US')}.`;

    statsEl.replaceChildren();
    const rows: Array<[string, string]> = [
      ['Rank', `${result.rank.emoji} ${result.rank.label}`],
      ['Moles hit', String(result.stats.hits)],
      ['Golden', String(result.stats.golden)],
      ['Bombs', String(result.stats.bombs)],
      ['Escaped', String(result.stats.escaped)],
      ['Best combo', String(result.bestCombo)],
    ];
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      statsEl.append(dt, dd);
    }
    statsEl.hidden = false;
    action.textContent = 'Play again';
    open();
  };

  const hide = (): void => {
    root.classList.remove('overlay--visible');
    root.hidden = true;
  };

  const onAction = (handler: () => void): void => {
    actionHandler = handler;
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
  };
};
