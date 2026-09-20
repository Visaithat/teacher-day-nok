/**
 * The film's own sound: a slow drone under everything, and a chime per line
 * in the finale. The song from the music box is separate (YouTube).
 *
 * Nothing is created until the user's first gesture - browsers will not start
 * an AudioContext before one, and the gift-box click is that gesture.
 */

/** A-major drone: A2, E3, A3, C#4. Low enough to sit under speech. */
const DRONE = [110, 164.81, 220, 277.18] as const;

/** C5 E5 G5 A5 B5 - a pentatonic run, so any order of lines is consonant. */
const CHIME_NOTES = [523.25, 659.25, 783.99, 880, 987.77] as const;

const MASTER_LEVEL = 0.16;

export class FilmAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  get started(): boolean {
    return this.ctx !== null;
  }

  /** Idempotent. Safe to call from any user gesture. */
  start(): void {
    if (this.ctx) return;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      this.master = master;

      // A lowpass keeps the drone felt rather than heard - it should never
      // compete with the song that starts later.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.connect(master);

      DRONE.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 ? 'sine' : 'triangle';
        osc.frequency.value = freq;

        const gain = ctx.createGain();
        gain.gain.value = 0.09 / (i + 1);

        // Each partial breathes at its own slow rate, so the chord never
        // settles into a steady tone.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05 + i * 0.037;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.05;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        lfo.start();

        osc.connect(gain);
        gain.connect(filter);
        osc.start();
      });

      master.gain.linearRampToValueAtTime(MASTER_LEVEL, ctx.currentTime + 4);
    } catch (err) {
      console.warn('audio unavailable', err);
      this.ctx = null;
      this.master = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime + 0.4);
  }

  /**
   * One student's line arriving in the sky. Fundamental plus its octave, a
   * fast attack and a long tail, so lines that overlap ring together.
   */
  chime(index: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    try {
      const t0 = ctx.currentTime;
      const base = CHIME_NOTES[index % CHIME_NOTES.length] as number;
      for (const [k, freq] of [base, base * 2].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(k ? 0.03 : 0.07, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
        osc.connect(gain);
        gain.connect(this.master ?? ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 1.5);
      }
    } catch {
      /* audio is optional */
    }
  }

  dispose(): void {
    try {
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.master = null;
  }
}

export const filmAudio = new FilmAudio();
