import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Colliders } from './collision';
import { seededRandom } from './props';
import { Forest } from './trees';

const FORWARD = new THREE.Vector3(0, 0, -1);

/** Hits it takes to fell a lone tree 2 m ahead of the origin. */
function hitsToFell(damage: number): number {
  const forest = new Forest(new THREE.Scene(), new Colliders());
  forest.plant(0, -2, seededRandom(1));
  for (let hits = 1; hits <= 20; hits++) {
    if (forest.chop(new THREE.Vector3(), FORWARD, damage) === 'felled') return hits;
  }
  throw new Error('tree never fell');
}

describe('Forest.chop', () => {
  it('fells a tree in proportionally fewer hits at higher damage', () => {
    const base = hitsToFell(1);
    expect(base).toBeGreaterThan(1);
    expect(hitsToFell(2)).toBe(Math.ceil(base / 2));
  });

  it('misses when no tree is in reach', () => {
    const forest = new Forest(new THREE.Scene(), new Colliders());
    expect(forest.chop(new THREE.Vector3(), FORWARD, 1)).toBe('miss');
  });
});
