import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Gun } from './gun';

const DT = 1 / 60;

describe('Gun', () => {
  it('always locks the arm at the aim pose', () => {
    const gun = new Gun();
    expect(gun.armLocked).toBe(true);
    expect(gun.angle).toBeLessThan(0);
  });

  it('fires on the first frame after the trigger, once per recoil', () => {
    const gun = new Gun();
    gun.swing();
    const first = gun.update(DT);
    expect(first?.kind).toBe('fire');
    if (first?.kind !== 'fire') throw new Error('expected a shot');
    expect(first.origin).toBeInstanceOf(THREE.Vector3);

    let shots = 0;
    while (gun.swinging) {
      if (gun.update(DT)?.kind === 'fire') shots++;
    }
    expect(shots).toBe(0);
  });

  it('refuses to fire again until the recoil has finished', () => {
    const gun = new Gun();
    gun.swing();
    gun.update(DT);
    gun.swing();
    expect(gun.update(DT)).toBeUndefined();

    while (gun.swinging) gun.update(DT);
    gun.swing();
    expect(gun.update(DT)?.kind).toBe('fire');
  });

  it('kicks the arm up during recoil and settles back to the aim angle', () => {
    const gun = new Gun();
    const aim = gun.angle;
    gun.swing();
    let lifted = false;
    while (gun.swinging) {
      gun.update(DT);
      if (gun.angle < aim - 0.1) lifted = true;
    }
    expect(lifted).toBe(true);
    expect(gun.angle).toBe(aim);
  });

  it('spawns the bullet at the muzzle in world space', () => {
    const gun = new Gun();
    const hand = new THREE.Object3D();
    hand.position.set(10, 2, -5);
    hand.add(gun.model);

    gun.swing();
    const shot = gun.update(DT);
    if (shot?.kind !== 'fire') throw new Error('expected a shot');
    // The muzzle is ~0.8 m from the grip, so the origin is near the hand but not on it.
    const offset = shot.origin.distanceTo(hand.position);
    expect(offset).toBeGreaterThan(0.5);
    expect(offset).toBeLessThan(1.5);
  });
});
