import * as THREE from 'three';
import type { Weapon } from './weapons';

const SWING_DURATION = 0.4;
/** Fraction of the swing at which the blade is considered to connect. */
const HIT_POINT = 0.45;
/** Shoulder angles (rotation.x of the holding arm): positive swings the arm back/up. */
const REST_ANGLE = 0.35;
const WIND_UP_ANGLE = 2.8;
const CHOP_ANGLE = -0.9;
/** Grip rotation so the handle points straight forward at the moment of the chop. */
const GRIP_ANGLE = Math.PI / 2 - CHOP_ANGLE;

/**
 * Axe model plus swing timing. It does not move itself: the holding arm reads
 * `angle` each frame and rotates its shoulder by it.
 */
export class Axe implements Weapon {
  /** Grip at the origin, handle along +Y. Attach to a hand. */
  readonly model = new THREE.Group();
  angle = REST_ANGLE;
  private swingTime = -1;
  private hitFired = false;

  constructor() {
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
    );
    handle.position.y = 0.35;
    handle.castShadow = true;

    const steel = new THREE.MeshStandardMaterial({ color: 0xb0b7bf, metalness: 0.7, roughness: 0.35 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.3), steel);
    head.position.set(0, 0.75, 0.12);
    head.castShadow = true;

    // Tapered blade edge in front of the head.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.12), steel);
    blade.position.set(0, 0.75, 0.32);

    this.model.add(handle, head, blade);
    this.model.rotation.x = GRIP_ANGLE;
  }

  get swinging(): boolean {
    return this.swingTime >= 0;
  }

  /** The arm swings with the walk except while chopping. */
  get armLocked(): boolean {
    return this.swinging;
  }

  swing(): boolean {
    if (this.swinging) return false;
    this.swingTime = 0;
    this.hitFired = false;
    return true;
  }

  /** Advances the swing; returns true on the single frame the blade connects. */
  update(dt: number): boolean {
    if (!this.swinging) return false;

    this.swingTime += dt;
    const t = Math.min(this.swingTime / SWING_DURATION, 1);

    if (t < HIT_POINT) {
      // Quick wind-up back, then accelerate into the chop.
      const k = t / HIT_POINT;
      this.angle = THREE.MathUtils.lerp(WIND_UP_ANGLE, CHOP_ANGLE, k * k);
    } else {
      const k = (t - HIT_POINT) / (1 - HIT_POINT);
      this.angle = THREE.MathUtils.lerp(CHOP_ANGLE, REST_ANGLE, k);
    }

    let hit = false;
    if (!this.hitFired && t >= HIT_POINT) {
      this.hitFired = true;
      hit = true;
    }
    if (t >= 1) {
      this.swingTime = -1;
      this.angle = REST_ANGLE;
    }
    return hit;
  }
}
