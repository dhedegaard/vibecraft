import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type Ellipse, normalizedRadiusSq, outline } from './ellipse';
import { buildGrid, buildGround, gridSegments, groundShape } from './ground';
import { RIM_SEGMENTS } from './ponds';

const SIZE = 20;
const DIVISIONS = 20;
const POND: Ellipse = { x: 0, z: 0, radiusX: 2, radiusZ: 1, yaw: 0 };
const TILTED: Ellipse = { x: 3, z: -4, radiusX: 4, radiusZ: 2, yaw: 0.6 };

/** Segments as [x0, z0, x1, z1] tuples. */
function segments(flat: number[]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i + 5 < flat.length; i += 6) {
    const [x0, , z0, x1, , z1] = [flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 4], flat[i + 5]];
    if (x0 === undefined || z0 === undefined || x1 === undefined || z1 === undefined) throw new Error('ragged');
    out.push([x0, z0, x1, z1]);
  }
  return out;
}

describe('groundShape', () => {
  it('is a square with one hole per pond traced by the pond outline, flipped for the plane rotation', () => {
    const shape = groundShape(SIZE, [TILTED]);
    expect(shape.getPoints(1)).toHaveLength(4);
    expect(shape.holes).toHaveLength(1);
    const hole = shape.holes[0]?.getPoints(1) ?? [];
    expect(hole).toHaveLength(RIM_SEGMENTS);
    const rim = outline(TILTED, RIM_SEGMENTS);
    hole.forEach((p, i) => {
      const expected = rim[i];
      if (!expected) throw new Error('short outline');
      expect(p.x).toBeCloseTo(expected.x, 9);
      // Shape y becomes world −z once the mesh is rotated −π/2 about X.
      expect(p.y).toBeCloseTo(-expected.y, 9);
    });
  });
});

describe('buildGround', () => {
  it('lies flat, faces up and receives shadows', () => {
    const ground = buildGround(SIZE, [POND]);
    expect(ground.rotation.x).toBeCloseTo(-Math.PI / 2, 12);
    expect(ground.receiveShadow).toBe(true);
    expect(ground.geometry.getAttribute('position').count).toBeGreaterThan(RIM_SEGMENTS);
  });
});

describe('gridSegments', () => {
  it('lays out (divisions + 1) lines each way spanning the whole ground when nothing cuts them', () => {
    const segs = segments(gridSegments(SIZE, DIVISIONS, []));
    expect(segs).toHaveLength(2 * (DIVISIONS + 1));
    for (const [x0, z0, x1, z1] of segs) {
      const alongX = z0 === z1;
      expect(alongX ? [x0, x1] : [z0, z1]).toEqual([-SIZE / 2, SIZE / 2]);
    }
  });

  it('cuts every line at the pond rim and leaves nothing inside', () => {
    const segs = segments(gridSegments(SIZE, DIVISIONS, [POND]));
    for (const [x0, z0, x1, z1] of segs) {
      const endpoints: [number, number][] = [[x0, z0], [x1, z1]];
      for (const [x, z] of endpoints) {
        const onBorder = Math.abs(x) === SIZE / 2 || Math.abs(z) === SIZE / 2;
        if (!onBorder) expect(normalizedRadiusSq(POND, x, z)).toBeCloseTo(1, 9);
        expect(normalizedRadiusSq(POND, x, z)).toBeGreaterThanOrEqual(1 - 1e-9);
      }
      // No segment may bridge the pond: its midpoint is outside too.
      expect(normalizedRadiusSq(POND, (x0 + x1) / 2, (z0 + z1) / 2)).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it('splits a line through the centre into two pieces and clips several ponds', () => {
    const one = segments(gridSegments(SIZE, DIVISIONS, [POND])).filter(([, z0, , z1]) => z0 === 0 && z1 === 0);
    expect(one).toHaveLength(2);
    const far: Ellipse = { x: 6, z: 0, radiusX: 1, radiusZ: 1, yaw: 0 };
    const two = segments(gridSegments(SIZE, DIVISIONS, [POND, far])).filter(([, z0, , z1]) => z0 === 0 && z1 === 0);
    expect(two).toHaveLength(3);
  });
});

describe('buildGrid', () => {
  it('is a vertex-coloured line set the day cycle can dim through material.color', () => {
    const grid = buildGrid(SIZE, DIVISIONS, [POND]);
    expect(grid).toBeInstanceOf(THREE.LineSegments);
    expect(grid.material.vertexColors).toBe(true);
    const position = grid.geometry.getAttribute('position');
    const color = grid.geometry.getAttribute('color');
    expect(color.count).toBe(position.count);
    expect(position.count % 2).toBe(0);
  });
});
