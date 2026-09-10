import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Colliders, separate, type Collider } from './collision';

const circle = (x: number, z: number, radius: number): Collider => ({ kind: 'circle', x, z, radius });
const box = (x: number, z: number, halfWidth: number, halfDepth: number, yaw: number): Collider => ({
  kind: 'box',
  x,
  z,
  halfWidth,
  halfDepth,
  yaw,
});

describe('Colliders.resolve', () => {
  it('leaves a clear position alone and reports no movement', () => {
    const colliders = new Colliders();
    colliders.add(circle(5, 0, 0.5));
    const pos = new THREE.Vector3(0, 0, 0);
    expect(colliders.resolve(pos, 0.4)).toBe(false);
    expect(pos).toEqual(new THREE.Vector3(0, 0, 0));
  });

  it('pushes a circle out of a circle along the centre line', () => {
    const colliders = new Colliders();
    colliders.add(circle(0, 0, 0.5));
    const pos = new THREE.Vector3(0.3, 0, 0.4);
    expect(colliders.resolve(pos, 0.4)).toBe(true);
    // Distance between centres should now equal the summed radii, direction unchanged.
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(0.9, 5);
    expect(pos.x / pos.z).toBeCloseTo(0.3 / 0.4, 5);
    expect(pos.y).toBe(0);
  });

  it('pushes a circle sitting exactly on a centre in some direction', () => {
    const colliders = new Colliders();
    colliders.add(circle(2, 0, 0.5));
    const pos = new THREE.Vector3(2, 0, 0);
    expect(colliders.resolve(pos, 0.4)).toBe(true);
    expect(Math.hypot(pos.x - 2, pos.z)).toBeCloseTo(0.9, 5);
  });

  it('pushes out of the nearest face of an axis-aligned box', () => {
    const colliders = new Colliders();
    colliders.add(box(0, 0, 3, 2.5, 0));
    const pos = new THREE.Vector3(1, 0, 2.4);
    expect(colliders.resolve(pos, 0.4)).toBe(true);
    expect(pos.x).toBeCloseTo(1, 5);
    expect(pos.z).toBeCloseTo(2.9, 5);
  });

  it('pushes out of a box corner diagonally', () => {
    const colliders = new Colliders();
    colliders.add(box(0, 0, 3, 2.5, 0));
    const pos = new THREE.Vector3(3.2, 0, 2.7);
    expect(colliders.resolve(pos, 0.4)).toBe(true);
    // Circle should now touch the corner (3, 2.5) exactly.
    expect(Math.hypot(pos.x - 3, pos.z - 2.5)).toBeCloseTo(0.4, 5);
    expect(pos.x).toBeGreaterThan(3);
    expect(pos.z).toBeGreaterThan(2.5);
  });

  it('respects a rotated box', () => {
    const colliders = new Colliders();
    const yaw = Math.PI / 4;
    colliders.add(box(0, 0, 3, 1, yaw));
    // Along the box's local +Z axis (its depth), 1.2 m out: overlapping a 0.4 circle.
    const local = new THREE.Vector3(0, 0, 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const pos = local.clone();
    expect(colliders.resolve(pos, 0.4)).toBe(true);
    const dir = local.clone().normalize();
    expect(pos.dot(dir)).toBeCloseTo(1.4, 5);
    expect(pos.clone().sub(dir.multiplyScalar(1.4)).length()).toBeCloseTo(0, 5);
    // Far along the local X axis, the same distance from the centre is clear.
    const alongX = new THREE.Vector3(3.6, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    expect(colliders.resolve(alongX, 0.4)).toBe(false);
  });

  it('resolves against several colliders at once', () => {
    const colliders = new Colliders();
    colliders.add(circle(0, 0, 0.5));
    colliders.add(circle(1.6, 0, 0.5));
    const pos = new THREE.Vector3(0.8, 0, 0.1);
    colliders.resolve(pos, 0.4);
    for (const c of [circle(0, 0, 0.5), circle(1.6, 0, 0.5)]) {
      expect(Math.hypot(pos.x - c.x, pos.z - c.z)).toBeGreaterThanOrEqual(0.9 - 1e-3);
    }
  });
});

describe('separate', () => {
  it('moves only the second position out of the first', () => {
    const anchor = new THREE.Vector3(0, 0, 0);
    const other = new THREE.Vector3(0.5, 0, 0);
    expect(separate(anchor, 0.4, other, 0.4)).toBe(true);
    expect(anchor).toEqual(new THREE.Vector3(0, 0, 0));
    expect(other.x).toBeCloseTo(0.8, 5);
    expect(other.z).toBeCloseTo(0, 5);
  });

  it('does nothing when the circles are apart', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 0, 0);
    expect(separate(a, 0.4, b, 0.4)).toBe(false);
    expect(b.x).toBe(1);
  });

  it('ignores height differences', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(0.5, 3, 0);
    expect(separate(a, 0.4, b, 0.4)).toBe(true);
    expect(b.y).toBe(3);
  });
});
