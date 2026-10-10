import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MELEE_FACING, MELEE_REACH, nearestInCone, segmentHitsCylinder } from './targeting';

interface Target {
  name: string;
  position: THREE.Vector3;
}

const at = (name: string, x: number, z: number, y = 0): Target => ({ name, position: new THREE.Vector3(x, y, z) });
const origin = new THREE.Vector3(0, 0, 0);
const forward = new THREE.Vector3(0, 0, 1);
const positionOf = (t: Target): THREE.Vector3 => t.position;

describe('nearestInCone', () => {
  it('returns undefined when nothing is in reach', () => {
    const far = at('far', 0, MELEE_REACH + 0.1);
    expect(nearestInCone([far], positionOf, origin, forward)).toBeUndefined();
    expect(nearestInCone([], positionOf, origin, forward)).toBeUndefined();
  });

  it('picks the closest target in front', () => {
    const near = at('near', 0, 1);
    const mid = at('mid', 0.2, 2);
    const hit = nearestInCone([mid, near], positionOf, origin, forward);
    expect(hit?.item.name).toBe('near');
  });

  it('ignores targets behind or too far to the side', () => {
    const behind = at('behind', 0, -1);
    const side = at('side', 1, 0.1);
    expect(nearestInCone([behind, side], positionOf, origin, forward)).toBeUndefined();
  });

  it('honours the facing cone boundary', () => {
    // Just inside the cone (cos slightly above MELEE_FACING) versus just outside.
    const inAngle = Math.acos(MELEE_FACING) - 0.05;
    const outAngle = Math.acos(MELEE_FACING) + 0.05;
    const inside = at('inside', Math.sin(inAngle) * 2, Math.cos(inAngle) * 2);
    const outside = at('outside', Math.sin(outAngle) * 2, Math.cos(outAngle) * 2);
    expect(nearestInCone([outside], positionOf, origin, forward)).toBeUndefined();
    expect(nearestInCone([outside, inside], positionOf, origin, forward)?.item.name).toBe('inside');
  });

  it('measures reach horizontally and reports a horizontal unit vector toward the target', () => {
    const high = at('high', 1, 1, 50);
    const hit = nearestInCone([high], positionOf, origin, forward);
    expect(hit?.item.name).toBe('high');
    expect(hit?.away.y).toBe(0);
    expect(hit?.away.length()).toBeCloseTo(1);
    expect(hit?.away.x).toBeCloseTo(Math.SQRT1_2);
    expect(hit?.away.z).toBeCloseTo(Math.SQRT1_2);
  });

  it('works from a moved origin facing another way', () => {
    const from = new THREE.Vector3(5, 0, 5);
    const facing = new THREE.Vector3(-1, 0, 0);
    const ahead = at('ahead', 3, 5);
    const behind = at('behind', 7, 5);
    expect(nearestInCone([behind, ahead], positionOf, from, facing)?.item.name).toBe('ahead');
  });
});

describe('nearestInCone with a custom reach', () => {
  it('reaches a target the default reach would miss', () => {
    const far = at('far', 0, MELEE_REACH + 0.5);
    expect(nearestInCone([far], positionOf, origin, forward)).toBeUndefined();
    expect(nearestInCone([far], positionOf, origin, forward, MELEE_REACH + 1)?.item.name).toBe('far');
  });
});

describe('segmentHitsCylinder', () => {
  const base = new THREE.Vector3(0, 0, 0);

  it('returns the parameter of the closest approach for a segment through the body', () => {
    const along = segmentHitsCylinder(new THREE.Vector3(0, 0.8, 3), new THREE.Vector3(0, 0.8, -3), base, 0.9, 1.6);
    expect(along).toBeCloseTo(0.5);
  });

  it('misses a segment passing beside the body', () => {
    expect(segmentHitsCylinder(new THREE.Vector3(2, 0.8, 3), new THREE.Vector3(2, 0.8, -3), base, 0.9, 1.6)).toBeUndefined();
  });

  it('misses a segment flying over or under the body', () => {
    expect(segmentHitsCylinder(new THREE.Vector3(0, 2, 3), new THREE.Vector3(0, 2, -3), base, 0.9, 1.6)).toBeUndefined();
    expect(segmentHitsCylinder(new THREE.Vector3(0, -0.5, 3), new THREE.Vector3(0, -0.5, -3), base, 0.9, 1.6)).toBeUndefined();
  });

  it('is nearer for the body the segment reaches first', () => {
    const from = new THREE.Vector3(0, 0.8, 10);
    const to = new THREE.Vector3(0, 0.8, -10);
    const near = segmentHitsCylinder(from, to, new THREE.Vector3(0, 0, 5), 0.5, 2);
    const far = segmentHitsCylinder(from, to, new THREE.Vector3(0, 0, -5), 0.5, 2);
    expect(near).toBeDefined();
    expect(far).toBeDefined();
    if (near === undefined || far === undefined) throw new Error('both should hit');
    expect(near).toBeLessThan(far);
  });

  it('returns undefined for a zero-length segment', () => {
    const p = new THREE.Vector3(0, 0.5, 0);
    expect(segmentHitsCylinder(p, p, base, 0.9, 1.6)).toBeUndefined();
  });
});
