import * as THREE from 'three';
import { woodMat } from './mesh';

const GRAVITY = -9.8;
/** Arrows leave the bow tilted this far above the horizontal forward. */
const LAUNCH_ELEVATION = THREE.MathUtils.degToRad(8);
/** Arrows still airborne after this long are removed. */
const MAX_FLIGHT_TIME = 4;

const headMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.6, roughness: 0.45 });
const shaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6);
const headGeo = new THREE.ConeGeometry(0.03, 0.1, 8);
const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

// Per-frame scratch.
const axis = new THREE.Vector3();
const heading = new THREE.Vector3();

/** Arrow mesh running along +Z with the head at the front; used nocked on the bow and in flight. */
export function buildArrow(): THREE.Object3D {
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(shaftGeo, woodMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.castShadow = true;
  const head = new THREE.Mesh(headGeo, headMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.45;
  head.castShadow = true;
  arrow.add(shaft, head);
  return arrow;
}

/** Flight segment of a live arrow for the frame just simulated. Vectors are reused next frame. */
export interface ArrowPath {
  readonly id: number;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
}

interface Arrow {
  id: number;
  object: THREE.Object3D;
  velocity: THREE.Vector3;
  age: number;
  previous: THREE.Vector3;
}

/** Arrows in flight. Hit-testing lives with the targets; see `update`. */
export class Projectiles {
  private readonly root = new THREE.Group();
  private readonly arrows: Arrow[] = [];
  private nextId = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  get animating(): boolean {
    return this.arrows.length > 0;
  }

  /** Launches an arrow from `origin` along the horizontal `direction`, tilted up by the launch elevation. */
  fire(origin: THREE.Vector3, direction: THREE.Vector3, speed: number): void {
    // Rotating about direction × up lifts the nose without changing the heading.
    axis.crossVectors(direction, UP).normalize();
    const velocity = direction.clone().applyAxisAngle(axis, LAUNCH_ELEVATION).multiplyScalar(speed);
    const object = buildArrow();
    object.position.copy(origin);
    object.quaternion.setFromUnitVectors(FORWARD, heading.copy(velocity).normalize());
    this.root.add(object);
    this.arrows.push({ id: this.nextId++, object, velocity, age: 0, previous: origin.clone() });
  }

  /**
   * Moves every arrow under gravity and returns the segment each one swept this
   * frame so the caller can hit-test them; call `remove` for the ones that connected.
   */
  update(dt: number): ArrowPath[] {
    const paths: ArrowPath[] = [];
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (!a) continue;
      a.previous.copy(a.object.position);
      a.velocity.y += GRAVITY * dt;
      a.object.position.addScaledVector(a.velocity, dt);
      a.object.quaternion.setFromUnitVectors(FORWARD, heading.copy(a.velocity).normalize());
      a.age += dt;
      if (a.age > MAX_FLIGHT_TIME || a.object.position.y < 0) {
        this.destroy(i);
        continue;
      }
      paths.push({ id: a.id, from: a.previous, to: a.object.position });
    }
    return paths;
  }

  remove(id: number): void {
    const i = this.arrows.findIndex((a) => a.id === id);
    if (i >= 0) this.destroy(i);
  }

  private destroy(index: number): void {
    const a = this.arrows[index];
    if (!a) return;
    this.root.remove(a.object);
    this.arrows.splice(index, 1);
  }
}
