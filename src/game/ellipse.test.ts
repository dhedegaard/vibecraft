import { describe, expect, it } from 'vitest';
import { contains, type Ellipse, normalizedRadiusSq, outline, segmentCut } from './ellipse';

const UNROTATED: Ellipse = { x: 10, z: 5, radiusX: 6, radiusZ: 3, yaw: 0 };
const ALONG_Z: Ellipse = { x: 0, z: 0, radiusX: 7, radiusZ: 2, yaw: Math.PI / 2 };
const TILTED: Ellipse = { x: 3, z: -4, radiusX: 7, radiusZ: 4.5, yaw: 0.6 };
/** Unit-ish ellipse at the origin for the segment tests: 4 m wide along X, 2 m along Z. */
const WIDE: Ellipse = { x: 0, z: 0, radiusX: 2, radiusZ: 1, yaw: 0 };

/** World point `along` metres from the ellipse centre in direction (dirX, dirZ). */
function at(e: Ellipse, along: number, dirX: number, dirZ: number): [number, number] {
  return [e.x + along * dirX, e.z + along * dirZ];
}

describe('contains', () => {
  it('is inside just short of each radius and outside just past it on an unrotated ellipse', () => {
    expect(contains(UNROTATED, 10, 5)).toBe(true);
    expect(contains(UNROTATED, 15.9, 5)).toBe(true);
    expect(contains(UNROTATED, 16.1, 5)).toBe(false);
    expect(contains(UNROTATED, 10, 7.9)).toBe(true);
    expect(contains(UNROTATED, 10, 8.1)).toBe(false);
    expect(contains(UNROTATED, 0, 0)).toBe(false);
  });

  it('turns the long axis with yaw (yaw π/2 puts it along Z)', () => {
    expect(contains(ALONG_Z, 0, 6.9)).toBe(true);
    expect(contains(ALONG_Z, 0, 7.1)).toBe(false);
    expect(contains(ALONG_Z, 1.9, 0)).toBe(true);
    expect(contains(ALONG_Z, 2.1, 0)).toBe(false);
    expect(contains(ALONG_Z, 6.9, 0)).toBe(false);
  });

  it('matches three.js rotation.y for an arbitrary yaw: local X is (cos, -sin), local Z is (sin, cos)', () => {
    const { yaw } = TILTED;
    expect(contains(TILTED, ...at(TILTED, 6.9, Math.cos(yaw), -Math.sin(yaw)))).toBe(true);
    expect(contains(TILTED, ...at(TILTED, 7.1, Math.cos(yaw), -Math.sin(yaw)))).toBe(false);
    expect(contains(TILTED, ...at(TILTED, 4.4, Math.sin(yaw), Math.cos(yaw)))).toBe(true);
    expect(contains(TILTED, ...at(TILTED, 4.6, Math.sin(yaw), Math.cos(yaw)))).toBe(false);
  });

  it('grows both radii by a margin', () => {
    expect(contains(UNROTATED, 16.3, 5)).toBe(false);
    expect(contains(UNROTATED, 16.3, 5, 0.5)).toBe(true);
    expect(contains(UNROTATED, 10, 8.3)).toBe(false);
    expect(contains(UNROTATED, 10, 8.3, 0.5)).toBe(true);
  });
});

describe('normalizedRadiusSq', () => {
  it('is 0 at the centre, 1 on the rim and grows outward', () => {
    expect(normalizedRadiusSq(UNROTATED, 10, 5)).toBe(0);
    expect(normalizedRadiusSq(UNROTATED, 16, 5)).toBeCloseTo(1, 12);
    expect(normalizedRadiusSq(UNROTATED, 10, 8)).toBeCloseTo(1, 12);
    expect(normalizedRadiusSq(UNROTATED, 13, 5)).toBeCloseTo(0.25, 12);
    expect(normalizedRadiusSq(UNROTATED, 22, 5)).toBeCloseTo(4, 12);
  });
});

describe('outline', () => {
  it('returns `count` rim points starting on the local +X axis', () => {
    const points = outline(TILTED, 48);
    expect(points).toHaveLength(48);
    const first = points[0];
    if (!first) throw new Error('no points');
    expect(first.x).toBeCloseTo(TILTED.x + TILTED.radiusX * Math.cos(TILTED.yaw), 12);
    expect(first.y).toBeCloseTo(TILTED.z - TILTED.radiusX * Math.sin(TILTED.yaw), 12);
    for (const p of points) expect(normalizedRadiusSq(TILTED, p.x, p.y)).toBeCloseTo(1, 12);
  });

  it('puts the quarter point on the local +Z axis', () => {
    const quarter = outline(TILTED, 8)[2];
    if (!quarter) throw new Error('no points');
    expect(quarter.x).toBeCloseTo(TILTED.x + TILTED.radiusZ * Math.sin(TILTED.yaw), 12);
    expect(quarter.y).toBeCloseTo(TILTED.z + TILTED.radiusZ * Math.cos(TILTED.yaw), 12);
  });
});

describe('segmentCut', () => {
  it('returns the parametric range inside for a chord through the centre', () => {
    expect(segmentCut(WIDE, -4, 0, 4, 0)).toEqual([0.25, 0.75]);
    expect(segmentCut(WIDE, 0, -4, 0, 4)).toEqual([0.375, 0.625]);
  });

  it('clamps to the segment when an end is inside', () => {
    expect(segmentCut(WIDE, -1, 0, 1, 0)).toEqual([0, 1]);
    const cut = segmentCut(WIDE, -4, 0, 0, 0);
    expect(cut?.[0]).toBeCloseTo(0.5, 12);
    expect(cut?.[1]).toBe(1);
  });

  it('is undefined for a miss, a tangent graze and a segment that stops short', () => {
    expect(segmentCut(WIDE, -4, 3, 4, 3)).toBeUndefined();
    expect(segmentCut(WIDE, -4, 1, 4, 1)).toBeUndefined();
    expect(segmentCut(WIDE, -8, 0, -4, 0)).toBeUndefined();
  });

  it('follows the yaw', () => {
    // ALONG_Z is 14 m long along Z and 4 m wide along X.
    expect(segmentCut(ALONG_Z, 0, -14, 0, 14)).toEqual([0.25, 0.75]);
    const across = segmentCut(ALONG_Z, -4, 0, 4, 0);
    expect(across?.[0]).toBeCloseTo(0.25, 12);
    expect(across?.[1]).toBeCloseTo(0.75, 12);
  });
});
