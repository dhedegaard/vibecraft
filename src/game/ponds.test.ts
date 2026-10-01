import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { outline } from './ellipse';
import { DEPTH, Ponds, RIM_SEGMENTS, WADE_DEPTH, WADE_SPEED_FACTOR, WATER_LEVEL } from './ponds';
import { FLAT_TERRAIN } from './terrain';

function make(): { scene: THREE.Scene; ponds: Ponds } {
  const scene = new THREE.Scene();
  return { scene, ponds: new Ponds(scene) };
}

/** An unrotated pond at the origin, 12 m along X and 6 m along Z. */
function pond(): Ponds {
  const { ponds } = make();
  ponds.place(0, 0, 6, 3, 0);
  return ponds;
}

/** X coordinate on the pond's +X radius where the floor is `height` metres (paraboloid inverted). */
function xAtFloor(height: number): number {
  return 6 * Math.sqrt(1 + height / DEPTH);
}

describe('FLAT_TERRAIN', () => {
  it('is level ground at full speed everywhere', () => {
    expect(FLAT_TERRAIN.heightAt(0, 0)).toBe(0);
    expect(FLAT_TERRAIN.surfaceAt(1000, -1000)).toBe(0);
    expect(FLAT_TERRAIN.speedFactor(1000, -1000)).toBe(1);
  });
});

describe('Ponds.contains', () => {
  it('delegates to the ellipse with the margin and handles several ponds', () => {
    const { ponds } = make();
    ponds.place(10, 5, 6, 3, 0);
    ponds.place(40, 0, 2, 2, 0);
    expect(ponds.contains(15.9, 5)).toBe(true);
    expect(ponds.contains(16.3, 5)).toBe(false);
    expect(ponds.contains(16.3, 5, 0.5)).toBe(true);
    expect(ponds.contains(40, 0)).toBe(true);
    expect(ponds.contains(25, 0)).toBe(false);
  });

  it('exposes its ellipses for the ground and grid', () => {
    const { ponds } = make();
    ponds.place(10, 5, 6, 3, 0.6);
    expect(ponds.ellipses).toEqual([{ x: 10, z: 5, radiusX: 6, radiusZ: 3, yaw: 0.6 }]);
  });
});

describe('Ponds.heightAt', () => {
  it('is a paraboloid: DEPTH deep at the centre, level with the plain at the rim, 0 outside', () => {
    const ponds = pond();
    expect(ponds.heightAt(0, 0)).toBe(-DEPTH);
    expect(ponds.heightAt(5.999, 0)).toBeCloseTo(0, 2);
    expect(ponds.heightAt(0, 2.999)).toBeCloseTo(0, 2);
    expect(ponds.heightAt(6.001, 0)).toBe(0);
    expect(ponds.heightAt(50, 50)).toBe(0);
    expect(ponds.heightAt(3, 0)).toBeCloseTo(-DEPTH * 0.75, 12);
  });

  it('descends monotonically toward the centre', () => {
    const ponds = pond();
    let previous = ponds.heightAt(6, 0);
    for (let x = 5.5; x >= 0; x -= 0.5) {
      const h = ponds.heightAt(x, 0);
      expect(h).toBeLessThan(previous);
      previous = h;
    }
  });
});

describe('Ponds.surfaceAt', () => {
  it('is the water level over water, the sand on the dry shore and 0 outside', () => {
    const ponds = pond();
    expect(ponds.surfaceAt(0, 0)).toBe(WATER_LEVEL);
    const shoreX = xAtFloor(WATER_LEVEL / 2);
    expect(ponds.heightAt(shoreX, 0)).toBeGreaterThan(WATER_LEVEL);
    expect(ponds.surfaceAt(shoreX, 0)).toBeCloseTo(ponds.heightAt(shoreX, 0), 12);
    expect(ponds.surfaceAt(shoreX, 0)).toBeLessThan(0);
    expect(ponds.surfaceAt(50, 50)).toBe(0);
  });
});

