import * as THREE from 'three';
import type { InputState } from './input';
import { settle } from './motion';

const DEFAULT_DISTANCE = 8;
const MIN_DISTANCE = 2;
const MAX_DISTANCE = 25;
/** Distance scales by e^(pixels · this) per wheel scroll: a 100 px notch zooms ~12 %, the same near and far. */
const ZOOM_SENSITIVITY = 0.0012;
/** Easing rate toward the target distance (per second); settles in ~0.15 s. */
const ZOOM_RATE = 20;
const LOOK_SENSITIVITY = 0.005;
const MIN_PITCH = 0.1;
const MAX_PITCH = 1.2;

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0.45;
  private distance = DEFAULT_DISTANCE;
  private targetDistance = DEFAULT_DISTANCE;
  private readonly offset = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  }

  /** Horizontal rotation around the target, used to make movement camera-relative. */
  get yawAngle(): number {
    return this.yaw;
  }

  /** The point the camera orbits and looks at: a metre above the target, about head height. */
  get focus(): Readonly<THREE.Vector3> {
    return this.lookAt;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Repositions the camera; returns true if a drag or zoom moved the view this frame. */
  update(input: InputState, target: THREE.Vector3, dt: number): boolean {
    const { x, y } = input.consumeMouseDelta();
    this.yaw -= x * LOOK_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch + y * LOOK_SENSITIVITY, MIN_PITCH, MAX_PITCH);

    const zoom = input.consumeZoom();
    if (zoom !== 0) {
      this.targetDistance = THREE.MathUtils.clamp(
        this.targetDistance * Math.exp(zoom * ZOOM_SENSITIVITY),
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
    }
    const distanceBefore = this.distance;
    this.distance = settle(this.distance, this.targetDistance, ZOOM_RATE, dt);

    const offset = this.offset
      .set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
      .multiplyScalar(this.distance);
    const focus = this.lookAt.copy(target).setY(target.y + 1);
    this.camera.position.copy(focus).add(offset);
    this.camera.lookAt(focus);
    return x !== 0 || y !== 0 || this.distance !== distanceBefore;
  }
}
