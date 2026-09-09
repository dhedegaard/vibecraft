import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Bow } from './bow';
import type { WeaponAction } from './weapons';

const DT = 1 / 60;

/** Draws for `seconds`, releases, then runs the bow until idle. Throws if it fires more than once. */
function shoot(bow: Bow, seconds: number): { fired: WeaponAction | undefined; stepsAfterRelease: number } {
  bow.swing();
  for (let t = 0; t < seconds; t += DT) bow.update(DT);
  bow.release();
  let fired: WeaponAction | undefined;
  let stepsAfterRelease = 0;
  while (bow.swinging && stepsAfterRelease < 1000) {
    const action = bow.update(DT);
    if (action?.kind === 'fire') {
      if (fired) throw new Error('fired twice');
      fired = action;
    }
    stepsAfterRelease++;
  }
  return { fired, stepsAfterRelease };
}

describe('Bow', () => {
  it('drives the off hand: forward with the raise, back as the string is drawn, free again after the shot', () => {
    const bow = new Bow();
    expect(bow.offHandAngle).toBeUndefined();

    bow.swing();
    let previous = bow.offHandAngle;
    if (previous === undefined) throw new Error('off hand should be posed while drawing');
    // Negative shoulder angles are in front: the free arm reaches forward with the bow
    // through the first half of the raise (the pull starts to win as the raise eases out).
    for (let t = 0; t < 0.1; t += DT) {
      bow.update(DT);
      const angle = bow.offHandAngle;
      if (angle === undefined) throw new Error('off hand should be posed while drawing');
      expect(angle).toBeLessThan(previous);
      previous = angle;
    }
    for (let t = 0; t < 0.1; t += DT) bow.update(DT);
    previous = bow.offHandAngle ?? Number.NaN;
    const reached = previous;
    for (let t = 0; t < 0.8; t += DT) {
      bow.update(DT);
      const angle = bow.offHandAngle;
      if (angle === undefined) throw new Error('off hand should be posed while drawing');
      // Pulling the string swings the hand back toward the archer.
      expect(angle).toBeGreaterThanOrEqual(previous);
      previous = angle;
    }
    expect(previous).toBeGreaterThan(reached);
    expect(previous).toBeLessThan(0);

    bow.release();
    while (bow.swinging) {
      const before = bow.offHandAngle;
      bow.update(DT);
      const after = bow.offHandAngle;
      if (before === undefined) throw new Error('off hand should be posed while recovering');
      // No snap: the free arm eases down to rest.
      if (after !== undefined) expect(Math.abs(after - before)).toBeLessThan(0.3);
    }
    expect(bow.offHandAngle).toBeUndefined();
  });

  it('starts idle and unlocked, needs arrows, and does nothing until drawn', () => {
    const bow = new Bow();
    expect(bow.swinging).toBe(false);
    expect(bow.armLocked).toBe(false);
    expect(bow.ammo).toBe('arrow');
    expect(bow.draw).toBe(0);
    expect(bow.update(DT)).toBeUndefined();
  });

  it('raises the arm forward while drawing and locks it', () => {
    const bow = new Bow();
    const rest = bow.angle;
    bow.swing();
    expect(bow.swinging).toBe(true);
    expect(bow.armLocked).toBe(true);
    let previous = rest;
    for (let i = 0; i < 10; i++) {
      expect(bow.update(DT)).toBeUndefined();
      // Negative shoulder angles are in front; the arm keeps rising each step.
      expect(bow.angle).toBeLessThan(previous);
      previous = bow.angle;
    }
    expect(bow.angle).toBeLessThan(0);
  });

  it('draw grows with hold time and clamps at full draw', () => {
    const bow = new Bow();
    bow.swing();
    for (let t = 0; t < 0.4; t += DT) bow.update(DT);
    const half = bow.draw;
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
    for (let t = 0; t < 2; t += DT) bow.update(DT);
    expect(bow.draw).toBe(1);
  });

  it('fires once on release, faster after a longer draw', () => {
    const quick = shoot(new Bow(), 0).fired;
    const full = shoot(new Bow(), 1).fired;
    if (quick?.kind !== 'fire' || full?.kind !== 'fire') throw new Error('expected shots');
    expect(quick.origin).toBeInstanceOf(THREE.Vector3);
    expect(full.speed).toBeGreaterThan(quick.speed);
  });

  it('spawns the arrow at the string in world space', () => {
    const bow = new Bow();
    const hand = new THREE.Object3D();
    hand.position.set(10, 2, -5);
    hand.add(bow.model);
    const { fired } = shoot(bow, 0.5);
    if (fired?.kind !== 'fire') throw new Error('expected a shot');
    expect(fired.origin.distanceTo(hand.position)).toBeLessThan(1);
  });

  it('recovers to rest after a shot and can then draw again', () => {
    const bow = new Bow();
    const rest = bow.angle;
    const { stepsAfterRelease } = shoot(bow, 0.5);
    expect(bow.swinging).toBe(false);
    expect(bow.armLocked).toBe(false);
    expect(bow.angle).toBe(rest);
    // 0.25 s at 60 fps, allowing one extra step for float accumulation.
    expect(stepsAfterRelease).toBeGreaterThanOrEqual(15);
    expect(stepsAfterRelease).toBeLessThanOrEqual(16);
    expect(shoot(bow, 0).fired?.kind).toBe('fire');
  });

  it('ignores release while idle and swing while recovering', () => {
    const bow = new Bow();
    bow.release();
    expect(bow.swinging).toBe(false);
    expect(bow.update(DT)).toBeUndefined();

    // A click during the raise: release freezes the draw, but the shot only
    // leaves once the arm reaches aim, so it lands on a later update call.
    bow.swing();
    bow.update(DT);
    bow.release();
    let fired = false;
    for (let i = 0; i < 1000 && !fired; i++) {
      if (bow.update(DT)?.kind === 'fire') fired = true;
    }
    if (!fired) throw new Error('bow never fired');

    // Still recovering at this point, so swing() is a no-op.
    bow.swing();
    let shots = 0;
    while (bow.swinging) {
      if (bow.update(DT)?.kind === 'fire') shots++;
    }
    expect(shots).toBe(0);
    expect(bow.draw).toBe(0);
  });

  it('a release during the raise fires when the arm reaches aim without snapping', () => {
    const bow = new Bow();
    bow.swing();
    bow.update(DT);
    bow.release();

    const angles: number[] = [bow.angle];
    let fired: WeaponAction | undefined;
    let calls = 1;
    while (fired === undefined) {
      const action = bow.update(DT);
      calls++;
      angles.push(bow.angle);
      if (action?.kind === 'fire') fired = action;
      if (calls > 1000) throw new Error('bow never fired');
    }

    // No jump anywhere, including the fire frame itself where recovery begins.
    for (let i = 1; i < angles.length; i++) {
      const previous = angles[i - 1];
      const angle = angles[i];
      if (previous === undefined || angle === undefined) continue;
      expect(Math.abs(angle - previous)).toBeLessThan(0.5);
    }
    // Strictly rising toward aim while still drawing, i.e. every pair before the fire frame.
    for (let i = 1; i < angles.length - 1; i++) {
      const previous = angles[i - 1];
      const angle = angles[i];
      if (previous === undefined || angle === undefined) continue;
      expect(angle).toBeLessThanOrEqual(previous);
    }

    // 0.2 s at 60 fps, allowing one extra step for float accumulation.
    expect(calls).toBeGreaterThanOrEqual(12);
    expect(calls).toBeLessThanOrEqual(13);

    if (fired?.kind !== 'fire') throw new Error('expected a shot');
    const quick = shoot(new Bow(), 0).fired;
    if (quick?.kind !== 'fire') throw new Error('expected a shot');
    expect(fired.speed).toBeCloseTo(quick.speed, 0);
  });
});
