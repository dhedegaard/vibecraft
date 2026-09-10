import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { groundSpeed } from './motion';

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
