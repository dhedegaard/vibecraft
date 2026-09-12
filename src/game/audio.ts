import * as THREE from 'three';
import { sunElevation } from './daycycle';
import type { Circle } from './repel';
import type { SoundCue } from './sounds';
import { NOISE_SECONDS, noiseBuffer, playRecipe } from './synth';

const MASTER_GAIN = 0.5;
const MUTE_KEY = 'vibecraft.muted';
/** Positional one-shots allowed to start per frame; a crowd of skeletons can't spike the mix. */
const MAX_POSITIONAL_PER_FRAME = 8;
const REF_DISTANCE = 2;
const MAX_DISTANCE = 40;
/** Sun elevation at which the ambient bed is fully daytime. */
const DAY_BLEND_ELEVATION = 0.2;
const AMBIENT_RAMP = 0.2;
const WIND_GAIN = 0.05;
const NIGHT_WIND_GAIN = 0.02;
const CRICKET_GAIN = 0.03;
const CHIRP_GAIN = 0.06;
const MIN_CHIRP_GAP = 3;
const MAX_CHIRP_GAP = 8;
const CRACKLE_VOICES = 4;
const CRACKLE_GAIN = 0.08;
const CRACKLE_FADE = 0.3;

// Per-frame scratch.
const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const position = new THREE.Vector3();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Private windows may refuse storage; the session still mutes.
  }
}

interface CrackleVoice {
  panner: PannerNode;
  gain: GainNode;
  /** The torch circle this voice follows, by reference; undefined while free. */
  torch: Circle | undefined;
  nextPop: number;
  /** A freed voice must finish its fade-out before it can be reclaimed by a new torch. */
  fadingUntil: number;
}

/**
 * The game's audio output: an `AudioContext` created on the first user gesture
 * (browsers refuse to start audio before one), a master gain that mute drives
 * to zero, positional one-shots, and the ambient and torch loops. Never
 * reports `animating`; loops run on the audio thread while the renderer idles.
 */
export class Audio {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private isMuted = readMuted();
  private positionalThisFrame = 0;
  private day: GainNode | undefined;
  private night: GainNode | undefined;
  private wind: GainNode | undefined;
  private crickets: GainNode | undefined;
  private dayBlend = -1;
  private nextChirp = 0;
  private nextWindChange = 0;
  private nextCricketBurst = 0;
  private readonly crackle: CrackleVoice[] = [];

  constructor() {
    const start = (): void => {
      this.ensureContext();
    };
    window.addEventListener('keydown', start);
    window.addEventListener('pointerdown', start);
  }

  get muted(): boolean {
    return this.isMuted;
  }

