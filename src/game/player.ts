import * as THREE from 'three';
import { Axe } from './axe';
import type { Input } from './input';

const MOVE_SPEED = 6;
const JUMP_SPEED = 7;
const GRAVITY = -20;
const TURN_SPEED = 12;

export interface PlayerUpdate {
  /** True on the frame an axe swing connects. */
  hit: boolean;
  /** True if the character moved or animated this frame. */
  active: boolean;
}

export class Player {
  readonly object = new THREE.Group();
  private readonly axe = new Axe();
  private readonly velocity = new THREE.Vector3();
  private grounded = true;

  constructor() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6b35 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 8, 16), bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;

    // A small nose so the facing direction is visible.
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    );
    nose.position.set(0, 1.1, 0.45);

    // Hold the axe at the right shoulder so it swings forward and down.
    this.axe.pivot.position.set(0.5, 1.2, 0.1);

    this.object.add(body, nose, this.axe.pivot);
  }

  /** Horizontal unit vector the character is facing. */
  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.object.rotation.y), 0, Math.cos(this.object.rotation.y));
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  update(dt: number, input: Input, cameraYaw: number): PlayerUpdate {
    const wasSwinging = this.axe.swinging;
    const before = this.object.position.clone();
    const yawBefore = this.object.rotation.y;
    const dir = new THREE.Vector3(
      (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0),
      0,
      (input.isHeld('back') ? 1 : 0) - (input.isHeld('forward') ? 1 : 0),
    );

    if (dir.lengthSq() > 0) {
      // Move relative to where the camera is looking.
      dir.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, cameraYaw);
      this.velocity.x = dir.x * MOVE_SPEED;
      this.velocity.z = dir.z * MOVE_SPEED;

      const targetYaw = Math.atan2(dir.x, dir.z);
      const current = this.object.rotation.y;
      let diff = targetYaw - current;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.object.rotation.y = current + diff * Math.min(1, TURN_SPEED * dt);
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    if (this.grounded && input.isHeld('jump')) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
    }

    this.velocity.y += GRAVITY * dt;
    this.object.position.addScaledVector(this.velocity, dt);

    if (this.object.position.y <= 0) {
      this.object.position.y = 0;
      this.velocity.y = 0;
      this.grounded = true;
    }

    if (input.consumeChop()) this.axe.swing();
    const hit = this.axe.update(dt);

    const active =
      hit ||
      wasSwinging ||
      this.axe.swinging ||
      !this.grounded ||
      this.object.rotation.y !== yawBefore ||
      !this.object.position.equals(before);
    return { hit, active };
  }
}
