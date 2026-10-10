import * as THREE from 'three';
import type { CircleCollider, Colliders } from './collision';
import { shadowed, stoneMat } from './mesh';
import { nearestInCone } from './targeting';
import type { Terrain } from './terrain';

/** Hit points of a fresh boulder; each axe hit takes off the axe's damage. */
export const BOULDER_HIT_POINTS = 4;
/** Stone a plain hit drops, and what the crumbling hit drops (its own plus a bonus). */
export const STONE_PER_HIT = 1;
export const STONE_ON_CRUMBLE = 2;
export const CRUMBLE_DURATION = 0.4;
export const BOULDER_COUNT = 10;
export const SPAWN_CLEARANCE = 8;
export const HOUSE_CLEARANCE = 8;

const WOBBLE_DURATION = 0.3;
const WOBBLE_ANGLE = 0.05;
const RADIUS_PER_SCALE = 0.9;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.2;
const WORLD_EXTENT = 120;
/** Gap kept between a boulder and a trunk or another boulder when placing. */
const PLACE_MARGIN = 0.5;

export function boulderRadius(scale: number): number {
  return RADIUS_PER_SCALE * scale;
}

// Unit rock; each boulder scales the whole group.
const rockGeo = new THREE.IcosahedronGeometry(1, 1);
const placeProbe = new THREE.Vector3();

export interface StoneDrop {
  /** Where the stone appears: the boulder's rim on the hitter's side. */
  position: THREE.Vector3;
  /** Horizontal unit vector from the boulder towards the hitter; stones pop this way. */
  outward: THREE.Vector3;
  amount: number;
}

export type ChipOutcome = { result: 'miss' } | { result: 'hit' | 'crumbled'; at: THREE.Vector3 };

export interface BoulderInfo {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly health: number;
}

type BoulderState = { kind: 'intact'; wobble: number } | { kind: 'crumbling'; t: number };

interface Boulder {
  group: THREE.Group;
  collider: CircleCollider;
  scale: number;
  health: number;
  state: BoulderState;
}

export class Boulders {
  private readonly root = new THREE.Group();
  private readonly boulders: Boulder[] = [];
  private readonly colliders: Colliders;
  private readonly terrain: Terrain;
  private pending: StoneDrop[] = [];
  private active = false;

  constructor(scene: THREE.Scene, colliders: Colliders, terrain: Terrain) {
    scene.add(this.root);
    this.colliders = colliders;
    this.terrain = terrain;
  }

  /** True while a boulder is wobbling, crumbling or was moved since the last sync. */
  get animating(): boolean {
    return this.active;
  }

  /** Read-only view of every boulder still in the world (crumbling ones included). */
  get snapshot(): BoulderInfo[] {
    return this.boulders.map((b) => ({ x: b.collider.x, z: b.collider.z, radius: b.collider.radius, health: b.health }));
  }

  place(x: number, z: number, scale: number): void {
    const rock = shadowed(new THREE.Mesh(rockGeo, stoneMat));
    // Squashed and sunk into the ground.
    rock.scale.set(1, 0.75, 1);
    rock.position.y = 0.55;
    const group = new THREE.Group();
    group.add(rock);
    group.scale.setScalar(scale);
    group.position.set(x, this.terrain.heightAt(x, z), z);
    group.rotation.y = x + z;
    this.root.add(group);

    const collider: CircleCollider = { kind: 'circle', x, z, radius: boulderRadius(scale), pushable: true };
    this.colliders.add(collider);
    this.boulders.push({ group, collider, scale, health: BOULDER_HIT_POINTS, state: { kind: 'intact', wobble: 0 } });
  }

