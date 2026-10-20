/**
 * Web Audio sound effects, synthesised at runtime — zero audio assets (ADR D2).
 *
 * Every voice follows PRD §4.6: waveform + fast decay envelope makes the transient
 * half of the hit feel, and the three target types are distinguishable by pitch
 * movement alone, so the game still reads with the sound off.
 *
 * Nothing is created until `unlock()` runs from a real user gesture (R11).
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.01);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Create/resume the AudioContext. Must be called from a user gesture (R11). */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.context = new Ctor();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.context.destination);
      } catch {
        this.context = null;
        this.master = null;
        return;
      }
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  /** True when audio can actually produce sound. */
  private get ready(): boolean {
    return this.context !== null && this.master !== null && !this.muted;
  }

  /** One enveloped oscillator: the whole sound-design primitive. */
  private tone(options: {
    readonly type: OscillatorType;
    readonly from: number;
    readonly to?: number;
    readonly durationMs: number;
    readonly gain: number;
    readonly delayMs?: number;
  }): void {
    const ctx = this.context;
    const master = this.master;
    if (!ctx || !master || this.muted) return;

    const start = ctx.currentTime + (options.delayMs ?? 0) / 1000;
    const duration = options.durationMs / 1000;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();

    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.from, start);
    if (options.to !== undefined && options.to !== options.from) {
      // Pitch glide, e.g. the bomb's 220 → 60 Hz fall.
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), start + duration);
    }

    envelope.gain.setValueAtTime(options.gain, start);
    // Fast decay: the transient half of the hit feel.
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  start(): void {
    if (!this.ready) return;
    this.tone({ type: 'triangle', from: 440, to: 660, durationMs: 140, gain: 0.18 });
  }

  /** Normal mole: 620 Hz square, 90 ms decay (PRD §4.6). */
  hit(combo = 0): void {
    if (!this.ready) return;
    const lift = Math.min(combo, 10) * 12;
    this.tone({ type: 'square', from: 620 + lift, to: 560 + lift, durationMs: 90, gain: 0.22 });
  }

  /** Golden mole: rising three-note arpeggio 660 / 880 / 1100 Hz (PRD §4.6). */
  golden(): void {
    if (!this.ready) return;
    [660, 880, 1100].forEach((frequency, index) => {
      this.tone({
        type: 'triangle',
        from: frequency,
        durationMs: 110,
        gain: 0.2,
        delayMs: index * 55,
      });
    });
  }

  /** Bomb: sawtooth fall 220 → 60 Hz over 180 ms, 3 dB quieter than a hit. */
  bomb(): void {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', from: 220, to: 60, durationMs: 180, gain: 0.155 });
  }

  /** Empty swing: a dry, quiet tick — audible, never punitive (R2). */
  empty(): void {
    if (!this.ready) return;
    this.tone({ type: 'triangle', from: 180, to: 140, durationMs: 55, gain: 0.07 });
  }

  escape(): void {
    if (!this.ready) return;
    this.tone({ type: 'sine', from: 320, to: 240, durationMs: 120, gain: 0.09 });
  }

  levelUp(): void {
    if (!this.ready) return;
    this.tone({ type: 'triangle', from: 520, to: 780, durationMs: 160, gain: 0.14 });
  }

  goal(): void {
    if (!this.ready) return;
    [720, 900, 1180].forEach((frequency, index) => {
      this.tone({
        type: 'sine',
        from: frequency,
        durationMs: 150,
        gain: 0.16,
        delayMs: index * 70,
      });
    });
  }

  gameOver(): void {
    if (!this.ready) return;
    this.tone({ type: 'triangle', from: 420, to: 220, durationMs: 320, gain: 0.15 });
  }
}
