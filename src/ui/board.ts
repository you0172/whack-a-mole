import type { GameSnapshot, Mole, MoleKind } from '../game/types';

export interface BoardHandle {
  /** Reconcile the DOM with the latest engine state. Cheap to call every frame. */
  render(snapshot: GameSnapshot): void;
  /** Remove every mole and reset transient classes. */
  reset(): void;
  /** Briefly flash a hole to acknowledge a hit. */
  pulse(hole: number, outcome: 'hit' | 'golden' | 'bomb'): void;
}

const LABELS: Record<MoleKind, string> = {
  normal: 'mole',
  golden: 'golden mole',
  bomb: 'bomb',
};

/**
 * Builds the 3x3 (or N) board. Every hole is a real <button>, so keyboard users
 * get native focus, activation and screen-reader announcements for free.
 */
export const createBoard = (
  root: HTMLElement,
  holes: number,
  onWhack: (hole: number) => void,
): BoardHandle => {
  root.replaceChildren();
  const elements: HTMLButtonElement[] = [];

  for (let index = 0; index < holes; index += 1) {
    const hole = document.createElement('button');
    hole.type = 'button';
    hole.className = 'hole';
    hole.dataset.hole = String(index);
    hole.setAttribute('aria-label', `Hole ${index + 1}, empty`);
    hole.style.setProperty('--index', String(index));

    const rim = document.createElement('span');
    rim.className = 'hole__rim';
    rim.setAttribute('aria-hidden', 'true');

    const mole = document.createElement('span');
    mole.className = 'mole';
    mole.setAttribute('aria-hidden', 'true');

    const face = document.createElement('span');
    face.className = 'mole__face';
    mole.append(face);

    hole.append(rim, mole);
    hole.addEventListener('click', () => onWhack(index));

    root.append(hole);
    elements.push(hole);
  }

  let previousIds = new Map<number, number>();

  const render = (snapshot: GameSnapshot): void => {
    const active = new Map<number, Mole>();
    for (const mole of snapshot.moles) active.set(mole.hole, mole);

    const nextIds = new Map<number, number>();

    elements.forEach((element, index) => {
      const mole = active.get(index);
      const previousId = previousIds.get(index);

      if (!mole) {
        if (previousId !== undefined) {
          element.classList.remove('hole--active');
          element.removeAttribute('data-kind');
          element.style.removeProperty('--ttl');
          element.setAttribute('aria-label', `Hole ${index + 1}, empty`);
        }
        return;
      }

      nextIds.set(index, mole.id);

      if (previousId !== mole.id) {
        element.classList.add('hole--active');
        element.dataset.kind = mole.kind;
        element.setAttribute('aria-label', `Hole ${index + 1}, ${LABELS[mole.kind]}`);
      }

      const ratio = mole.ttlMs > 0 ? Math.max(0, Math.min(1, mole.remainingMs / mole.ttlMs)) : 0;
      element.style.setProperty('--ttl', ratio.toFixed(3));
    });

    previousIds = nextIds;
  };

  const reset = (): void => {
    for (const element of elements) {
      element.classList.remove('hole--active', 'hole--hit', 'hole--bomb', 'hole--golden');
      element.removeAttribute('data-kind');
      element.style.removeProperty('--ttl');
      element.setAttribute('aria-label', `Hole ${Number(element.dataset.hole) + 1}, empty`);
    }
    previousIds = new Map();
  };

  const pulse = (hole: number, outcome: 'hit' | 'golden' | 'bomb'): void => {
    const element = elements[hole];
    if (!element) return;
    const className =
      outcome === 'bomb' ? 'hole--bomb' : outcome === 'golden' ? 'hole--golden' : 'hole--hit';
    element.classList.remove('hole--hit', 'hole--bomb', 'hole--golden');
    // Force a reflow so the animation restarts even on rapid repeats.
    void element.offsetWidth;
    element.classList.add(className);
    const cleanup = (): void => {
      element.classList.remove(className);
      element.removeEventListener('animationend', cleanup);
    };
    element.addEventListener('animationend', cleanup);
  };

  return { render, reset, pulse };
};