describe('Ponds.speedFactor', () => {
  it('is full speed outside and on the dry shore, WADE_SPEED_FACTOR from WADE_DEPTH of water on', () => {
    const ponds = pond();
    expect(ponds.speedFactor(50, 50)).toBe(1);
    expect(ponds.speedFactor(xAtFloor(WATER_LEVEL / 2), 0)).toBe(1);
    expect(ponds.speedFactor(0, 0)).toBe(WADE_SPEED_FACTOR);
    expect(ponds.speedFactor(xAtFloor(WATER_LEVEL - WADE_DEPTH), 0)).toBeCloseTo(WADE_SPEED_FACTOR, 12);
  });

  it('grades between the two with depth and never drops below WADE_SPEED_FACTOR', () => {
    const ponds = pond();
    const halfway = ponds.speedFactor(xAtFloor(WATER_LEVEL - WADE_DEPTH / 2), 0);
    expect(halfway).toBeCloseTo((1 + WADE_SPEED_FACTOR) / 2, 12);
    for (let x = 0; x <= 6; x += 0.25) {
      const f = ponds.speedFactor(x, 0);
      expect(f).toBeGreaterThanOrEqual(WADE_SPEED_FACTOR);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

/** The pond meshes in the order they were added (bowl, then water, per pond). */
function meshesOf(scene: THREE.Scene): THREE.Mesh[] {
  const root = scene.children[0];
  return (root?.children ?? []).filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
}

/** World-space position of vertex `i` of `mesh`. */
function worldVertex(mesh: THREE.Mesh, i: number): THREE.Vector3 {
  const position = mesh.geometry.getAttribute('position');
  return mesh.localToWorld(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
}

describe('Ponds meshes', () => {
  it('adds a bowl and a water disc per pond that receive shadows and cast none', () => {
    const { scene, ponds } = make();
    ponds.place(0, 0, 7, 4.5, 0.6);
    expect(meshesOf(scene)).toHaveLength(2);
    ponds.place(20, 0, 3, 3, 0);
    const meshes = meshesOf(scene);
    expect(meshes).toHaveLength(4);
    for (const mesh of meshes) {
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.castShadow).toBe(false);
    }
  });

  it('puts a see-through water plane at WATER_LEVEL over a bowl whose floor faces up', () => {
    const { scene, ponds } = make();
    ponds.place(0, 0, 7, 4.5, 0);
    const [bowl, water] = meshesOf(scene);
    if (!bowl || !water) throw new Error('missing meshes');
    expect(water.position.y).toBe(WATER_LEVEL);
    expect(water.material).toMatchObject({ transparent: true });
    expect(water.geometry.getAttribute('normal').getY(0)).toBeCloseTo(1, 6);
    const normals = bowl.geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeGreaterThan(0);
  });

  it('digs the bowl DEPTH deep at the centre with its rim on the plain, matching the outline point for point', () => {
    const { scene, ponds } = make();
    const e = { x: 3, z: -4, radiusX: 7, radiusZ: 4.5, yaw: 0.6 };
    ponds.place(e.x, e.z, e.radiusX, e.radiusZ, e.yaw);
    const [bowl] = meshesOf(scene);
    if (!bowl) throw new Error('missing bowl');
    bowl.updateMatrixWorld(true);

    const centre = worldVertex(bowl, 0);
    expect(centre.x).toBeCloseTo(e.x, 5);
    expect(centre.y).toBeCloseTo(-DEPTH, 5);
    expect(centre.z).toBeCloseTo(e.z, 5);

    const count = bowl.geometry.getAttribute('position').count;
    const rimStart = count - RIM_SEGMENTS;
    const rim = outline(e, RIM_SEGMENTS);
    // The bowl's positions are float32, good to ~1e-7 relative, so 5 decimals is the honest tolerance.
    for (let i = 0; i < RIM_SEGMENTS; i++) {
      const v = worldVertex(bowl, rimStart + i);
      const expected = rim[i];
      if (!expected) throw new Error('short outline');
      expect(v.x).toBeCloseTo(expected.x, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(expected.y, 5);
    }
  });
});