  /** Flips mute, persists it, and returns the new state. */
  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    writeMuted(this.isMuted);
    this.applyMute();
    return this.isMuted;
  }

  /** Starts one sound now; positioned cues pan and attenuate relative to the camera. */
  play(cue: SoundCue): void {
    if (!this.ctx || !this.master) return;
    if (cue.at) {
      if (this.positionalThisFrame >= MAX_POSITIONAL_PER_FRAME) return;
      this.positionalThisFrame++;
    }
    const panner = cue.at ? this.panner(cue.at) : undefined;
    const duration = playRecipe(cue.kind, this.ctx, panner ?? this.master, cue.variation ?? Math.random());
    if (panner) setTimeout(() => panner.disconnect(), (duration + 0.1) * 1000);
    // The frame loop stops on death, so the fade must be scheduled, not stepped.
    if (cue.kind === 'death') ramp(this.master.gain, 0, this.ctx.currentTime, duration);
  }

  /** Syncs the listener with the camera and drives the loops. Call once per frame after the camera moves. */
  update(camera: THREE.Camera, phase: number, torches: readonly Circle[]): void {
    this.positionalThisFrame = 0;
    if (!this.ctx) return;
    // A backgrounded tab can suspend the context; a non-gesture resume may be refused, so swallow that.
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    this.syncListener(camera);
    this.updateAmbient(phase);
    this.updateCrackle(torches);
  }

  private ensureContext(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.isMuted ? 0 : MASTER_GAIN;
    this.master.connect(this.ctx.destination);
    this.buildLoops(this.ctx, this.master);
  }

  private buildLoops(ctx: AudioContext, master: GainNode): void {
    this.day = ctx.createGain();
    this.night = ctx.createGain();
    this.day.gain.value = 0;
    this.night.gain.value = 0;
    this.day.connect(master);
    this.night.connect(master);

    // Wind: looping noise through a low lowpass, gain wobbled from `update`. Feeds both beds.
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer(ctx);
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;
    this.wind = ctx.createGain();
    this.wind.gain.value = WIND_GAIN;
    const nightWind = ctx.createGain();
    nightWind.gain.value = NIGHT_WIND_GAIN / WIND_GAIN;
    windSrc.connect(windFilter).connect(this.wind);
    this.wind.connect(this.day);
    this.wind.connect(nightWind).connect(this.night);
    windSrc.start();

    // Crickets: a 4 kHz sine chopped at ~40 Hz, gated in bursts from `update`.
    const cricket = ctx.createOscillator();
    cricket.frequency.value = 4000;
    const chop = ctx.createOscillator();
    chop.frequency.value = 40;
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 0.5;
    const chopped = ctx.createGain();
    chopped.gain.value = 0.5;
    chop.connect(chopDepth).connect(chopped.gain);
    this.crickets = ctx.createGain();
    this.crickets.gain.value = 0;
    cricket.connect(chopped).connect(this.crickets).connect(this.night);
    cricket.start();
    chop.start();

    for (let i = 0; i < CRACKLE_VOICES; i++) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2500;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = this.panner(new THREE.Vector3());
      src.connect(filter).connect(gain).connect(panner);
      src.start(0, (i / CRACKLE_VOICES) * NOISE_SECONDS);
      this.crackle.push({ panner, gain, torch: undefined, nextPop: 0, fadingUntil: 0 });
    }
  }

  private updateAmbient(phase: number): void {
    if (!this.ctx || !this.day || !this.night || !this.wind || !this.crickets) return;
    const now = this.ctx.currentTime;
    const blend = THREE.MathUtils.clamp(sunElevation(phase) / DAY_BLEND_ELEVATION, 0, 1);
    if (blend !== this.dayBlend) {
      this.dayBlend = blend;
      ramp(this.day.gain, blend, now, AMBIENT_RAMP);
      ramp(this.night.gain, 1 - blend, now, AMBIENT_RAMP);
    }
    if (now >= this.nextWindChange) {
      ramp(this.wind.gain, WIND_GAIN * (0.5 + Math.random()), now, 2);
      this.nextWindChange = now + 2 + Math.random() * 3;
    }
    if (blend > 0 && now >= this.nextChirp) {
      this.chirp(now);
      this.nextChirp = now + MIN_CHIRP_GAP + Math.random() * (MAX_CHIRP_GAP - MIN_CHIRP_GAP);
    }
    if (blend < 1 && now >= this.nextCricketBurst) {
      // 0.3 s burst, then a pause.
      this.crickets.gain.setValueAtTime(0, now);
      this.crickets.gain.linearRampToValueAtTime(CRICKET_GAIN, now + 0.05);
      this.crickets.gain.setValueAtTime(CRICKET_GAIN, now + 0.25);
      this.crickets.gain.linearRampToValueAtTime(0, now + 0.3);
      this.nextCricketBurst = now + 0.3 + Math.random() * 0.8;
    }
  }

  /** Two-note bird chirp at a random horizontal position around the listener. */
  private chirp(now: number): void {
    if (!this.ctx || !this.day) return;
    const angle = Math.random() * Math.PI * 2;
    const at = position.clone().add(new THREE.Vector3(Math.sin(angle) * 15, 6, Math.cos(angle) * 15));
    const panner = this.panner(at);
    panner.disconnect();
    panner.connect(this.day);
    const base = 1800 + Math.random() * 800;
    for (const [offset, freq] of [
      [0, base],
      [0.09, base * 1.25],
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.15, now + offset + 0.07);
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, now + offset);
      env.gain.linearRampToValueAtTime(CHIRP_GAIN, now + offset + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);
      osc.connect(env).connect(panner);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
      osc.addEventListener('ended', () => {
        osc.disconnect();
        env.disconnect();
      });
    }
    setTimeout(() => panner.disconnect(), 400);
  }

  /** Assigns the crackle voices to the nearest torches, fading voices whose torch left the set. */
  private updateCrackle(torches: readonly Circle[]): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (torches.length === 0 && this.crackle.every((v) => v.torch === undefined)) return;
    const nearest = torches
      .toSorted((a, b) => a.position.distanceToSquared(position) - b.position.distanceToSquared(position))
      .slice(0, CRACKLE_VOICES);

    for (const voice of this.crackle) {
      if (voice.torch && !nearest.includes(voice.torch)) {
        ramp(voice.gain.gain, 0, now, CRACKLE_FADE);
        voice.torch = undefined;
        voice.fadingUntil = now + CRACKLE_FADE;
      }
    }
    for (const torch of nearest) {
      if (this.crackle.some((v) => v.torch === torch)) continue;
      const free = this.crackle.find((v) => v.torch === undefined && now >= v.fadingUntil);
      if (!free) break;
      free.torch = torch;
      setParam(free.panner.positionX, torch.position.x, this.ctx);
      setParam(free.panner.positionY, 1.2, this.ctx);
      setParam(free.panner.positionZ, torch.position.z, this.ctx);
      ramp(free.gain.gain, CRACKLE_GAIN * 0.3, now, CRACKLE_FADE);
      free.nextPop = now + CRACKLE_FADE;
    }
    for (const voice of this.crackle) {
      if (!voice.torch || now < voice.nextPop) continue;
      // A pop: brief jump in level, back to the simmer.
      const length = 0.02 + Math.random() * 0.03;
      voice.gain.gain.setValueAtTime(CRACKLE_GAIN, now);
      voice.gain.gain.setValueAtTime(CRACKLE_GAIN * 0.3, now + length);
      voice.nextPop = now + length + 0.05 + Math.random() * 0.4;
    }
  }

  private applyMute(): void {
    if (!this.ctx || !this.master) return;
    const target = this.isMuted ? 0 : MASTER_GAIN;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.05);
  }

  private panner(at: THREE.Vector3): PannerNode {
    if (!this.ctx || !this.master) throw new Error('audio context missing');
    const panner = this.ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = REF_DISTANCE;
    panner.maxDistance = MAX_DISTANCE;
    panner.rolloffFactor = 1;
    setParam(panner.positionX, at.x, this.ctx);
    setParam(panner.positionY, at.y, this.ctx);
    setParam(panner.positionZ, at.z, this.ctx);
    panner.connect(this.master);
    return panner;
  }

  private syncListener(camera: THREE.Camera): void {
    if (!this.ctx) return;
    const { listener } = this.ctx;
    camera.getWorldPosition(position);
    camera.getWorldDirection(forward);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    // Safari lacks the AudioParam form of the listener; fall back to the legacy setters.
    const params: { positionX?: AudioParam } = listener;
    if (params.positionX) {
      setParam(listener.positionX, position.x, this.ctx);
      setParam(listener.positionY, position.y, this.ctx);
      setParam(listener.positionZ, position.z, this.ctx);
      setParam(listener.forwardX, forward.x, this.ctx);
      setParam(listener.forwardY, forward.y, this.ctx);
      setParam(listener.forwardZ, forward.z, this.ctx);
      setParam(listener.upX, up.x, this.ctx);
      setParam(listener.upY, up.y, this.ctx);
      setParam(listener.upZ, up.z, this.ctx);
    } else {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }
}

/** Sets an AudioParam immediately; `setValueAtTime` avoids the deprecated `.value` glitch warnings. */
function setParam(param: AudioParam, value: number, ctx: AudioContext): void {
  param.setValueAtTime(value, ctx.currentTime);
}

/** Ramps `param` linearly to `target` over `seconds` from `now`, dropping any pending automation. */
function ramp(param: AudioParam, target: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + seconds);
}
