import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pushOutOfCircles, type Circle } from './repel';
import { seededRandom } from './props';

const circle = (x: number, z: number, radius: number): Circle => ({ position: new THREE.Vector3(x, 0, z), radius });

describe('pushOutOfCircles', () => {
  it('leaves a point outside every circle alone', () => {
    const pos = new THREE.Vector3(10, 0, 0);
    expect(pushOutOfCircles(pos, [circle(0, 0, 5)])).toBe(false);
    expect(pos).toEqual(new THREE.Vector3(10, 0, 0));
  });

  it('moves an inside point to the rim along the radial', () => {
    const pos = new THREE.Vector3(3, 0, 0);
    expect(pushOutOfCircles(pos, [circle(0, 0, 5)])).toBe(true);
    expect(pos.x).toBeCloseTo(5);
    expect(pos.z).toBeCloseTo(0);
  });

  it('keeps y untouched', () => {
    const pos = new THREE.Vector3(0, 0.7, 1);
    pushOutOfCircles(pos, [circle(0, 0, 5)]);
    expect(pos.y).toBe(0.7);
  });

  it('pushes a point at the exact centre along +X', () => {
    const pos = new THREE.Vector3(2, 0, 2);
    pushOutOfCircles(pos, [circle(2, 2, 5)]);
    expect(pos.x).toBeCloseTo(7);
    expect(pos.z).toBeCloseTo(2);
  });

  it('is a float fixed point: a second push-out on the same position never moves it again', () => {
    const circles = [circle(0, 0, 5)];
    const rand = seededRandom(13);
    for (let i = 0; i < 200; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = rand() * 5; // anywhere inside the circle
      const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      pushOutOfCircles(pos, circles);
      expect(pushOutOfCircles(pos, circles)).toBe(false);
    }
  });

  it('ends outside both of two overlapping circles', () => {
    const circles = [circle(0, 0, 5), circle(6, 0, 5)];
    const pos = new THREE.Vector3(3, 0, 0.1);
    expect(pushOutOfCircles(pos, circles)).toBe(true);
    for (const c of circles) {
      expect(Math.hypot(pos.x - c.position.x, pos.z - c.position.z)).toBeGreaterThanOrEqual(c.radius - 1e-6);
    }
  });
});
