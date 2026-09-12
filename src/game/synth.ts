import type { SoundKind } from './sounds';

/** Seconds of white noise cached per context; every noise burst is a slice of it. */
const NOISE_SECONDS = 1;
const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

/** White noise, generated once per context. */
export function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (buffer) return buffer;
  buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buffer);
  return buffer;
}

/** Linear attack to `peak`, exponential decay to silence by `end`. All times absolute. */
function envelope(ctx: AudioContext, start: number, attack: number, end: number, peak: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  gain.gain.setValueAtTime(0, end);
  return gain;
}

/** Stops `source` at `end` and tears the chain down when it finishes. */
function schedule(source: AudioScheduledSourceNode, end: number, ...chain: AudioNode[]): void {
  source.stop(end);
  source.addEventListener('ended', () => {
    source.disconnect();
    for (const node of chain) node.disconnect();
  });
}

interface Tone {
  type: OscillatorType;
  from: number;
  to?: number;
  attack?: number;
  peak: number;
}

/** Oscillator with a pitch sweep and an envelope, connected to `out`. */
function tone(ctx: AudioContext, out: AudioNode, start: number, duration: number, t: Tone): void {
  const osc = ctx.createOscillator();
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.from, start);
  if (t.to !== undefined) osc.frequency.exponentialRampToValueAtTime(t.to, start + duration);
  const env = envelope(ctx, start, t.attack ?? 0.005, start + duration, t.peak);
  osc.connect(env).connect(out);
  osc.start(start);
  schedule(osc, start + duration, env);
}

interface Burst {
  filter: BiquadFilterType;
  frequency: number;
  frequencyTo?: number;
  q?: number;
  attack?: number;
  peak: number;
}

/** Filtered noise with an envelope, connected to `out`. */
function burst(ctx: AudioContext, out: AudioNode, start: number, duration: number, b: Burst): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const offset = Math.random() * (NOISE_SECONDS - duration);
  const filter = ctx.createBiquadFilter();
  filter.type = b.filter;
  filter.Q.value = b.q ?? 1;
  filter.frequency.setValueAtTime(b.frequency, start);
  if (b.frequencyTo !== undefined) filter.frequency.exponentialRampToValueAtTime(b.frequencyTo, start + duration);
  const env = envelope(ctx, start, b.attack ?? 0.003, start + duration, b.peak);
  src.connect(filter).connect(env).connect(out);
  src.start(start, offset);
  schedule(src, start + duration, filter, env);
}

/** A few short highpassed clicks spread over `duration`: bones knocking. */
function rattle(ctx: AudioContext, out: AudioNode, start: number, duration: number, count: number, peak: number): void {
  for (let i = 0; i < count; i++) {
    const at = start + (duration * (i + Math.random() * 0.6)) / count;
    burst(ctx, out, at, 0.025, { filter: 'highpass', frequency: 1800 + Math.random() * 800, peak });
  }
}

/** `base` scaled by ±`spread` fraction according to `variation` in [0, 1). */
function vary(base: number, spread: number, variation: number): number {
  return base * (1 + (variation - 0.5) * 2 * spread);
}

/**
 * Builds and starts the node graph for `kind` into `destination`, returning
 * how long it plays. `variation` in [0, 1) nudges pitch/level; `treeFall`
 * reads it as the tree's scale instead.
 */
