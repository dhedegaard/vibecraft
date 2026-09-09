import * as THREE from 'three';
import { ActionTimer, STRIKE, type Weapon, type WeaponAction } from './weapons';

/** Shoulder angle (rotation.x) for the holding arm: slightly forward of hanging straight down. */
const REST_ANGLE = -0.4;
/** Grip rotation so the blade points forward and up at about 45° when the arm is at rest. */
const GRIP_ANGLE = Math.PI / 4 - REST_ANGLE;

const SWING_DURATION = 0.6;
/** Fraction of the swing spent raising the sword before the strike begins. */
const WIND_UP_POINT = 0.35;
/** Fraction of the swing at which the blade is considered to connect. */
const HIT_POINT = 0.55;
const WIND_UP_ANGLE = 1.4;
const STRIKE_ANGLE = -1.3;
/** Extra wrist rotation at the strike so the blade extends along the arm instead of pointing up. */
const WRIST_STRIKE = Math.PI / 2 + Math.abs(STRIKE_ANGLE) - GRIP_ANGLE;

const steel = new THREE.MeshStandardMaterial({ color: 0xc8ced4, metalness: 0.8, roughness: 0.3 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
const guardMat = new THREE.MeshStandardMaterial({ color: 0x8a7a3a, metalness: 0.6, roughness: 0.4 });

const bladeGeo = new THREE.BoxGeometry(0.06, 0.9, 0.16);
const tipGeo = new THREE.ConeGeometry(0.08, 0.16, 4);
const guardGeo = new THREE.BoxGeometry(0.1, 0.06, 0.4);
const gripGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8);
const pommelGeo = new THREE.SphereGeometry(0.05, 8, 6);

/**
 * Sword model plus swing timing, in the same shape as `Axe`: the holding arm
 * reads `angle` each frame; the wrist rotation is applied to the model here.
 */
export class Sword implements Weapon {
  /** Grip at the origin, blade along +Y. */
  readonly model = new THREE.Group();
  angle = REST_ANGLE;
  private readonly timer = new ActionTimer();

  constructor() {
    const grip = new THREE.Mesh(gripGeo, gripMat);
    const pommel = new THREE.Mesh(pommelGeo, guardMat);
    pommel.position.y = -0.13;
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.y = 0.14;
    const blade = new THREE.Mesh(bladeGeo, steel);
    blade.position.y = 0.14 + 0.45;
    blade.castShadow = true;
    const tip = new THREE.Mesh(tipGeo, steel);
    tip.position.y = 0.14 + 0.9 + 0.08;
    tip.rotation.y = Math.PI / 4;
    tip.scale.set(0.6, 1, 1.4);

    this.model.add(grip, pommel, guard, blade, tip);
    this.model.rotation.x = GRIP_ANGLE;
  }

  get swinging(): boolean {
    return this.timer.active;
  }

  get armLocked(): boolean {
    return this.swinging;
  }

  swing(): void {
    if (!this.swinging) this.timer.start();
  }

  release(): void {
    // A swing runs to completion on its own; nothing to let go of.
  }

  /** Abort mid-swing (e.g. the wielder was staggered) and return to rest. */
  cancel(): void {
    this.timer.stop();
    this.angle = REST_ANGLE;
    this.model.rotation.x = GRIP_ANGLE;
  }

  update(dt: number): WeaponAction | undefined {
    if (!this.swinging) return undefined;
    const t = this.timer.advance(dt, SWING_DURATION);

    let wrist: number;
    if (t < WIND_UP_POINT) {
      const k = t / WIND_UP_POINT;
      this.angle = THREE.MathUtils.lerp(REST_ANGLE, WIND_UP_ANGLE, k);
      wrist = 0;
    } else if (t < HIT_POINT) {
      // Fast, accelerating strike.
      const k = (t - WIND_UP_POINT) / (HIT_POINT - WIND_UP_POINT);
      this.angle = THREE.MathUtils.lerp(WIND_UP_ANGLE, STRIKE_ANGLE, k * k);
      wrist = WRIST_STRIKE * k;
    } else {
      const k = (t - HIT_POINT) / (1 - HIT_POINT);
      this.angle = THREE.MathUtils.lerp(STRIKE_ANGLE, REST_ANGLE, k);
      wrist = WRIST_STRIKE * (1 - k);
    }
    this.model.rotation.x = GRIP_ANGLE + wrist;

    const hit = this.timer.crossed(HIT_POINT);
    if (t >= 1) this.cancel();
    return hit ? STRIKE : undefined;
  }
}
