import * as THREE from 'three';
import { woodMat } from './mesh';
import { ActionTimer, type Weapon, type WeaponAction } from './weapons';

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

const receiverGeo = new THREE.BoxGeometry(0.09, 0.42, 0.14);
const barrelGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10);
const sightGeo = new THREE.BoxGeometry(0.04, 0.08, 0.05);
const gripGeo = new THREE.BoxGeometry(0.07, 0.12, 0.2);

/**
 * Short rifle plus recoil timing, in the same shape as `Axe`. `swing` fires:
 * `update` reports the shot on the firing frame; the recoil then lifts the arm.
 */
export class Gun implements Weapon {
  /** Grip at the origin, barrel along +Y, grip hanging along +Z. */
  readonly model = new THREE.Group();
  /** Barrel tip; bullets spawn at its world position. */
  private readonly muzzle = new THREE.Object3D();
  angle = AIM_ANGLE;
  readonly armLocked = true;
  private readonly timer = new ActionTimer();

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
    const grip = new THREE.Mesh(gripGeo, woodMat);
    grip.position.set(0, -0.02, 0.1);
    grip.rotation.x = -0.3;
    this.muzzle.position.set(0, 0.81, -0.02);

    this.model.add(receiver, barrel, sight, grip, this.muzzle);
    this.model.rotation.x = GRIP_ANGLE;
  }

  get swinging(): boolean {
    return this.timer.active;
  }

  swing(): void {
    if (!this.swinging) this.timer.start();
  }

  release(): void {
    // A swing runs to completion on its own; nothing to let go of.
  }

  update(dt: number): WeaponAction | undefined {
    if (!this.swinging) return undefined;
    const t = this.timer.advance(dt, RECOIL_DURATION);
    const kick = t < KICK_POINT ? t / KICK_POINT : 1 - (t - KICK_POINT) / (1 - KICK_POINT);
    this.angle = AIM_ANGLE - KICK_ANGLE * kick;
    this.model.rotation.x = GRIP_ANGLE - KICK_TILT * kick;

    if (t >= 1) {
      this.angle = AIM_ANGLE;
      this.model.rotation.x = GRIP_ANGLE;
    }
    if (!this.timer.crossed(0)) return undefined;
    return { kind: 'fire', origin: this.muzzle.getWorldPosition(new THREE.Vector3()), speed: 40 };
  }
}
