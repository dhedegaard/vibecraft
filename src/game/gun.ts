import * as THREE from 'three';
import type { Weapon } from './weapons';

/** Shoulder angle (rotation.x) while aiming: arm raised forward, a little below horizontal. */
const AIM_ANGLE = -1.35;
/** Grip rotation so the barrel points straight forward at the aim angle. */
const GRIP_ANGLE = Math.PI / 2 - AIM_ANGLE;
const RECOIL_DURATION = 0.3;
/** Fraction of the recoil spent kicking up before easing back. */
const KICK_POINT = 0.2;
/** Extra shoulder lift at the peak of the recoil. */
const KICK_ANGLE = 0.3;
/** Barrel tilt at the peak of the recoil. */
const KICK_TILT = 0.25;

const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.6, roughness: 0.45 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 });

const receiverGeo = new THREE.BoxGeometry(0.09, 0.42, 0.14);
const barrelGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10);
const sightGeo = new THREE.BoxGeometry(0.04, 0.08, 0.05);
const gripGeo = new THREE.BoxGeometry(0.07, 0.12, 0.2);

/**
 * Short rifle plus recoil timing, in the same shape as `Axe`. `swing` fires:
 * `update` reports true on the firing frame; the recoil then lifts the arm.
 */
export class Gun implements Weapon {
  /** Grip at the origin, barrel along +Y, grip hanging along +Z. Attach to a hand. */
  readonly model = new THREE.Group();
  /** Barrel tip; read its world position to spawn projectiles. */
  readonly muzzle = new THREE.Object3D();
  angle = AIM_ANGLE;
  readonly armLocked = true;
  private recoilTime = -1;
  private pendingShot = false;

  constructor() {
    const receiver = new THREE.Mesh(receiverGeo, metal);
    receiver.position.set(0, 0.15, -0.02);
    receiver.castShadow = true;
    const barrel = new THREE.Mesh(barrelGeo, metal);
    barrel.position.set(0, 0.56, -0.02);
    barrel.castShadow = true;
    // Top of the gun is −Z in this frame (world up when aimed).
    const sight = new THREE.Mesh(sightGeo, metal);
    sight.position.set(0, 0.3, -0.11);
    const grip = new THREE.Mesh(gripGeo, wood);
    grip.position.set(0, -0.02, 0.1);
    grip.rotation.x = -0.3;
    this.muzzle.position.set(0, 0.81, -0.02);

    this.model.add(receiver, barrel, sight, grip, this.muzzle);
    this.model.rotation.x = GRIP_ANGLE;
  }

  get swinging(): boolean {
    return this.recoilTime >= 0;
  }

  swing(): boolean {
    if (this.swinging) return false;
    this.recoilTime = 0;
    this.pendingShot = true;
    return true;
  }

  /** Advances the recoil; returns true on the single frame the shot is fired. */
  update(dt: number): boolean {
    if (!this.swinging) return false;

    const fired = this.pendingShot;
    this.pendingShot = false;

    this.recoilTime += dt;
    const t = Math.min(this.recoilTime / RECOIL_DURATION, 1);
    const kick = t < KICK_POINT ? t / KICK_POINT : 1 - (t - KICK_POINT) / (1 - KICK_POINT);
    this.angle = AIM_ANGLE - KICK_ANGLE * kick;
    this.model.rotation.x = GRIP_ANGLE - KICK_TILT * kick;

    if (t >= 1) {
      this.recoilTime = -1;
      this.angle = AIM_ANGLE;
      this.model.rotation.x = GRIP_ANGLE;
    }
    return fired;
  }
}
