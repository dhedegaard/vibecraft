import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BODY_RADIUS } from './cat';
import { BED, CAVE, CAVE_RADIUS, Cave } from './cave';
import { CHARACTER_RADIUS, Colliders } from './collision';

function build(): { cave: Cave; colliders: Colliders; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  const colliders = new Colliders();
  return { cave: new Cave(scene, colliders), colliders, scene };
}

describe('Cave', () => {
  it('leaves the bed clear for the cat and the mouth open for the player', () => {
    const { cave, colliders } = build();
    expect(cave.bed).toEqual(BED);
    expect(colliders.overlaps(new THREE.Vector3(BED.x, 0, BED.z), BODY_RADIUS)).toBe(false);
    // Walking in from the spawn side: a metre in front of the bed is open too.
    expect(colliders.overlaps(new THREE.Vector3(BED.x, 0, BED.z + 1), CHARACTER_RADIUS)).toBe(false);
  });

  it('blocks the rock on both sides and behind', () => {
    const { colliders } = build();
    const rock: readonly (readonly [number, number])[] = [
      [-4.3, -41.5],
      [4.3, -41.5],
      [0, -46],
    ];
    for (const [x, z] of rock) {
      expect(colliders.overlaps(new THREE.Vector3(x, 0, z), CHARACTER_RADIUS)).toBe(true);
    }
  });

  it('is a keepout around its centre that grows with the margin', () => {
    const { cave } = build();
    expect(cave.contains(CAVE.x, CAVE.z, 0)).toBe(true);
    expect(cave.contains(CAVE.x + CAVE_RADIUS + 0.5, CAVE.z, 0)).toBe(false);
    expect(cave.contains(CAVE.x + CAVE_RADIUS + 0.5, CAVE.z, 1)).toBe(true);
  });

  it('adds one group of shadowed rock to the scene', () => {
    const { scene } = build();
    expect(scene.children).toHaveLength(1);
    const group = scene.children[0];
    if (!group) throw new Error('no cave group');
    expect(group.children.length).toBeGreaterThanOrEqual(5);
  });
});
