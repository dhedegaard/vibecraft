import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BOULDER_COUNT,
  BOULDER_HIT_POINTS,
  boulderRadius,
  boulderSpots,
  Boulders,
  type Keepout,
  CRUMBLE_DURATION,
  HOUSE_CLEARANCE,
  SPAWN_CLEARANCE,
  STONE_ON_CRUMBLE,
  STONE_PER_HIT,
  type StoneDrop,
} from './boulders';
import { CHARACTER_RADIUS, Colliders } from './collision';
import { seededRandom } from './props';
import { FLAT_TERRAIN, type Terrain } from './terrain';

const DT = 1 / 60;
const ORIGIN = new THREE.Vector3(0, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);
const HOUSE = { x: 12, z: -10 };
const NO_WATER: Keepout = { contains: () => false };

function make(terrain: Terrain = FLAT_TERRAIN): { scene: THREE.Scene; colliders: Colliders; boulders: Boulders } {
  const scene = new THREE.Scene();
  const colliders = new Colliders();
  return { scene, colliders, boulders: new Boulders(scene, colliders, terrain) };
}

/** Chips a boulder dead ahead until it crumbles, running one update per chip like the game loop. */
function chipUntilGone(boulders: Boulders, damage: number): { results: string[]; drops: StoneDrop[] } {
  const results: string[] = [];
  const drops: StoneDrop[] = [];
  for (let i = 0; i < 20; i++) {
    const outcome = boulders.chip(ORIGIN, FORWARD, damage);
    results.push(outcome.result);
    drops.push(...boulders.update(DT));
    if (outcome.result !== 'hit') break;
  }
  return { results, drops };
}

function meshPosition(scene: THREE.Scene): THREE.Vector3 {
  const group = scene.children[0]?.children[0];
  if (!group) throw new Error('no boulder mesh');
  return group.position;
}

describe('Boulders chipping', () => {
  it.each([1, 2])('takes ceil(hit points / damage) hits at damage %i and drops stone accordingly', (damage) => {
    const { boulders } = make();
    boulders.place(0, -2, 1);
    const { results, drops } = chipUntilGone(boulders, damage);

    const hits = Math.ceil(BOULDER_HIT_POINTS / damage);
    expect(results).toHaveLength(hits);
    expect(results.at(-1)).toBe('crumbled');
    expect(results.slice(0, -1).every((r) => r === 'hit')).toBe(true);
    const total = drops.reduce((sum, d) => sum + d.amount, 0);
    expect(total).toBe((hits - 1) * STONE_PER_HIT + STONE_ON_CRUMBLE);
  });

  it('misses a boulder behind the player and leaves it untouched', () => {
    const { boulders } = make();
    boulders.place(0, 2, 1);
    expect(boulders.chip(ORIGIN, FORWARD, 1)).toEqual({ result: 'miss' });
    expect(boulders.update(DT)).toEqual([]);
    expect(boulders.snapshot[0]?.health).toBe(BOULDER_HIT_POINTS);
  });

  it('drops stone on the rim facing the hitter, popping toward them', () => {
    const { boulders } = make();
    boulders.place(0, -2, 1);
    boulders.chip(ORIGIN, FORWARD, 1);
    const [drop] = boulders.update(DT);
    const centre = boulders.snapshot[0];
    if (!drop || !centre) throw new Error('no drop');

    expect(Math.hypot(drop.position.x - centre.x, drop.position.z - centre.z)).toBeCloseTo(centre.radius, 6);
    const toHitter = new THREE.Vector3(ORIGIN.x - centre.x, 0, ORIGIN.z - centre.z).normalize();
    expect(drop.outward.dot(toHitter)).toBeCloseTo(1, 6);
    expect(Math.hypot(drop.position.x, drop.position.z)).toBeLessThan(Math.hypot(centre.x, centre.z));
  });

  it('removes the collider the moment it crumbles and cannot be chipped again meanwhile', () => {
    const { boulders, colliders } = make();
    boulders.place(0, -2, 1);
    expect(colliders.overlaps(new THREE.Vector3(0, 0, -2), CHARACTER_RADIUS)).toBe(true);
    chipUntilGone(boulders, 1);
    expect(colliders.overlaps(new THREE.Vector3(0, 0, -2), CHARACTER_RADIUS)).toBe(false);
    expect(boulders.chip(ORIGIN, FORWARD, 1)).toEqual({ result: 'miss' });
  });
});

