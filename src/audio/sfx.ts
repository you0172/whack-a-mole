type Waveform = OscillatorType;

interface BlipOptions {
  readonly frequency: number;
  readonly duration: number;
  readonly waveform?: Waveform;
  readonly gain?: number;
  readonly delay?: number;
  /** Glide the pitch to this frequency by the end of the blip. */
  readonly slideTo?: number;
}

/**
 * Tiny Web Audio synthesiser. Every sound is generated at runtime, so the game
 * ships zero audio assets and works offline.
 *
 * The AudioContext is created lazily on the first user gesture (`unlock()`)
 * because browsers block autoplay before interaction.
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user gesture (click / keydown). Safe to call twice. */
  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.context.destination);
    } catch {
      this.context = null;
      this.master = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.context.currentTime, 0.02);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  hit(combo: number): void {
    const lift = Math.min(combo, 20) * 18;
    this.blip({ frequency: 440 + lift, duration: 0.09, waveform: 'square', gain: 0.16 });
    this.blip({
      frequency: 880 + lift,
      duration: 0.06,
      waveform: 'triangle',
      gain: 0.08,
      delay: 0.03,
    });
  }

  golden(): void {
    const notes = [660, 880, 1100, 1320];
    notes.forEach((frequency, index) => {
      this.blip({
        frequency,
        duration: 0.11,
        waveform: 'triangle',
        gain: 0.14,
        delay: index * 0.055,
      });
    });
  }

  bomb(): void {
    this.blip({ frequency: 180, duration: 0.28, waveform: 'sawtooth', gain: 0.2, slideTo: 55 });
    this.blip({ frequency: 90, duration: 0.3, waveform: 'square', gain: 0.12, slideTo: 40 });
  }

  escape(): void {
    this.blip({ frequency: 220, duration: 0.12, waveform: 'sine', gain: 0.09, slideTo: 140 });
  }

  levelUp(): void {
    [523, 659, 784, 1046].forEach((frequency, index) => {
      this.blip({
        frequency,
        duration: 0.12,
        waveform: 'triangle',
        gain: 0.12,
        delay: index * 0.07,
      });
    });
  }

  start(): void {
    [392, 523, 659].forEach((frequency, index) => {
      this.blip({
        frequency,
        duration: 0.1,
        waveform: 'square',
        gain: 0.12,
        delay: index * 0.06,
      });
    });
  }

  gameOver(): void {
    [523, 440, 349, 262].forEach((frequency, index) => {
      this.blip({
        frequency,
        duration: 0.18,
        waveform: 'triangle',
        gain: 0.14,
        delay: index * 0.12,
      });
    });
  }

  private blip(options: BlipOptions): void {
    const { context, master } = this;
    if (!context || !master || this.muted) return;

    const start = context.currentTime + (options.delay ?? 0);
    const duration = Math.max(0.02, options.duration);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const peak = options.gain ?? 0.12;

    oscillator.type = options.waveform ?? 'sine';
    oscillator.frequency.setValueAtTime(options.frequency, start);
    if (options.slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.slideTo),
        start + duration,
      );
    }

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      envelope.disconnect();
    });
  }
}