  /** Applies one axe hit of `damage` to the closest intact boulder in front of `origin`. */
  chip(origin: THREE.Vector3, forward: THREE.Vector3, damage: number): ChipOutcome {
    const intact = this.boulders.filter((b) => b.state.kind === 'intact');
    const found = nearestInCone(intact, (b) => b.group.position, origin, forward);
    if (!found) return { result: 'miss' };
    const boulder = found.item;

    // `away` points hitter → boulder; the stone appears on the hitter's side of the rim.
    const outward = found.away.clone().negate();
    const position = boulder.group.position.clone().addScaledVector(outward, boulder.collider.radius);
    const at = boulder.group.position.clone();
    this.active = true;
    boulder.health -= damage;

    if (boulder.health > 0) {
      boulder.state = { kind: 'intact', wobble: WOBBLE_DURATION };
      this.pending.push({ position, outward, amount: STONE_PER_HIT });
      return { result: 'hit', at };
    }
    boulder.state = { kind: 'crumbling', t: 0 };
    // Free the spot at once so nothing is blocked by a vanishing rock.
    this.colliders.remove(boulder.collider);
    this.pending.push({ position, outward, amount: STONE_ON_CRUMBLE });
    return { result: 'crumbled', at };
  }

  /** Syncs meshes to their colliders and advances wobbles and crumbles; returns the stone drops queued by `chip`. */
  update(dt: number): StoneDrop[] {
    let active = false;
    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const boulder = this.boulders[i];
      if (!boulder) continue;
      const { group, collider, state } = boulder;

      if (group.position.x !== collider.x || group.position.z !== collider.z) {
        // Follows the collider across the plain and down a pond's slope (no tilt, no rolling).
        group.position.set(collider.x, this.terrain.heightAt(collider.x, collider.z), collider.z);
        active = true;
      }

      switch (state.kind) {
        case 'intact':
          if (state.wobble > 0) {
            state.wobble -= dt;
            const k = Math.max(state.wobble, 0) / WOBBLE_DURATION;
            group.rotation.z = Math.sin(state.wobble * 60) * WOBBLE_ANGLE * k;
            active = true;
          }
          break;

        case 'crumbling': {
          state.t += dt;
          const k = Math.min(state.t / CRUMBLE_DURATION, 1);
          group.scale.setScalar(boulder.scale * (1 - k));
          group.position.y = this.terrain.heightAt(collider.x, collider.z) - 0.5 * boulder.scale * k;
          if (k >= 1) {
            this.root.remove(group);
            this.boulders.splice(i, 1);
          }
          active = true;
          break;
        }
      }
    }
    this.active = active;
    const drops = this.pending;
    this.pending = [];
    return drops;
  }
}

/** Ground boulders must stay off (a pond, the cave); `margin` grows it, as `Ponds.contains` does. */
export interface Keepout {
  contains(x: number, z: number, margin: number): boolean;
}

export interface BoulderSpot {
  x: number;
  z: number;
  scale: number;
}

/**
 * Rejection-samples `BOULDER_COUNT` spots clear of the spawn, the house, every collider already
 * registered (trunks, the house, the cave), each `keepouts` entry and each other. Call after the trees are planted.
 */
export function boulderSpots(
  rand: () => number,
  colliders: Colliders,
  house: { readonly x: number; readonly z: number },
  keepouts: readonly Keepout[],
): BoulderSpot[] {
  const spots: BoulderSpot[] = [];
  while (spots.length < BOULDER_COUNT) {
    const x = (rand() - 0.5) * WORLD_EXTENT;
    const z = (rand() - 0.5) * WORLD_EXTENT;
    const scale = MIN_SCALE + rand() * (MAX_SCALE - MIN_SCALE);
    if (Math.hypot(x, z) < SPAWN_CLEARANCE) continue;
    if (Math.hypot(x - house.x, z - house.z) < HOUSE_CLEARANCE) continue;
    const radius = boulderRadius(scale);
    if (colliders.overlaps(placeProbe.set(x, 0, z), radius + PLACE_MARGIN)) continue;
    if (keepouts.some((k) => k.contains(x, z, radius + PLACE_MARGIN))) continue;
    const crowded = spots.some(
      (s) => Math.hypot(s.x - x, s.z - z) < boulderRadius(s.scale) + radius + PLACE_MARGIN,
    );
    if (crowded) continue;
    spots.push({ x, z, scale });
  }
  return spots;
}
