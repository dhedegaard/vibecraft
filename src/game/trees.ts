import * as THREE from 'three';
import type { Colliders } from './collision';
import { cutWoodMat, shadowed, woodMat } from './mesh';
import { nearestInCone } from './targeting';
import { applyTopple, beginTopple, type Topple } from './topple';

const HITS_TO_FELL = 3;
const FALL_DURATION = 1.4;
const REST_DURATION = 1.5;
const SINK_DURATION = 1.2;
const SHAKE_DURATION = 0.3;

const leafMats = [0x2d6a2f, 0x3b7d3a, 0x4a8f3c].map(
  (color) => new THREE.MeshStandardMaterial({ color }),
);

// Unit-scale tree parts; each tree scales the whole group uniformly.
const TRUNK_HEIGHT = 1.6;
/** Base radius of the unit trunk, also the collision radius before scaling. */
const TRUNK_RADIUS = 0.25;
const trunkGeo = new THREE.CylinderGeometry(0.15, TRUNK_RADIUS, TRUNK_HEIGHT, 8);
const lowerLeafGeo = new THREE.ConeGeometry(1.2, 2.2, 8);
const upperLeafGeo = new THREE.ConeGeometry(0.8, 1.6, 8);
const STUMP_HEIGHT = 0.35;
const stumpGeo = new THREE.CylinderGeometry(0.22, 0.26, STUMP_HEIGHT, 8);

export interface FelledTree {
  /** Base of the trunk. */
  position: THREE.Vector3;
  /** Horizontal unit vector the trunk now lies along. */
  fallDir: THREE.Vector3;
  scale: number;
}

type TreeState =
  | { kind: 'standing'; shake: number }
  | { kind: 'falling'; t: number; fallDir: THREE.Vector3; topple: Topple }
  | { kind: 'resting'; t: number }
  | { kind: 'sinking'; t: number };

interface Tree {
  group: THREE.Group;
  scale: number;
  health: number;
  state: TreeState;
}

function buildTreeMesh(scale: number, rand: () => number): THREE.Group {
  const tree = new THREE.Group();
  const trunk = shadowed(new THREE.Mesh(trunkGeo, woodMat));
  trunk.position.y = TRUNK_HEIGHT / 2;

  // Two stacked cones of foliage for a low-poly pine look.
  const leafMat = leafMats[Math.floor(rand() * leafMats.length)];
  const lower = shadowed(new THREE.Mesh(lowerLeafGeo, leafMat));
  lower.position.y = TRUNK_HEIGHT + 1.0;
  const upper = shadowed(new THREE.Mesh(upperLeafGeo, leafMat));
  upper.position.y = TRUNK_HEIGHT + 2.4;

  tree.add(trunk, lower, upper);
  tree.scale.setScalar(scale);
  tree.rotation.y = rand() * Math.PI * 2;
  return tree;
}

/** Outcome of one axe hit: `felled` is the hit that starts the fall. */
export type ChopResult = 'miss' | 'hit' | 'felled';

export class Forest {
  private readonly root = new THREE.Group();
  private readonly trees: Tree[] = [];
  private active = false;

  private readonly colliders: Colliders;

  constructor(scene: THREE.Scene, colliders: Colliders) {
    scene.add(this.root);
    this.colliders = colliders;
  }

  /** True while any tree is shaking, falling or sinking. */
  get animating(): boolean {
    return this.active;
  }

  plant(x: number, z: number, rand: () => number): void {
    const scale = 0.8 + rand() * 0.7;
    const group = buildTreeMesh(scale, rand);
    group.position.set(x, 0, z);
    this.root.add(group);
    // The stump stays where the trunk was, so the collider is permanent.
    this.colliders.add({ kind: 'circle', x, z, radius: TRUNK_RADIUS * scale });
    this.trees.push({ group, scale, health: HITS_TO_FELL, state: { kind: 'standing', shake: 0 } });
  }

  /** Applies one axe hit to the closest standing tree in front of `origin`. */
  chop(origin: THREE.Vector3, forward: THREE.Vector3): ChopResult {
    const standing = this.trees.filter((t) => t.state.kind === 'standing');
    const found = nearestInCone(standing, (t) => t.group.position, origin, forward);
    if (!found) return 'miss';
    const tree = found.item;
    this.active = true;

    tree.health -= 1;
    if (tree.health > 0) {
      tree.state = { kind: 'standing', shake: SHAKE_DURATION };
      return 'hit';
    }

    // Fall directly away from the player, hinged at the base.
    const fallDir = found.away.clone();
    tree.state = { kind: 'falling', t: 0, fallDir, topple: beginTopple(tree.group, fallDir) };
    this.addStump(tree);
    return 'felled';
  }

  /** Advances animations; returns trees that hit the ground this frame. */
  update(dt: number): FelledTree[] {
    const felled: FelledTree[] = [];
    let active = false;
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const tree = this.trees[i];
      if (!tree) continue;
      const { group, state } = tree;

      switch (state.kind) {
        case 'standing':
          if (state.shake > 0) {
            state.shake -= dt;
            const k = Math.max(state.shake, 0) / SHAKE_DURATION;
            group.rotation.z = Math.sin(state.shake * 60) * 0.06 * k;
            active = true;
          }
          break;

        case 'falling': {
          state.t += dt;
          const k = Math.min(state.t / FALL_DURATION, 1);
          applyTopple(group, state.topple, k);
          if (k >= 1) {
            tree.state = { kind: 'resting', t: 0 };
            felled.push({ position: group.position.clone(), fallDir: state.fallDir, scale: tree.scale });
          }
          active = true;
          break;
        }

        case 'resting':
          state.t += dt;
          if (state.t >= REST_DURATION) tree.state = { kind: 'sinking', t: 0 };
          active = true;
          break;

        case 'sinking': {
          state.t += dt;
          const k = Math.min(state.t / SINK_DURATION, 1);
          group.position.y = -3 * tree.scale * k;
          if (k >= 1) {
            this.root.remove(group);
            this.trees.splice(i, 1);
          }
          active = true;
          break;
        }
      }
    }
    this.active = active;
    return felled;
  }

  private addStump(tree: Tree): void {
    const stump = shadowed(new THREE.Mesh(stumpGeo, cutWoodMat));
    stump.scale.setScalar(tree.scale);
    stump.position.copy(tree.group.position).setY((STUMP_HEIGHT / 2) * tree.scale);
    this.root.add(stump);
  }
}
