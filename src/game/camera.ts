import * as THREE from 'three';
import type { Input } from './input';

const DISTANCE = 8;
const LOOK_SENSITIVITY = 0.005;
const MIN_PITCH = 0.1;
const MAX_PITCH = 1.2;

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0.45;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  }

  /** Horizontal rotation around the target, used to make movement camera-relative. */
  get yawAngle(): number {
    return this.yaw;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Repositions the camera; returns true if the mouse moved the view this frame. */
  update(input: Input, target: THREE.Vector3): boolean {
    const { x, y } = input.consumeMouseDelta();
    this.yaw -= x * LOOK_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch + y * LOOK_SENSITIVITY, MIN_PITCH, MAX_PITCH);

    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(DISTANCE);

    const focus = target.clone().setY(target.y + 1);
    this.camera.position.copy(focus).add(offset);
    this.camera.lookAt(focus);
    return x !== 0 || y !== 0;
  }
}
