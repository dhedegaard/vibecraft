import * as THREE from 'three';

const HITS_TO_FELL = 3;
const CHOP_REACH = 2.8;
/** Cosine of the half-angle in front of the player that a chop can reach. */
const CHOP_FACING = 0.4;
const FALL_DURATION = 1.4;
const REST_DURATION = 1.5;
const SINK_DURATION = 1.2;
const SHAKE_DURATION = 0.3;

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
const stumpMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a });
const leafMats = [0x2d6a2f, 0x3b7d3a, 0x4a8f3c].map(
  (color) => new THREE.MeshStandardMaterial({ color }),
);

export interface FelledTree {
  /** Base of the trunk. */
  position: THREE.Vector3;
  /** Horizontal unit vector the trunk now lies along. */
  fallDir: THREE.Vector3;
  scale: number;
}

type TreeState =
  | { kind: 'standing'; shake: number }
  | { kind: 'falling'; t: number; fallDir: THREE.Vector3; axis: THREE.Vector3; upright: THREE.Quaternion }
  | { kind: 'resting'; t: number }
  | { kind: 'sinking'; t: number };

interface Tree {
  group: THREE.Group;
  scale: number;
  health: number;
  state: TreeState;
}

function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildTreeMesh(scale: number, rand: () => number): THREE.Group {
  const tree = new THREE.Group();
  const trunkHeight = 1.6 * scale;

  const trunk = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, trunkHeight, 8), trunkMat),
  );
  trunk.position.y = trunkHeight / 2;
  tree.add(trunk);

  // Two stacked cones of foliage for a low-poly pine look.
  const leafMat = leafMats[Math.floor(rand() * leafMats.length)];
  const lower = shadowed(new THREE.Mesh(new THREE.ConeGeometry(1.2 * scale, 2.2 * scale, 8), leafMat));
  lower.position.y = trunkHeight + 1.0 * scale;
  const upper = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.8 * scale, 1.6 * scale, 8), leafMat));
  upper.position.y = trunkHeight + 2.4 * scale;
  tree.add(lower, upper);

  tree.rotation.y = rand() * Math.PI * 2;
  return tree;
}

export class Forest {
  readonly root = new THREE.Group();
  private readonly trees: Tree[] = [];
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.root);
  }

  get standingCount(): number {
    return this.trees.filter((t) => t.state.kind === 'standing').length;
  }

  plant(x: number, z: number, rand: () => number): void {
    const scale = 0.8 + rand() * 0.7;
    const group = buildTreeMesh(scale, rand);
    group.position.set(x, 0, z);
    this.root.add(group);
    this.trees.push({ group, scale, health: HITS_TO_FELL, state: { kind: 'standing', shake: 0 } });
  }

  /** Applies one axe hit to the closest standing tree in front of `origin`. Returns true if one was hit. */
  chop(origin: THREE.Vector3, forward: THREE.Vector3): boolean {
    let best: Tree | undefined;
    let bestDist = Infinity;
    const toTree = new THREE.Vector3();

    for (const tree of this.trees) {
      if (tree.state.kind !== 'standing') continue;
      toTree.subVectors(tree.group.position, origin).setY(0);
      const dist = toTree.length();
      if (dist > CHOP_REACH || dist >= bestDist) continue;
      if (toTree.normalize().dot(forward) < CHOP_FACING) continue;
      best = tree;
      bestDist = dist;
    }
    if (!best) return false;

    best.health -= 1;
    if (best.health > 0) {
      best.state = { kind: 'standing', shake: SHAKE_DURATION };
      return true;
    }

    // Fall directly away from the player, hinged at the base.
    const fallDir = new THREE.Vector3().subVectors(best.group.position, origin).setY(0).normalize();
    const axis = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, fallDir).normalize();
    best.state = { kind: 'falling', t: 0, fallDir, axis, upright: best.group.quaternion.clone() };
    this.addStump(best);
    return true;
  }

  /** Advances animations; returns trees that hit the ground this frame. */
  update(dt: number): FelledTree[] {
    const felled: FelledTree[] = [];
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
          }
          break;

        case 'falling': {
          state.t += dt;
          const k = Math.min(state.t / FALL_DURATION, 1);
          // Ease-in: slow start, fast finish, like gravity taking over.
          const angle = (Math.PI / 2 - 0.05) * k * k;
          const fall = new THREE.Quaternion().setFromAxisAngle(state.axis, angle);
          group.quaternion.copy(fall).multiply(state.upright);
          if (k >= 1) {
            tree.state = { kind: 'resting', t: 0 };
            felled.push({ position: group.position.clone(), fallDir: state.fallDir, scale: tree.scale });
          }
          break;
        }

        case 'resting':
          state.t += dt;
          if (state.t >= REST_DURATION) tree.state = { kind: 'sinking', t: 0 };
          break;

        case 'sinking': {
          state.t += dt;
          const k = Math.min(state.t / SINK_DURATION, 1);
          group.position.y = -3 * tree.scale * k;
          if (k >= 1) {
            this.root.remove(group);
            this.trees.splice(i, 1);
          }
          break;
        }
      }
    }
    return felled;
  }

  private addStump(tree: Tree): void {
    const height = 0.35 * tree.scale;
    const stump = shadowed(
      new THREE.Mesh(new THREE.CylinderGeometry(0.22 * tree.scale, 0.26 * tree.scale, height, 8), stumpMat),
    );
    stump.position.copy(tree.group.position).setY(height / 2);
    this.scene.add(stump);
  }
}
