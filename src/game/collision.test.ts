import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Colliders, separate, type CircleCollider, type Collider } from './collision';
import { seededRandom } from './props';

const circle = (x: number, z: number, radius: number): Collider => ({ kind: 'circle', x, z, radius });
const box = (x: number, z: number, halfWidth: number, halfDepth: number, yaw: number): Collider => ({
  kind: 'box',
  x,
  z,
  halfWidth,
  halfDepth,
  yaw,
});

const boulder = (x: number, z: number, radius: number): CircleCollider => ({
  kind: 'circle',
  x,
  z,
  radius,
  pushable: true,
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

  it('is a float fixed point: a second resolve on the same position never moves it again', () => {
    const colliders = new Colliders();
    colliders.add(circle(0, 0, 0.5));
    const rand = seededRandom(11);
    for (let i = 0; i < 200; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = rand() * 0.9; // inside the circle's 0.5 + 0.4 = 0.9 exclusion radius
      const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      colliders.resolve(pos, 0.4);
      expect(colliders.resolve(pos, 0.4)).toBe(false);
    }
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

describe('Colliders with pushable circles', () => {
  it('moves the boulder away by the overlap and leaves the character where it stands', () => {
    const colliders = new Colliders();
    const b = boulder(0, 0, 1);
    colliders.add(b);
    const pos = new THREE.Vector3(-1, 0, 0);
    expect(colliders.resolve(pos, 0.4)).toBe(false);
    expect(pos).toEqual(new THREE.Vector3(-1, 0, 0));
    // Contact distance is 1.4, so the boulder ends 1.4 from the character.
    expect(b.x).toBeCloseTo(0.4, 6);
    expect(b.z).toBeCloseTo(0, 6);
  });

  it('skips itself when the character sits exactly on its centre', () => {
    const colliders = new Colliders();
    const b = boulder(0, 0, 1);
    colliders.add(b);
    expect(colliders.resolve(new THREE.Vector3(0, 0, 0), 0.4)).toBe(false);
    expect(b.x).toBeCloseTo(1.4, 6);
    expect(b.z).toBeCloseTo(0, 6);
  });

  it('blocks against a trunk and pushes the character back instead', () => {
    const colliders = new Colliders();
    colliders.add(circle(1.6, 0, 0.5));
    const b = boulder(0, 0, 1);
    colliders.add(b);
    const pos = new THREE.Vector3(-1, 0, 0);
    expect(colliders.resolve(pos, 0.4)).toBe(true);
    // The trunk caps the boulder at 1.6 - (1 + 0.5); the character stays 1.4 behind it.
    expect(b.x).toBeCloseTo(0.1, 5);
    expect(pos.x).toBeCloseTo(0.1 - 1.4, 5);
  });

  it('blocks against a box like the house', () => {
    const colliders = new Colliders();
    colliders.add(box(2, 0, 1, 2, 0));
    const b = boulder(0, 0, 1);
    colliders.add(b);
    const pos = new THREE.Vector3(-1, 0, 0);
    expect(colliders.resolve(pos, 0.4)).toBe(true);
    // The box's near face sits at x = 1, so the boulder's centre stops at 0 (radius 1).
    expect(b.x).toBeCloseTo(0, 5);
    expect(pos.x).toBeCloseTo(b.x - 1.4, 5);
  });

  it('treats another boulder as a block, not something to push', () => {
    const colliders = new Colliders();
    const a = boulder(0, 0, 1);
    const other = boulder(2, 0, 1);
    colliders.add(a);
    colliders.add(other);
    const pos = new THREE.Vector3(-1, 0, 0);
    expect(colliders.resolve(pos, 0.4)).toBe(true);
    expect(other.x).toBe(2);
    expect(a.x).toBeCloseTo(0, 5);
    expect(pos.x).toBeCloseTo(a.x - 1.4, 5);
  });

  it('is a float fixed point: a second resolve changes nothing', () => {
    const colliders = new Colliders();
    colliders.add(circle(1.6, 0, 0.5));
    const b = boulder(0, 0, 1);
    colliders.add(b);
    const pos = new THREE.Vector3(-1, 0, 0);
    colliders.resolve(pos, 0.4);
    const settled = { x: b.x, z: b.z, pos: pos.clone() };
    expect(colliders.resolve(pos, 0.4)).toBe(false);
    expect(b.x).toBe(settled.x);
    expect(b.z).toBe(settled.z);
    expect(pos).toEqual(settled.pos);
  });

  it('does not creep while pushed against a pinned boulder, and lets the character walk away', () => {
    const colliders = new Colliders();
    colliders.add(circle(1.6, 0, 0.5));
    const b = boulder(0, 0, 1);
    colliders.add(b);
    const pos = new THREE.Vector3(-1, 0, 0);
    colliders.resolve(pos, 0.4);
    const pinnedX = b.x;

    for (let i = 0; i < 120; i++) {
      pos.x += 0.1;
      colliders.resolve(pos, 0.4);
    }
    expect(b.x).toBeCloseTo(pinnedX, 6);
    expect(pos.x).toBeCloseTo(pinnedX - 1.4, 5);

    const before = pos.x;
    for (let i = 0; i < 10; i++) {
      pos.x -= 0.1;
      colliders.resolve(pos, 0.4);
    }
    expect(pos.x).toBeCloseTo(before - 1, 5);
    expect(b.x).toBeCloseTo(pinnedX, 6);
  });

  it('treats a boulder as static when pushes is false', () => {
    const colliders = new Colliders();
    const b = boulder(0, 0, 1);
    colliders.add(b);
    const pos = new THREE.Vector3(-1, 0, 0);
    expect(colliders.resolve(pos, 0.4, { pushes: false })).toBe(true);
    expect(b.x).toBe(0);
    expect(pos.x).toBeCloseTo(-1.4, 5);
  });

  it('stops a boulder pushed toward a blocker and makes the pusher yield (sandwich)', () => {
    const colliders = new Colliders();
    const b = boulder(0, 0, 1);
    colliders.add(b);
    const player = new THREE.Vector3(-1.5, 0, 0);
    const skeleton = new THREE.Vector3(1.4, 0, 0);
    const blockers = [{ position: player, radius: 0.4 }];

    // Frame order as in main.ts: the player resolves first, then the skeleton with the player as blocker.
    // The skeleton walks 3 m left; the boulder rides ahead of it until it touches the player.
    for (let i = 0; i < 60; i++) {
      colliders.resolve(player, 0.4);
      skeleton.x -= 0.05;
      colliders.resolve(skeleton, 0.4, { blockers });
    }
    expect(player.x).toBe(-1.5);
    expect(b.x).toBeCloseTo(-1.5 + 1.4, 5);
    expect(skeleton.x).toBeCloseTo(b.x + 1.4, 5);
  });

  it('makes a skeleton yield when the player shoves a boulder into it', () => {
    const colliders = new Colliders();
    const b = boulder(0, 0, 1);
    colliders.add(b);
    const player = new THREE.Vector3(-1, 0, 0);
    const skeleton = new THREE.Vector3(1.4, 0, 0);

    colliders.resolve(player, 0.4);
    expect(b.x).toBeCloseTo(0.4, 5);
    colliders.resolve(skeleton, 0.4, { blockers: [{ position: player, radius: 0.4 }] });
    // The boulder cannot come back through the player, so the skeleton is pushed out instead.
    expect(b.x).toBeCloseTo(0.4, 5);
    expect(skeleton.x).toBeCloseTo(0.4 + 1.4, 5);
    expect(player.x).toBe(-1);
  });
});

describe('Colliders.overlaps and remove', () => {
  it('reports overlap with circles, boxes and boulders without moving anything', () => {
    const colliders = new Colliders();
    const b = boulder(0, 0, 1);
    colliders.add(b);
    colliders.add(box(5, 0, 1, 1, 0));
    colliders.add(circle(-5, 0, 0.5));

    const nearBoulder = new THREE.Vector3(-1, 0, 0);
    expect(colliders.overlaps(nearBoulder, 0.4)).toBe(true);
    expect(colliders.overlaps(new THREE.Vector3(5, 0, 0), 0.4)).toBe(true);
    expect(colliders.overlaps(new THREE.Vector3(-5, 0, 0), 0.4)).toBe(true);
    expect(colliders.overlaps(new THREE.Vector3(0, 0, 20), 0.4)).toBe(false);
    expect(nearBoulder).toEqual(new THREE.Vector3(-1, 0, 0));
    expect(b.x).toBe(0);
    expect(b.z).toBe(0);
  });

  it('remove drops a collider so it no longer blocks; removing an unknown one is harmless', () => {
    const colliders = new Colliders();
    const b = boulder(0, 0, 1);
    colliders.add(b);
    colliders.remove(b);
    expect(colliders.resolve(new THREE.Vector3(0.2, 0, 0), 0.4)).toBe(false);
    expect(colliders.overlaps(new THREE.Vector3(0, 0, 0), 0.4)).toBe(false);
    expect(() => colliders.remove(b)).not.toThrow();
  });
});
