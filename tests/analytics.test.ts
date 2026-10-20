import { describe, expect, it, vi } from 'vitest';
import { createAnalytics, goalResultProps, roundEndProps } from '../src/game/analytics';
import { GameEngine } from '../src/game/engine';

describe('analytics (R14)', () => {
  it('buffers events when enabled', () => {
    const analytics = createAnalytics({ now: () => 1_000 });
    const event = analytics.emit('session_start', { ref: 'direct' });

    expect(event).toEqual({ name: 'session_start', ts: 1_000, props: { ref: 'direct' } });
    expect(analytics.drain()).toHaveLength(1);
  });

  it('sends nothing at all when consent is missing', () => {
    const transport = vi.fn();
    const analytics = createAnalytics({ enabled: false, transport });

    expect(analytics.emit('round_start', { mode: 'normal' })).toBeNull();
    expect(transport).not.toHaveBeenCalled();
    expect(analytics.drain()).toHaveLength(0);
  });

  it('forwards to a transport once one is wired up', () => {
    const transport = vi.fn();
    const analytics = createAnalytics();
    analytics.setTransport(transport);
    analytics.emit('hit', { type: 'normal' });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0].name).toBe('hit');
  });

  it('can be switched off after the fact', () => {
    const analytics = createAnalytics();
    analytics.emit('hit', {});
    analytics.setEnabled(false);
    expect(analytics.emit('hit', {})).toBeNull();
    expect(analytics.drain()).toHaveLength(1);
  });

  it('bounds the buffer and keeps the newest events', () => {
    const analytics = createAnalytics({ maxBuffer: 2 });
    analytics.emit('hit', { n: 1 });
    analytics.emit('hit', { n: 2 });
    analytics.emit('hit', { n: 3 });

    const drained = analytics.drain();
    expect(drained).toHaveLength(2);
    expect(drained.map((event) => event.props.n)).toEqual([2, 3]);
  });

  it('returns a copy from drain so callers cannot mutate the buffer', () => {
    const analytics = createAnalytics();
    analytics.emit('hit', {});
    const first = analytics.drain();
    first.pop();
    expect(analytics.drain()).toHaveLength(1);
  });
});

describe('event payloads (appendix C)', () => {
  const engine = new GameEngine({ roundMs: 1_000 }, () => 0.5);
  engine.start();
  engine.tick(1_000);
  const snapshot = engine.snapshot;

  it('builds every round_end field the PRD asks for', () => {
    const props = roundEndProps(snapshot);
    for (const key of [
      'score',
      'max_combo',
      'hits',
      'bombs',
      'escapes',
      'level_reached',
      'duration',
    ]) {
      expect(props).toHaveProperty(key);
    }
    expect(props.duration).toBe(1_000);
  });

  it('builds the goal_result payload', () => {
    const props = goalResultProps(snapshot);
    expect(props).toHaveProperty('goal');
    expect(props).toHaveProperty('done');
    expect(props).toHaveProperty('bonus');
    expect(typeof props.goal).toBe('string');
  });
});
