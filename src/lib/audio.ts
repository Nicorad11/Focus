// Ambient sound, generated with the Web Audio API so there are no recordings to license.
// Each sound is filtered noise shaped by slow oscillators; it loops forever without a seam,
// and switching sounds crossfades.

import type { SoundId } from './types';

export const SOUNDS: { id: SoundId; name: string }[] = [
  { id: 'swell', name: 'Swell & rigging' },
  { id: 'rain', name: 'Rain on deck' },
  { id: 'wind', name: 'Wind in the shrouds' },
  { id: 'off', name: 'Quiet' },
];

interface Voice {
  out: GainNode;
  stop: () => void;
}

class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: Voice | null = null;
  private voiceId: SoundId = 'off';
  private volume = 0.6;
  private noise: { white: AudioBuffer; brown: AudioBuffer } | null = null;
  private wantPlaying = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.curve(this.volume);
    this.master.connect(this.ctx.destination);
    this.noise = { white: this.makeNoise('white'), brown: this.makeNoise('brown') };
    if (this.ctx.state === 'suspended') {
      const resume = () => {
        void this.ctx?.resume();
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
      };
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
    }
    return this.ctx;
  }

  /** Whether the browser is holding audio until the next click (autoplay rules). */
  get blocked() {
    return !!this.ctx && this.ctx.state === 'suspended' && this.wantPlaying;
  }

  resume() {
    void this.ensure()?.resume();
  }

  private curve(v: number) {
    return Math.max(0, Math.min(1, v)) ** 2 * 0.9;
  }

  private makeNoise(kind: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 8;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else {
          b = (b + 0.02 * w) / 1.02;
          d[i] = b * 3.5;
        }
      }
      // blend the tail into the head so the loop has no click
      const fade = Math.floor(ctx.sampleRate * 0.25);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
      }
    }
    return buf;
  }

  private source(buf: AudioBuffer, offset = Math.random() * 6): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(ctx.currentTime, offset);
    return s;
  }

  private lfo(freq: number, depth: number, target: AudioParam): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    return o;
  }

  private build(id: SoundId): Voice | null {
    const ctx = this.ctx!;
    const n = this.noise!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master!);
    const nodes: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];

    if (id === 'swell') {
      // long swells: brown noise, lowpassed, breathing every ~8 s
      const surf = this.source(n.brown);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const surfGain = ctx.createGain();
      surfGain.gain.value = 0.55;
      surf.connect(lp).connect(surfGain).connect(out);
      nodes.push(surf, this.lfo(0.12, 0.32, surfGain.gain), this.lfo(0.047, 0.12, surfGain.gain));
      // foam on the crest
      const foam = this.source(n.white);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.5;
      const foamGain = ctx.createGain();
      foamGain.gain.value = 0.05;
      foam.connect(bp).connect(foamGain).connect(out);
      nodes.push(foam, this.lfo(0.12, 0.04, foamGain.gain));
      // rigging: the odd creak of wood and tap of a halyard
      const creak = () => {
        if (!this.ctx) return;
        const t = ctx.currentTime + 0.05;
        if (Math.random() < 0.6) {
          const s = ctx.createBufferSource();
          s.buffer = n.white;
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.Q.value = 14;
          f.frequency.setValueAtTime(260 + Math.random() * 200, t);
          f.frequency.linearRampToValueAtTime(380 + Math.random() * 260, t + 0.6);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.5, t + 0.12);
          g.gain.linearRampToValueAtTime(0.0001, t + 0.7);
          s.connect(f).connect(g).connect(out);
          s.start(t, Math.random() * 4, 0.8);
        } else {
          const o = ctx.createOscillator();
          o.frequency.value = 1900 + Math.random() * 700;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.025, t + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
          o.connect(g).connect(out);
          o.start(t);
          o.stop(t + 1);
        }
        timers.push(window.setTimeout(creak, 5000 + Math.random() * 9000));
      };
      timers.push(window.setTimeout(creak, 3000));
    } else if (id === 'rain') {
      const hiss = this.source(n.white);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6500;
      const g = ctx.createGain();
      g.gain.value = 0.32;
      hiss.connect(hp).connect(lp).connect(g).connect(out);
      const deck = this.source(n.brown);
      const dlp = ctx.createBiquadFilter();
      dlp.type = 'lowpass';
      dlp.frequency.value = 900;
      const dg = ctx.createGain();
      dg.gain.value = 0.28;
      deck.connect(dlp).connect(dg).connect(out);
      nodes.push(hiss, deck, this.lfo(0.06, 0.08, g.gain));
      // drops: a sparse click buffer
      const drops = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate);
      const d = drops.getChannelData(0);
      for (let k = 0; k < 6 * 70; k++) {
        const at = Math.floor(Math.random() * (d.length - 400));
        const amp = 0.2 + Math.random() * 0.5;
        for (let i = 0; i < 300; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / 40);
      }
      const ds = ctx.createBufferSource();
      ds.buffer = drops;
      ds.loop = true;
      const dbp = ctx.createBiquadFilter();
      dbp.type = 'bandpass';
      dbp.frequency.value = 2600;
      dbp.Q.value = 0.8;
      const dropGain = ctx.createGain();
      dropGain.gain.value = 0.35;
      ds.connect(dbp).connect(dropGain).connect(out);
      ds.start();
      nodes.push(ds);
    } else if (id === 'wind') {
      const src = this.source(n.brown);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 2.2;
      const g = ctx.createGain();
      g.gain.value = 0.9;
      src.connect(bp).connect(g).connect(out);
      const whistle = this.source(n.white);
      const wbp = ctx.createBiquadFilter();
      wbp.type = 'bandpass';
      wbp.frequency.value = 1100;
      wbp.Q.value = 9;
      const wg = ctx.createGain();
      wg.gain.value = 0.05;
      whistle.connect(wbp).connect(wg).connect(out);
      nodes.push(src, whistle, this.lfo(0.07, 260, bp.frequency), this.lfo(0.11, 0.35, g.gain), this.lfo(0.05, 300, wbp.frequency), this.lfo(0.09, 0.04, wg.gain));
    } else {
      return null;
    }
    return {
      out,
      stop: () => {
        for (const t of timers) clearTimeout(t);
        const end = ctx.currentTime + 2;
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
        out.gain.linearRampToValueAtTime(0, end);
        for (const node of nodes) {
          try {
            node.stop(end + 0.1);
          } catch {
            /* already stopped */
          }
        }
        window.setTimeout(() => out.disconnect(), 2300);
      },
    };
  }

  play(id: SoundId) {
    this.wantPlaying = id !== 'off';
    if (id === this.voiceId && this.voice) return;
    if (id === 'off') {
      this.stop();
      return;
    }
    const ctx = this.ensure();
    if (!ctx) return;
    this.voice?.stop();
    this.voice = this.build(id);
    this.voiceId = id;
    if (this.voice) {
      const g = this.voice.out.gain;
      g.setValueAtTime(0, ctx.currentTime);
      g.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    }
  }

  stop() {
    this.wantPlaying = false;
    this.voice?.stop();
    this.voice = null;
    this.voiceId = 'off';
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.curve(v), this.ctx.currentTime, 0.08);
  }

  /** Ship's bell: two strikes at cast off, two pairs on making port. */
  bell(kind: 'castoff' | 'port') {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const strikes = kind === 'castoff' ? [0, 0.42] : [0, 0.42, 1.3, 1.72];
    const f0 = 590;
    const partials = [
      [1, 1, 3.2],
      [2.0, 0.55, 2.6],
      [2.76, 0.42, 2.0],
      [3.0, 0.3, 1.7],
      [4.07, 0.22, 1.2],
      [5.4, 0.12, 0.8],
    ];
    const out = ctx.createGain();
    out.gain.value = 0.16;
    out.connect(this.master);
    for (const at of strikes) {
      const t = ctx.currentTime + 0.05 + at;
      for (const [ratio, amp, decay] of partials) {
        const o = ctx.createOscillator();
        o.frequency.value = f0 * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + decay + 0.05);
      }
    }
    window.setTimeout(() => out.disconnect(), 6000);
  }
}

export const ambience = new Ambience();