export function playRecipe(kind: SoundKind, ctx: AudioContext, destination: AudioNode, variation: number): number {
  const now = ctx.currentTime;
  switch (kind) {
    case 'footstep':
      burst(ctx, destination, now, 0.06, { filter: 'bandpass', frequency: vary(300, 0.3, variation), q: 0.8, peak: 0.25 });
      return 0.06;
    case 'skeletonStep':
      burst(ctx, destination, now, 0.03, { filter: 'highpass', frequency: 2000, peak: 0.35 });
      burst(ctx, destination, now + 0.045, 0.03, { filter: 'highpass', frequency: 2400, peak: 0.25 });
      tone(ctx, destination, now, 0.04, { type: 'sine', from: vary(1200, 0.2, variation), peak: 0.08 });
      return 0.08;
    case 'jump':
      tone(ctx, destination, now, 0.12, { type: 'sine', from: 300, to: 600, attack: 0.01, peak: 0.25 });
      return 0.12;
    case 'land':
      burst(ctx, destination, now, 0.08, { filter: 'lowpass', frequency: 400, peak: 0.4 });
      return 0.08;
    case 'axeSwing':
      burst(ctx, destination, now, 0.15, { filter: 'bandpass', frequency: 400, frequencyTo: 1200, q: 1.5, attack: 0.05, peak: 0.3 });
      return 0.15;
    case 'skeletonSwing':
      burst(ctx, destination, now, 0.11, { filter: 'bandpass', frequency: 700, frequencyTo: 1800, q: 1.5, attack: 0.03, peak: 0.3 });
      return 0.11;
    case 'chop':
      burst(ctx, destination, now, 0.04, { filter: 'lowpass', frequency: 1200, peak: 0.6 });
      tone(ctx, destination, now, 0.08, { type: 'sine', from: vary(120, 0.15, variation), to: 80, peak: 0.5 });
      return 0.08;
    case 'arrowHit':
      burst(ctx, destination, now, 0.03, { filter: 'lowpass', frequency: 2000, peak: 0.5 });
      tone(ctx, destination, now, 0.06, { type: 'sine', from: vary(220, 0.15, variation), to: 150, peak: 0.4 });
      return 0.06;
    case 'arrowMiss':
      burst(ctx, destination, now, 0.06, { filter: 'lowpass', frequency: 500, peak: 0.3 });
      return 0.06;
    case 'treeCreak': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 7;
      const depth = ctx.createGain();
      depth.gain.value = 6;
      vibrato.connect(depth).connect(osc.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const env = envelope(ctx, now, 0.08, now + 0.6, 0.25);
      osc.connect(filter).connect(env).connect(destination);
      osc.start(now);
      vibrato.start(now);
      vibrato.stop(now + 0.6);
      schedule(osc, now + 0.6, filter, env, vibrato, depth);
      return 0.6;
    }
    case 'treeFall': {
      // `variation` is the tree scale (~0.7–1.4): bigger trees thump lower and louder.
      const scale = Math.max(variation, 0.5);
      burst(ctx, destination, now, 0.2, { filter: 'lowpass', frequency: 300, peak: 0.5 * scale });
      tone(ctx, destination, now, 0.25, { type: 'sine', from: 60 / scale, to: 35 / scale, attack: 0.01, peak: 0.6 * scale });
      return 0.25;
    }
    case 'bowDraw':
      burst(ctx, destination, now, 0.4, { filter: 'bandpass', frequency: 300, frequencyTo: 900, q: 4, attack: 0.15, peak: 0.12 });
      return 0.4;
    case 'bowFire':
      burst(ctx, destination, now, 0.01, { filter: 'highpass', frequency: 1000, peak: 0.5 });
      tone(ctx, destination, now, 0.08, { type: 'triangle', from: 800, to: 200, peak: 0.35 });
      return 0.08;
    case 'pickup':
      tone(ctx, destination, now, 0.05, { type: 'sine', from: 660, peak: 0.2 });
      tone(ctx, destination, now + 0.05, 0.06, { type: 'sine', from: 880, peak: 0.2 });
      return 0.11;
    case 'craft':
      tone(ctx, destination, now, 0.06, { type: 'sine', from: 523, peak: 0.2 });
      tone(ctx, destination, now + 0.07, 0.06, { type: 'sine', from: 659, peak: 0.2 });
      tone(ctx, destination, now + 0.14, 0.1, { type: 'sine', from: 784, peak: 0.2 });
      return 0.24;
    case 'weaponSwitch':
      burst(ctx, destination, now, 0.02, { filter: 'highpass', frequency: 3000, peak: 0.3 });
      return 0.02;
    case 'torchPlace':
      burst(ctx, destination, now, 0.12, { filter: 'bandpass', frequency: 300, frequencyTo: 900, q: 1.5, attack: 0.04, peak: 0.25 });
      rattle(ctx, destination, now + 0.1, 0.2, 6, 0.15);
      return 0.3;
    case 'skeletonHurt':
      rattle(ctx, destination, now, 0.15, 3, 0.4);
      burst(ctx, destination, now, 0.05, { filter: 'lowpass', frequency: 1500, peak: 0.3 });
      return 0.15;
    case 'skeletonCollapse':
      rattle(ctx, destination, now, 0.5, 8, 0.3);
      burst(ctx, destination, now + 0.45, 0.12, { filter: 'lowpass', frequency: 350, peak: 0.45 });
      return 0.57;
    case 'playerHurt':
      tone(ctx, destination, now, 0.15, { type: 'square', from: 220, to: 110, peak: 0.18 });
      return 0.15;
    case 'death':
      tone(ctx, destination, now, 1.5, { type: 'sine', from: 440, to: 55, attack: 0.02, peak: 0.35 });
      return 1.5;
    default: {
      const unreachable: never = kind;
      throw new Error(`unknown sound ${String(unreachable)}`);
    }
  }
}
