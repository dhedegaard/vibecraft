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

    bow.swing();
    bow.update(DT);
    bow.release();
    expect(bow.update(DT)?.kind).toBe('fire');
    bow.swing();
    let shots = 0;
    while (bow.swinging) {
      if (bow.update(DT)?.kind === 'fire') shots++;
    }
    expect(shots).toBe(0);
    expect(bow.draw).toBe(0);
  });
});
