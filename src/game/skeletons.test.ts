import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Colliders } from './collision';
import { Skeletons } from './skeletons';
import type { Terrain } from './terrain';

const DT = 1 / 60;
/** Ground a metre down everywhere, no water. */
const SUNKEN: Terrain = { heightAt: () => -1, surfaceAt: () => -1, speedFactor: () => 1 };
/** Far enough that nobody notices the player. */
const FAR_PLAYER = new THREE.Vector3(1000, 0, 1000);

describe('Skeletons on uneven ground', () => {
  it('stand on the terrain height after an update', () => {
    const scene = new THREE.Scene();
    const skeletons = new Skeletons(scene);
    const root = scene.children[0];
    if (!root) throw new Error('no skeleton root');
    expect(root.children.length).toBeGreaterThan(0);
    for (const s of root.children) expect(s.position.y).toBe(0);

    skeletons.update(DT, FAR_PLAYER, new Colliders(), [], SUNKEN);
    for (const s of root.children) expect(s.position.y).toBe(-1);
  });
});
