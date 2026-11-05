/**
 * Warstwa dzwiekowa.
 *
 * Jesli pliki audio zostaly dostarczone - odtwarza je. W przeciwnym razie
 * generuje efekty proceduralnie przez WebAudio, wiec gra nie jest cicha
 * nawet bez assetow.
 */

import { assetUrl } from './url';

export type SfxName = 'light' | 'heavy' | 'special' | 'block' | 'hit' | 'ko' | 'jump' | 'ui';

/** Domyslne pliki audio - podmien na wlasne w public/assets/audio. */
export const SFX_FILES: Record<SfxName, string> = {
  light: assetUrl('assets/audio/light.mp3'),
  heavy: assetUrl('assets/audio/heavy.mp3'),
  special: assetUrl('assets/audio/special.mp3'),
  block: assetUrl('assets/audio/block.mp3'),
  hit: assetUrl('assets/audio/hit.mp3'),
  ko: assetUrl('assets/audio/ko.mp3'),
  jump: assetUrl('assets/audio/jump.mp3'),
  ui: assetUrl('assets/audio/ui.mp3'),
};

/** Podklad muzyczny walki - leci od slowa "FIGHT!" do powrotu do wyboru postaci. */
export const MUSIC_FILE = assetUrl('assets/audio/soundtrack.mp3');

export class AudioManager {
  readonly ctx: AudioContext;
  private master: GainNode;
  private sfxGain: GainNode;
  private musicGain: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private muted = false;
  /** Czy muzyka ma grac - pozwala wznowic ja po odciszeniu w trakcie walki. */
  private musicWanted = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
  }

  setBuffers(buffers: Map<string, AudioBuffer>): void {
    this.buffers = buffers;
    this.musicBuffer = buffers.get(MUSIC_FILE) ?? null;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.master.gain.value = muted ? 0 : 0.9;
    // wyciszenie zatrzymuje podklad, ale nie kasuje zyczenia jego gry -
    // dzieki temu odciszenie w trakcie walki wznowi muzyke
    if (muted) this.haltMusic();
    else if (this.musicWanted) this.startMusic();
  }

  /**
   * Przegladarki wymagaja gestu uzytkownika przed startem audio.
   *
   * Bez gestu `resume()` potrafi NIGDY sie nie rozwiazac (a nie odrzucic),
   * co zawiesiloby gre na ekranie wczytywania. Dlatego czekamy na nie
   * z ograniczeniem czasowym - brak dzwieku nie moze blokowac rozgrywki.
   */
  async resume(timeoutMs = 400): Promise<void> {
    if (this.ctx.state !== 'suspended') return;
    try {
      await Promise.race([
        this.ctx.resume(),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      /* ignorowane - audio pozostanie wstrzymane */
    }
  }

  play(name: SfxName, volume = 1): void {
    if (this.muted) return;
    const buffer = this.buffers.get(SFX_FILES[name]);
    if (buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(this.sfxGain);
      src.start();
      return;
    }
    this.playProcedural(name, volume);
  }

  /** Uruchamia podklad muzyczny (od slowa "FIGHT!" do konca walki). */
  startMusic(): void {
    this.musicWanted = true;
    if (!this.musicBuffer || this.musicSource || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
  }

  /** Zatrzymuje podklad - wyjscie z walki, koniec meczu. */
  stopMusic(): void {
    this.musicWanted = false;
    this.haltMusic();
  }

  /** Zatrzymuje odtwarzanie, nie zmieniajac tego, czy muzyka ma grac. */
  private haltMusic(): void {
    if (!this.musicSource) return;
    try {
      this.musicSource.stop();
    } catch {
      /* juz zatrzymane */
    }
    this.musicSource.disconnect();
    this.musicSource = null;
  }

  /** Krotki, syntezowany efekt dzwiekowy. */
  private playProcedural(name: SfxName, volume: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(this.sfxGain);

    const osc = ctx.createOscillator();
    osc.connect(gain);

    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();

    const shape = (
      type: OscillatorType,
      f0: number,
      f1: number,
      dur: number,
      peak: number,
      decay: number,
    ): void => {
      osc.type = type;
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak * volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    };

    const burst = (dur: number, peak: number, cutoff: number): void => {
      const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const data = ctx.createBuffer(1, length, ctx.sampleRate);
      const channel = data.getChannelData(0);
      for (let i = 0; i < length; i++) {
        channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      noise.buffer = data;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noiseGain.gain.setValueAtTime(peak * volume, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      noise.start(now);
      noise.stop(now + dur + 0.02);
    };

    switch (name) {
      case 'light':
        shape('square', 620, 240, 0.1, 0.22, 0.09);
        break;
      case 'heavy':
        shape('sawtooth', 260, 70, 0.22, 0.3, 0.2);
        burst(0.12, 0.18, 1200);
        break;
      case 'special':
        shape('triangle', 180, 900, 0.34, 0.24, 0.32);
        break;
      case 'block':
        shape('square', 900, 420, 0.09, 0.2, 0.08);
        burst(0.07, 0.14, 3200);
        break;
      case 'hit':
        shape('square', 380, 120, 0.14, 0.26, 0.13);
        burst(0.1, 0.2, 900);
        break;
      case 'ko':
        shape('sawtooth', 420, 60, 0.7, 0.34, 0.65);
        break;
      case 'jump':
        shape('triangle', 300, 760, 0.14, 0.18, 0.13);
        break;
      case 'ui':
        shape('square', 760, 980, 0.06, 0.16, 0.05);
        break;
      default:
        break;
    }
  }
}
