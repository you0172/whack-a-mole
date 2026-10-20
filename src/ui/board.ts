import type { GameSnapshot, Mole, MoleKind } from '../game/types';

export type PulseTone = 'hit' | 'golden' | 'bomb' | 'empty';

export interface BoardHandle {
  /** Reconcile the DOM with the latest engine state. Cheap to call every frame. */
  render(snapshot: GameSnapshot): void;
  /** Remove every mole and reset transient classes. */
  reset(): void;
  /** Briefly flash a hole to acknowledge an input (hit, golden, bomb or a miss). */
  pulse(hole: number, outcome: PulseTone): void;
}

const LABELS: Record<MoleKind, string> = {
  normal: '地鼠',
  golden: '金鼠',
  bomb: '炸弹',
};

const PULSE_CLASS: Record<PulseTone, string> = {
  hit: 'hole--hit',
  golden: 'hole--golden',
  bomb: 'hole--bomb',
  empty: 'hole--empty',
};

/**
 * Builds the 3×3 board. Every hole is a real <button>, so keyboard users get
 * native focus, activation and screen-reader announcements for free.
 *
 * Target shapes differ per kind (not just colour) so the three types stay
 * distinguishable with sound off and for colour-blind players (§4.6 / R12).
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
    hole.setAttribute('aria-label', `第 ${index + 1} 号洞，空`);
    hole.style.setProperty('--index', String(index));

    const rim = document.createElement('span');
    rim.className = 'hole__rim';
    rim.setAttribute('aria-hidden', 'true');

    const mole = document.createElement('span');
    mole.className = 'mole';
    mole.setAttribute('aria-hidden', 'true');

    const face = document.createElement('span');
    face.className = 'mole__face';
    // Shape marker: normal = round, golden = diamond, bomb = square with a fuse.
    const marker = document.createElement('span');
    marker.className = 'mole__marker';
    mole.append(face, marker);

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
          element.setAttribute('aria-label', `第 ${index + 1} 号洞，空`);
        }
        return;
      }

      nextIds.set(index, mole.id);

      if (previousId !== mole.id) {
        element.classList.add('hole--active');
        element.dataset.kind = mole.kind;
        element.setAttribute('aria-label', `第 ${index + 1} 号洞，${LABELS[mole.kind]}`);
      }

      const ratio = mole.ttlMs > 0 ? Math.max(0, Math.min(1, mole.remainingMs / mole.ttlMs)) : 0;
      element.style.setProperty('--ttl', ratio.toFixed(3));
    });

    previousIds = nextIds;
  };

  const reset = (): void => {
    for (const element of elements) {
      element.classList.remove(
        'hole--active',
        'hole--hit',
        'hole--bomb',
        'hole--golden',
        'hole--empty',
      );
      element.removeAttribute('data-kind');
      element.style.removeProperty('--ttl');
      element.setAttribute('aria-label', `第 ${Number(element.dataset.hole) + 1} 号洞，空`);
    }
    previousIds = new Map();
  };

  const pulse = (hole: number, outcome: PulseTone): void => {
    const element = elements[hole];
    if (!element) return;
    const className = PULSE_CLASS[outcome];
    element.classList.remove(
      PULSE_CLASS.hit,
      PULSE_CLASS.bomb,
      PULSE_CLASS.golden,
      PULSE_CLASS.empty,
    );
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
