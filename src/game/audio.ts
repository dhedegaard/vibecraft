import * as THREE from 'three';
import type { Circle } from './repel';
import type { SoundCue } from './sounds';
import { playRecipe } from './synth';

const MASTER_GAIN = 0.5;
const MUTE_KEY = 'vibecraft.muted';
/** Positional one-shots allowed to start per frame; a crowd of skeletons can't spike the mix. */
const MAX_POSITIONAL_PER_FRAME = 8;
const REF_DISTANCE = 2;
const MAX_DISTANCE = 40;

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
    let destination: AudioNode = this.master;
    if (cue.at) {
      if (this.positionalThisFrame >= MAX_POSITIONAL_PER_FRAME) return;
      this.positionalThisFrame++;
      destination = this.panner(cue.at);
    }
    const duration = playRecipe(cue.kind, this.ctx, destination, cue.variation ?? Math.random());
    if (destination !== this.master) {
      const panner = destination;
      setTimeout(() => panner.disconnect(), (duration + 0.1) * 1000);
    }
    // The frame loop stops on death, so the fade must be scheduled, not stepped.
    if (cue.kind === 'death') {
      this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
    }
  }

  /** Syncs the listener with the camera and drives the loops. Call once per frame after the camera moves. */
  update(dt: number, camera: THREE.Camera, phase: number, torches: readonly Circle[]): void {
    this.positionalThisFrame = 0;
    if (!this.ctx) return;
    this.syncListener(camera);
    void dt;
    void phase;
    void torches;
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