describe('Boulders animation', () => {
  it('is idle until pushed, follows the collider, then settles again', () => {
    const { scene, colliders, boulders } = make();
    boulders.place(0, -3, 1);
    boulders.update(DT);
    expect(boulders.animating).toBe(false);

    colliders.resolve(new THREE.Vector3(0, 0, -2), CHARACTER_RADIUS);
    boulders.update(DT);
    expect(boulders.animating).toBe(true);
    expect(meshPosition(scene).z).toBe(boulders.snapshot[0]?.z);
    boulders.update(DT);
    expect(boulders.animating).toBe(false);
  });

  it('wobbles on a hit, crumbles away and then idles with nothing left', () => {
    const { scene, boulders } = make();
    boulders.place(0, -2, 1);
    chipUntilGone(boulders, 1);
    expect(boulders.animating).toBe(true);
    for (let i = 0; i < Math.ceil(CRUMBLE_DURATION / DT) + 2; i++) boulders.update(DT);
    expect(boulders.animating).toBe(false);
    expect(boulders.snapshot).toHaveLength(0);
    expect(scene.children[0]?.children).toHaveLength(0);
  });
});

describe('boulderSpots', () => {
  it('returns the configured count, deterministically', () => {
    const a = boulderSpots(seededRandom(99), new Colliders(), HOUSE, NO_WATER);
    const b = boulderSpots(seededRandom(99), new Colliders(), HOUSE, NO_WATER);
    expect(a).toHaveLength(BOULDER_COUNT);
    expect(a).toEqual(b);
  });

  it('keeps clear of the spawn, the house, trunks and each other', () => {
    const colliders = new Colliders();
    const trees = seededRandom(42);
    for (let i = 0; i < 60; i++) {
      colliders.add({ kind: 'circle', x: (trees() - 0.5) * 120, z: (trees() - 0.5) * 120, radius: 0.3 });
    }
    const spots = boulderSpots(seededRandom(99), colliders, HOUSE, NO_WATER);

    for (const s of spots) {
      const r = boulderRadius(s.scale);
      expect(Math.hypot(s.x, s.z)).toBeGreaterThanOrEqual(SPAWN_CLEARANCE);
      expect(Math.hypot(s.x - HOUSE.x, s.z - HOUSE.z)).toBeGreaterThanOrEqual(HOUSE_CLEARANCE);
      expect(colliders.overlaps(new THREE.Vector3(s.x, 0, s.z), r)).toBe(false);
    }
    for (const [i, a] of spots.entries()) {
      for (const b of spots.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(boulderRadius(a.scale) + boulderRadius(b.scale));
      }
    }
  });

  it('keeps every spot out of a large keepout', () => {
    // Everything with x < 10 counts as water; spots must all land east of it.
    const water: Keepout = { contains: (x) => x < 10 };
    const spots = boulderSpots(seededRandom(99), new Colliders(), HOUSE, water);
    expect(spots).toHaveLength(BOULDER_COUNT);
    for (const s of spots) expect(s.x).toBeGreaterThanOrEqual(10);
  });
});

/** Ground falling away along −Z at 1 in 4. */
const SLOPE: Terrain = { heightAt: (_x, z) => 0.25 * z, surfaceAt: (_x, z) => 0.25 * z, speedFactor: () => 1 };
/** Ground a metre down everywhere. */
const SUNKEN: Terrain = { heightAt: () => -1, surfaceAt: () => -1, speedFactor: () => 1 };

describe('Boulders on uneven ground', () => {
  it('sits on the terrain when placed and follows it when pushed', () => {
    const { scene, colliders, boulders } = make(SLOPE);
    boulders.place(0, -3, 1);
    expect(meshPosition(scene).y).toBeCloseTo(-0.75, 12);

    colliders.resolve(new THREE.Vector3(0, 0, -2), CHARACTER_RADIUS);
    boulders.update(DT);
    const z = boulders.snapshot[0]?.z;
    if (z === undefined) throw new Error('no boulder');
    expect(z).toBeLessThan(-3);
    expect(meshPosition(scene).y).toBeCloseTo(SLOPE.heightAt(0, z), 12);
  });

  it('crumbles down from the terrain height, not from the plain', () => {
    const { scene, boulders } = make(SUNKEN);
    boulders.place(0, -2, 1);
    chipUntilGone(boulders, 1);
    expect(meshPosition(scene).y).toBeLessThan(-1);
    expect(meshPosition(scene).y).toBeGreaterThan(-1.5);
  });
});
