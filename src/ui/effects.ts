/**
 * Hit feedback layer (PRD §4.6): floating score text and short hit particles.
 *
 * Both are capped so the frame budget holds: at most four floating numbers are
 * alive (older ones are replaced) and at most 24 particles are on screen at once.
 * Everything is skipped under `prefers-reduced-motion` (R12).
 */
export type FeedbackTone = 'good' | 'gold' | 'bad';

export interface EffectsHandle {
  /** Push a floating number out of a hole: +10 / +50 / −25. */
  floatText(hole: number, text: string, tone: FeedbackTone): void;
  /** 4–6 short lines flying up and out of a hole. */
  burst(hole: number, tone: FeedbackTone): void;
  reset(): void;
}

const MAX_FLOATS = 4;
const PARTICLES_PER_BURST = 5;
const MAX_PARTICLES = 24;

export const createEffects = (boardRoot: HTMLElement): EffectsHandle => {
  let floats: HTMLElement[] = [];
  let particles = 0;
  const reducedMotion = (): boolean => document.documentElement.classList.contains('reduce-motion');

  const holeElement = (hole: number): HTMLElement | null =>
    boardRoot.querySelector<HTMLElement>(`[data-hole="${hole}"]`);

  const floatText = (hole: number, text: string, tone: FeedbackTone): void => {
    const host = holeElement(hole);
    if (!host) return;

    // Replace the oldest float rather than growing without bound.
    while (floats.length >= MAX_FLOATS) {
      const oldest = floats.shift();
      oldest?.remove();
    }

    const span = document.createElement('span');
    span.className = `float float--${tone}`;
    span.textContent = text;
    span.setAttribute('aria-hidden', 'true');
    host.append(span);
    floats.push(span);
    globalThis.setTimeout(() => {
      span.remove();
      floats = floats.filter((entry) => entry !== span);
    }, 400);
  };

  const burst = (hole: number, tone: FeedbackTone): void => {
    if (reducedMotion()) return;
    const host = holeElement(hole);
    if (!host) return;

    const allowed = Math.min(PARTICLES_PER_BURST, MAX_PARTICLES - particles);
    for (let index = 0; index < allowed; index += 1) {
      const particle = document.createElement('span');
      particle.className = `particle particle--${tone}`;
      particle.setAttribute('aria-hidden', 'true');
      // Spread the lines over a half circle above the hole.
      const spread = 150;
      const angle = -90 + (index / Math.max(1, allowed - 1) - 0.5) * spread;
      particle.style.setProperty('--angle', `${angle}deg`);
      particle.style.setProperty('--distance', `${18 + index * 3}px`);
      host.append(particle);
      particles += 1;
      globalThis.setTimeout(() => {
        particle.remove();
        particles = Math.max(0, particles - 1);
      }, 140);
    }
  };

  const reset = (): void => {
    for (const element of floats) element.remove();
    floats = [];
    boardRoot.querySelectorAll('.particle').forEach((element) => element.remove());
    particles = 0;
  };

  return { floatText, burst, reset };
};
