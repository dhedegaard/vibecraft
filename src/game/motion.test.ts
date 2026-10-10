import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { groundSpeed, settle, turnToward } from './motion';

const DT = 1 / 60;
const at = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0, z);

describe('groundSpeed', () => {
  it('is the intended speed when the step landed in full', () => {
    expect(groundSpeed(3, at(0, 0), at(0, 3 * DT), DT)).toBeCloseTo(3);
  });

  it('is zero when a push-out cancelled the step', () => {
    expect(groundSpeed(3, at(1, 1), at(1, 1), DT)).toBe(0);
  });

  it('is the covered fraction when the step was partly cancelled', () => {
    expect(groundSpeed(3, at(0, 0), at(0, 1.5 * DT), DT)).toBeCloseTo(1.5);
  });

  it('never exceeds the intended speed', () => {
    expect(groundSpeed(3, at(0, 0), at(0, 10), DT)).toBe(3);
  });

  it('ignores vertical movement and a zero dt', () => {
    expect(groundSpeed(3, at(0, 0), new THREE.Vector3(0, 2, 0), DT)).toBe(0);
    expect(groundSpeed(3, at(0, 0), at(0, 0), 0)).toBe(3);
  });
});

describe('settle', () => {
  it('eases toward the target without overshooting', () => {
    const next = settle(0, 10, 12, DT);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
  });

  it('snaps onto the target once close, so it comes to rest exactly', () => {
    let value = 0;
    for (let i = 0; i < 600 && value !== 10; i++) value = settle(value, 10, 12, DT);
    expect(value).toBe(10);
  });
});

describe('turnToward', () => {
  it('eases the yaw toward the direction and reports that it is still turning', () => {
    const object = new THREE.Object3D();
    const turning = turnToward(object, new THREE.Vector3(1, 0, 0), 4, DT);
    expect(turning).toBe(true);
    expect(object.rotation.y).toBeGreaterThan(0);
    expect(object.rotation.y).toBeLessThan(Math.PI / 2);
  });

  it('snaps onto the target once close and then reports no turning', () => {
    const object = new THREE.Object3D();
    const dir = new THREE.Vector3(1, 0, 0);
    let turning = true;
    for (let i = 0; i < 600 && turning; i++) turning = turnToward(object, dir, 4, DT);
    expect(turning).toBe(false);
    expect(object.rotation.y).toBe(Math.PI / 2);
    expect(turnToward(object, dir, 4, DT)).toBe(false);
    expect(object.rotation.y).toBe(Math.PI / 2);
  });
});
