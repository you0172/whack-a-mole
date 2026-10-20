import type { GameSnapshot } from './types';

/** The eight events in PRD appendix C. */
export type AnalyticsEventName =
  | 'session_start'
  | 'round_start'
  | 'hit'
  | 'miss_click'
  | 'escape'
  | 'round_end'
  | 'goal_result'
  | 'share';

export type AnalyticsProp = string | number | boolean | null;

export interface AnalyticsEvent {
  readonly name: AnalyticsEventName;
  readonly ts: number;
  readonly props: Readonly<Record<string, AnalyticsProp>>;
}

/** Where events go. The default is nowhere: this build sends no network traffic. */
export type Transport = (event: AnalyticsEvent) => void;

export interface AnalyticsOptions {
  readonly enabled?: boolean;
  readonly transport?: Transport | null;
  readonly maxBuffer?: number;
  readonly now?: () => number;
}

export interface AnalyticsHandle {
  readonly enabled: boolean;
  emit(name: AnalyticsEventName, props?: Record<string, AnalyticsProp>): AnalyticsEvent | null;
  /** Events collected so far, oldest first (bounded by `maxBuffer`). */
  drain(): AnalyticsEvent[];
  setEnabled(enabled: boolean): void;
  setTransport(transport: Transport | null): void;
}

/**
 * Minimal, dependency-free event pipeline (R14).
 *
 * There is no backend in this version and Q3 (统计方案) is still open, so the
 * default transport is `null`: events are buffered in memory for inspection and
 * nothing leaves the page. Wiring a real endpoint later is a one-line
 * `setTransport` call — the call sites do not change.
 *
 * When `enabled` is false (no consent) `emit` returns null and produces no event
 * at all, which is what R14's second clause requires.
 */
export const createAnalytics = (options: AnalyticsOptions = {}): AnalyticsHandle => {
  const maxBuffer = Math.max(1, options.maxBuffer ?? 200);
  const now = options.now ?? (() => Date.now());
  let enabled = options.enabled ?? true;
  let transport = options.transport ?? null;
  let buffer: AnalyticsEvent[] = [];

  const emit: AnalyticsHandle['emit'] = (name, props = {}) => {
    if (!enabled) return null;
    const event: AnalyticsEvent = { name, ts: now(), props };
    buffer = [...buffer, event];
    if (buffer.length > maxBuffer) buffer = buffer.slice(buffer.length - maxBuffer);
    transport?.(event);
    return event;
  };

  return {
    get enabled() {
      return enabled;
    },
    emit,
    drain: () => [...buffer],
    setEnabled: (next: boolean) => {
      enabled = next;
    },
    setTransport: (next: Transport | null) => {
      transport = next;
    },
  };
};

/** The `round_end` payload required by R14. */
export const roundEndProps = (snapshot: GameSnapshot): Record<string, AnalyticsProp> => ({
  score: snapshot.finalScore,
  base_score: snapshot.score,
  max_combo: snapshot.bestCombo,
  hits: snapshot.stats.hits,
  golden: snapshot.stats.golden,
  bombs: snapshot.stats.bombs,
  escapes: snapshot.stats.escaped,
  misses: snapshot.stats.emptySwings,
  level_reached: snapshot.level,
  duration: Math.round(snapshot.elapsedMs),
});

/** The `goal_result` payload from appendix C. */
export const goalResultProps = (snapshot: GameSnapshot): Record<string, AnalyticsProp> => ({
  goal: snapshot.goal.id,
  done: snapshot.goal.done,
  bonus: snapshot.finalScore - snapshot.score,
});
