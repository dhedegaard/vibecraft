import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Ponds, WADE_SPEED_FACTOR } from './ponds';
import { FLAT_TERRAIN } from './terrain';

function make(): { scene: THREE.Scene; ponds: Ponds } {
  const scene = new THREE.Scene();
  return { scene, ponds: new Ponds(scene) };
}

/** The pond meshes in the order they were added (bank, then water, per pond). */
function meshesOf(scene: THREE.Scene): THREE.Mesh[] {
  const root = scene.children[0];
  return (root?.children ?? []).filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
}

describe('FLAT_TERRAIN', () => {
  it('is full speed everywhere', () => {
    expect(FLAT_TERRAIN.speedFactor(0, 0)).toBe(1);
    expect(FLAT_TERRAIN.speedFactor(1000, -1000)).toBe(1);
  });
});

describe('Ponds ellipse test', () => {
  it('is wet inside and dry outside an unrotated pond, just either side of each radius', () => {
    const { ponds } = make();
    ponds.place(10, 5, 6, 3, 0);
    expect(ponds.speedFactor(10, 5)).toBe(WADE_SPEED_FACTOR);
    expect(ponds.contains(15.9, 5)).toBe(true);
    expect(ponds.contains(16.1, 5)).toBe(false);
    expect(ponds.contains(10, 7.9)).toBe(true);
    expect(ponds.contains(10, 8.1)).toBe(false);
    expect(ponds.speedFactor(16.1, 5)).toBe(1);
    expect(ponds.speedFactor(0, 0)).toBe(1);
  });

  it('turns the long axis with yaw (yaw π/2 puts it along Z)', () => {
    const { ponds } = make();
    ponds.place(0, 0, 7, 2, Math.PI / 2);
    expect(ponds.contains(0, 6.9)).toBe(true);
    expect(ponds.contains(0, 7.1)).toBe(false);
    expect(ponds.contains(1.9, 0)).toBe(true);
    expect(ponds.contains(2.1, 0)).toBe(false);
    expect(ponds.contains(6.9, 0)).toBe(false);
  });

  it('matches three.js rotation.y for an arbitrary yaw: local X is (cos, -sin), local Z is (sin, cos)', () => {
    const { ponds } = make();
    const yaw = 0.6;
    const [cx, cz] = [3, -4];
    ponds.place(cx, cz, 7, 4.5, yaw);
    const at = (along: number, dirX: number, dirZ: number): [number, number] => [cx + along * dirX, cz + along * dirZ];

    expect(ponds.contains(...at(6.9, Math.cos(yaw), -Math.sin(yaw)))).toBe(true);
    expect(ponds.contains(...at(7.1, Math.cos(yaw), -Math.sin(yaw)))).toBe(false);
    expect(ponds.contains(...at(4.4, Math.sin(yaw), Math.cos(yaw)))).toBe(true);
    expect(ponds.contains(...at(4.6, Math.sin(yaw), Math.cos(yaw)))).toBe(false);
  });

  it('grows both radii by a margin', () => {
    const { ponds } = make();
    ponds.place(10, 5, 6, 3, 0);
    expect(ponds.contains(16.3, 5)).toBe(false);
    expect(ponds.contains(16.3, 5, 0.5)).toBe(true);
    expect(ponds.contains(10, 8.3)).toBe(false);
    expect(ponds.contains(10, 8.3, 0.5)).toBe(true);
  });

  it('handles several ponds', () => {
    const { ponds } = make();
    ponds.place(0, 0, 2, 2, 0);
    ponds.place(20, 0, 2, 2, 0);
    expect(ponds.contains(0, 0)).toBe(true);
    expect(ponds.contains(20, 0)).toBe(true);
    expect(ponds.contains(10, 0)).toBe(false);
  });
});

describe('Ponds meshes', () => {
  it('adds a bank and a water disc per pond, flat and facing up', () => {
    const { scene, ponds } = make();
    ponds.place(0, 0, 7, 4.5, 0.6);
    const meshes = meshesOf(scene);
    expect(meshes).toHaveLength(2);
    ponds.place(20, 0, 3, 3, 0);
    expect(meshesOf(scene)).toHaveLength(4);

    for (const mesh of meshes) {
      // The shared disc lies in the XZ plane facing up; the wrong rotation sign faces it down (culled).
      expect(mesh.geometry.getAttribute('normal').getY(0)).toBeCloseTo(1, 6);
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.castShadow).toBe(false);
    }
  });

  it('puts the wider sandy bank under the water', () => {
    const { scene, ponds } = make();
    ponds.place(0, 0, 7, 4.5, 0);
    const [bank, water] = meshesOf(scene);
    if (!bank || !water) throw new Error('missing meshes');
    expect(bank.position.y).toBeLessThan(water.position.y);
    expect(bank.scale.x).toBeGreaterThan(water.scale.x);
    expect(bank.scale.z).toBeGreaterThan(water.scale.z);
    expect(water.scale.x).toBe(7);
    expect(water.scale.z).toBe(4.5);
  });
});
