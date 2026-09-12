import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type ArrowPath, buildArrow, Projectiles } from './projectiles';

const DT = 1 / 60;
const ORIGIN = new THREE.Vector3(0, 1.5, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** Fires one arrow and runs it until it is gone; paths are cloned because `update` reuses its vectors. */
function flight(speed: number): { paths: ArrowPath[]; steps: number } {
  const projectiles = new Projectiles(new THREE.Scene());
  projectiles.fire(ORIGIN, FORWARD, speed);
  const paths: ArrowPath[] = [];
  let steps = 0;
  while (projectiles.animating && steps < 10000) {
    for (const p of projectiles.update(DT).paths) paths.push({ id: p.id, from: p.from.clone(), to: p.to.clone() });
    steps++;
  }
  return { paths, steps };
}

function horizontalDistance(p: ArrowPath): number {
  return Math.hypot(p.to.x - ORIGIN.x, p.to.z - ORIGIN.z);
}

describe('Projectiles', () => {
  it('launches upward, then falls and is removed at the ground', () => {
    const { paths } = flight(20);
    const first = paths[0];
    const last = paths.at(-1);
    if (!first || !last) throw new Error('no flight');
    expect(first.to.y).toBeGreaterThan(first.from.y);
    expect(last.to.y).toBeLessThan(last.from.y);
    expect(last.to.y).toBeLessThan(1.5);
  });

  it('flies farther when launched faster', () => {
    const slow = flight(12).paths.at(-1);
    const fast = flight(30).paths.at(-1);
    if (!slow || !fast) throw new Error('no flight');
    expect(horizontalDistance(fast)).toBeGreaterThan(horizontalDistance(slow));
  });

  it('is removed after the maximum flight time even while still airborne', () => {
    // Fast enough that the 8° launch keeps it in the air far longer than 4 s.
    const { steps } = flight(1000);
    // 4 s at 60 fps, allowing one extra step for float accumulation.
    expect(steps).toBeGreaterThanOrEqual(240);
    expect(steps).toBeLessThanOrEqual(241);
  });

  it('reports each arrow every frame until remove() is called', () => {
    const projectiles = new Projectiles(new THREE.Scene());
    projectiles.fire(ORIGIN, FORWARD, 20);
    const { paths } = projectiles.update(DT);
    expect(paths).toHaveLength(1);
    const id = paths[0]?.id;
    if (id === undefined) throw new Error('no path');
    projectiles.remove(id);
    expect(projectiles.animating).toBe(false);
    expect(projectiles.update(DT).paths).toHaveLength(0);
  });

  it('builds an arrow that points along +Z', () => {
    const arrow = buildArrow();
    const box = new THREE.Box3().setFromObject(arrow);
    expect(box.max.z - box.min.z).toBeGreaterThan(box.max.x - box.min.x);
    expect(box.max.z - box.min.z).toBeGreaterThan(box.max.y - box.min.y);
    // Head is at the front: the mesh extends farther forward than back.
    expect(box.max.z).toBeGreaterThan(-box.min.z);
  });
});
