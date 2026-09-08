import * as THREE from 'three';
import { Arms } from './arms';
import { Axe } from './axe';
import type { Input } from './input';
import { Legs } from './legs';

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
  private readonly legs = new Legs();
  private readonly arms: Arms;
  private readonly velocity = new THREE.Vector3();
  private grounded = true;

  constructor() {
    // The capsule body sits on top of the legs; its bottom cap starts at the hips.
    const hip = Legs.HIP_HEIGHT;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6b35 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 8, 16), bodyMat);
    body.position.y = hip + 0.7;
    body.castShadow = true;

    const face = new THREE.Group();
    face.position.y = hip + 1.0;

    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    );
    nose.position.set(0, -0.02, 0.44);
    face.add(nose);

    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = new THREE.SphereGeometry(0.09, 12, 10);
    const pupilGeo = new THREE.SphereGeometry(0.045, 8, 8);
    for (const x of [-0.16, 0.16]) {
      const eye = new THREE.Mesh(eyeGeo, eyeWhite);
      eye.position.set(x, 0.18, 0.34);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(0, 0, 0.065);
      eye.add(pupil);
      face.add(eye);
    }

    this.legs.root.position.y = hip;

    this.arms = new Arms(this.axe.model);
    this.arms.root.position.y = hip + 1.15;

    this.object.add(body, face, this.legs.root, this.arms.root);
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

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const legsMoved = this.legs.update(dt, speed, this.grounded);
    // The right arm follows the axe swing; otherwise both arms swing with the walk.
    this.arms.update(this.legs.swingAngle, this.axe.angle, this.axe.swinging);

    const active =
      hit ||
      legsMoved ||
      wasSwinging ||
      this.axe.swinging ||
      !this.grounded ||
      this.object.rotation.y !== yawBefore ||
      !this.object.position.equals(before);
    return { hit, active };
  }
}
