import * as THREE from 'three';
import type { ItemKind } from './items';
import type { FelledTree } from './trees';

const GRAVITY = -14;
const BOUNCE = 0.35;
const PICKUP_RADIUS = 1.4;
const COLLECT_DURATION = 0.25;

const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
const cutMat = new THREE.MeshStandardMaterial({ color: 0xc9a878 });
const seedMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.6 });
const seedCapMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a });

const logGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.9, 10);
const seedGeo = new THREE.SphereGeometry(0.13, 10, 8);
const seedCapGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.08, 8);

type DropState =
  | { kind: 'flying'; velocity: THREE.Vector3 }
  | { kind: 'resting' }
  | { kind: 'collecting'; t: number; from: THREE.Vector3 };

interface Drop {
  item: ItemKind;
  object: THREE.Object3D;
  restHeight: number;
  state: DropState;
}

function buildLog(): THREE.Object3D {
  const log = new THREE.Mesh(logGeo, [barkMat, cutMat, cutMat]);
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
  const cap = new THREE.Mesh(seedCapGeo, seedCapMat);
  cap.position.y = 0.11;
  seed.rotation.y = Math.random() * Math.PI * 2;
  seed.add(body, cap);
  return seed;
}

export class Drops {
  private readonly root = new THREE.Group();
  private readonly drops: Drop[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  /** True while any drop is in flight or being collected. */
  get animating(): boolean {
    return this.drops.some((d) => d.state.kind !== 'resting');
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

  spawn(item: ItemKind, at: THREE.Vector3, pop: number): void {
    const object = item === 'log' ? buildLog() : buildSeed();
    const restHeight = item === 'log' ? 0.18 : 0.13;
    object.position.copy(at).setY(1.2);
    this.root.add(object);

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
          break;
        }

        case 'resting': {
          const dx = object.position.x - playerPos.x;
          const dz = object.position.z - playerPos.z;
          if (Math.hypot(dx, dz) < PICKUP_RADIUS && playerPos.y < 1.5) {
            drop.state = { kind: 'collecting', t: 0, from: object.position.clone() };
          }
          break;
        }

        case 'collecting': {
          state.t += dt;
          const k = Math.min(state.t / COLLECT_DURATION, 1);
          const target = playerPos.clone().setY(playerPos.y + 1);
          object.position.lerpVectors(state.from, target, k);
          object.scale.setScalar(1 - k);
          if (k >= 1) {
            this.root.remove(object);
            this.drops.splice(i, 1);
            collected.push(drop.item);
          }
          break;
        }
      }
    }

    return collected;
  }
}
