import * as THREE from 'three';
import type { DroppedKind, ItemKind } from './items';
import { boneMat, cutWoodMat, woodMat } from './mesh';
import type { FelledTree } from './trees';

const GRAVITY = -14;
const BOUNCE = 0.35;
const PICKUP_RADIUS_SQ = 1.4 * 1.4;
const COLLECT_DURATION = 0.25;

const cutMat = new THREE.MeshStandardMaterial({ color: 0xc9a878 });
const seedMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.6 });

// The radius each item rests on doubles as its resting height above the ground.
const LOG_RADIUS = 0.18;
const SEED_RADIUS = 0.13;
const BONE_KNOB_RADIUS = 0.08;
const logGeo = new THREE.CylinderGeometry(LOG_RADIUS, LOG_RADIUS, 0.9, 10);
const seedGeo = new THREE.SphereGeometry(SEED_RADIUS, 10, 8);
const seedCapGeo = new THREE.CylinderGeometry(0.1, SEED_RADIUS, 0.08, 8);
const boneShaftGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
const boneKnobGeo = new THREE.SphereGeometry(BONE_KNOB_RADIUS, 8, 6);

const collectTarget = new THREE.Vector3();

type DropState =
  | { kind: 'flying'; velocity: THREE.Vector3 }
  | { kind: 'resting' }
  | { kind: 'collecting'; t: number; from: THREE.Vector3 };

interface Drop {
  item: DroppedKind;
  object: THREE.Object3D;
  restHeight: number;
  state: DropState;
}

function buildLog(): THREE.Object3D {
  const log = new THREE.Mesh(logGeo, [woodMat, cutMat, cutMat]);
  log.castShadow = true;
  log.rotation.z = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(log);
  holder.rotation.y = Math.random() * Math.PI;
  return holder;
}

function buildSeed(): THREE.Object3D {
  const seed = new THREE.Group();
  const body = new THREE.Mesh(seedGeo, seedMat);
  body.castShadow = true;
  const cap = new THREE.Mesh(seedCapGeo, cutWoodMat);
  cap.position.y = 0.11;
  seed.rotation.y = Math.random() * Math.PI * 2;
  seed.add(body, cap);
  return seed;
}

function buildBone(): THREE.Object3D {
  const bone = new THREE.Group();
  const shaft = new THREE.Mesh(boneShaftGeo, boneMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.castShadow = true;
  bone.add(shaft);
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.05, 0.05]) {
      const knob = new THREE.Mesh(boneKnobGeo, boneMat);
      knob.position.set(x, 0, z);
      bone.add(knob);
    }
  }
  bone.rotation.y = Math.random() * Math.PI;
  return bone;
}

const MODELS: Record<DroppedKind, { build: () => THREE.Object3D; restHeight: number }> = {
  log: { build: buildLog, restHeight: LOG_RADIUS },
  seed: { build: buildSeed, restHeight: SEED_RADIUS },
  bone: { build: buildBone, restHeight: BONE_KNOB_RADIUS },
};

export class Drops {
  private readonly root = new THREE.Group();
  private readonly drops: Drop[] = [];
  private active = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  /** True while any drop is in flight or being collected. */
  get animating(): boolean {
    return this.active;
  }

  /** Scatter logs along the fallen trunk and seeds near the crown. */
  spawnFromTree({ position, fallDir, scale }: FelledTree): void {
    const logs = 2 + Math.round(scale);
    for (let i = 0; i < logs; i++) {
      const along = (0.8 + i * 0.9) * scale;
      const p = position.clone().addScaledVector(fallDir, along);
      this.spawn('log', p, 0.6);
    }

    const seeds = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < seeds; i++) {
      const along = (3 + Math.random()) * scale;
      const p = position.clone().addScaledVector(fallDir, along);
      this.spawn('seed', p, 1.2);
    }
  }

  /** Scatter a few bones where a skeleton collapsed. */
  spawnFromSkeleton(position: THREE.Vector3): void {
    const bones = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < bones; i++) this.spawn('bone', position, 1.5);
  }

  private spawn(item: DroppedKind, at: THREE.Vector3, pop: number): void {
    const { build, restHeight } = MODELS[item];
    const object = build();
    object.position.copy(at).setY(1.2);
    this.root.add(object);
    this.active = true;

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2 * pop,
      2 + Math.random() * 2,
      (Math.random() - 0.5) * 2 * pop,
    );
    this.drops.push({ item, object, restHeight, state: { kind: 'flying', velocity } });
  }

  /** Advances drops; returns the kinds picked up this frame. */
  update(dt: number, playerPos: THREE.Vector3): ItemKind[] {
    const collected: ItemKind[] = [];
    let active = false;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      if (!drop) continue;
      const { object, state } = drop;

      switch (state.kind) {
        case 'flying': {
          state.velocity.y += GRAVITY * dt;
          object.position.addScaledVector(state.velocity, dt);
          if (object.position.y <= drop.restHeight) {
            object.position.y = drop.restHeight;
            if (Math.abs(state.velocity.y) < 1) {
              drop.state = { kind: 'resting' };
            } else {
              state.velocity.y *= -BOUNCE;
              state.velocity.x *= 0.6;
              state.velocity.z *= 0.6;
            }
          }
          active = true;
          break;
        }

        case 'resting': {
          const dx = object.position.x - playerPos.x;
          const dz = object.position.z - playerPos.z;
          if (dx * dx + dz * dz < PICKUP_RADIUS_SQ && playerPos.y < 1.5) {
            drop.state = { kind: 'collecting', t: 0, from: object.position.clone() };
            active = true;
          }
          break;
        }

        case 'collecting': {
          state.t += dt;
          const k = Math.min(state.t / COLLECT_DURATION, 1);
          const target = collectTarget.copy(playerPos).setY(playerPos.y + 1);
          object.position.lerpVectors(state.from, target, k);
          object.scale.setScalar(1 - k);
          if (k >= 1) {
            this.root.remove(object);
            this.drops.splice(i, 1);
            collected.push(drop.item);
          }
          active = true;
          break;
        }
      }
    }

    this.active = active;
    return collected;
  }
}
