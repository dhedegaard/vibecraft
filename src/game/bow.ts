import * as THREE from 'three';
import { woodMat } from './mesh';
import { buildArrow } from './projectiles';
import { ActionTimer, type Weapon, type WeaponAction } from './weapons';

/** Shoulder angles (rotation.x of the holding arm): negative is in front. */
const REST_ANGLE = 0.35;
const AIM_ANGLE = -1.35;
/** Grip rotation so the arrow (model +Y) points straight forward at the aim angle. */
const GRIP_ANGLE = Math.PI / 2 - AIM_ANGLE;
/** The arm rises from rest to aim during the first part of the draw. */
const RAISE_TIME = 0.2;
/** Hold time for a full-power shot. */
const DRAW_TIME = 0.8;
/** Arm lowering after a shot; a new draw is refused until it ends. */
const RECOVER_TIME = 0.25;
const MIN_SPEED = 12;
const MAX_SPEED = 30;
/** How far (m) the string and arrow slide back at full draw. */
const STRING_PULL = 0.35;
const LIMB_HALF = 0.6;

const darkMat = new THREE.MeshStandardMaterial({ color: 0x22201c, roughness: 0.8 });
// Limbs run along Z (top at −Z, which is world up when aimed) and bow forward toward +Y.
const limbCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, -LIMB_HALF),
  new THREE.Vector3(0, 0.12, 0),
  new THREE.Vector3(0, 0, LIMB_HALF),
]);
const limbGeo = new THREE.TubeGeometry(limbCurve, 16, 0.025, 6);
const gripGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8);
/** Unit-length string segment, scaled to span tip → nock each frame. */
const stringGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4);
const TIP_TOP = new THREE.Vector3(0, 0, -LIMB_HALF);
const TIP_BOTTOM = new THREE.Vector3(0, 0, LIMB_HALF);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Per-frame scratch.
const span = new THREE.Vector3();

type BowState =
  | { kind: 'idle' }
  | { kind: 'drawing'; held: number }
  /** `shot` is the launch speed still to be reported; cleared after the fire frame. */
  | { kind: 'recovering'; shot: number | undefined };

/**
 * Bow model plus draw timing. `swing` starts drawing, `release` fires: `update`
 * reports the shot on the next frame and then lowers the arm back to rest.
 */
export class Bow implements Weapon {
  /** Grip at the origin, arrow along +Y, limbs along Z. */
  readonly model = new THREE.Group();
  readonly ammo = 'arrow';
  angle = REST_ANGLE;
  private state: BowState = { kind: 'idle' };
  private readonly recovery = new ActionTimer();
  /** String midpoint; arrows spawn at its world position. */
  private readonly nock = new THREE.Object3D();
  private readonly arrow: THREE.Object3D;
  private readonly upperString: THREE.Mesh;
  private readonly lowerString: THREE.Mesh;

  constructor() {
    const limbs = new THREE.Mesh(limbGeo, woodMat);
    limbs.castShadow = true;
    const grip = new THREE.Mesh(gripGeo, darkMat);
    grip.rotation.x = Math.PI / 2;
    this.upperString = new THREE.Mesh(stringGeo, darkMat);
    this.lowerString = new THREE.Mesh(stringGeo, darkMat);

    // buildArrow runs along +Z; turn it onto the bow's +Y with its tail at the nock.
    this.arrow = buildArrow();
    this.arrow.rotation.x = -Math.PI / 2;
    this.arrow.position.y = 0.4;
    this.arrow.visible = false;
    this.nock.add(this.arrow);

    this.model.add(limbs, grip, this.upperString, this.lowerString, this.nock);
    this.model.rotation.x = GRIP_ANGLE;
    this.setPull(0);
  }

  get swinging(): boolean {
    return this.state.kind !== 'idle';
  }

  /** The arm swings with the walk except while drawing or recovering. */
  get armLocked(): boolean {
    return this.swinging;
  }

  /** Draw fraction 0–1; 0 unless drawing. */
  get draw(): number {
    return this.state.kind === 'drawing' ? Math.min(this.state.held / DRAW_TIME, 1) : 0;
  }

  swing(): void {
    if (this.state.kind !== 'idle') return;
    this.state = { kind: 'drawing', held: 0 };
    this.arrow.visible = true;
  }

  release(): void {
    if (this.state.kind !== 'drawing') return;
    const shot = THREE.MathUtils.lerp(MIN_SPEED, MAX_SPEED, this.draw);
    this.state = { kind: 'recovering', shot };
    this.recovery.start();
  }

  update(dt: number): WeaponAction | undefined {
    const state = this.state;
    if (state.kind === 'idle') return undefined;

    if (state.kind === 'drawing') {
      state.held += dt;
      // Ease the arm up to the aim pose, then hold it while the string comes back.
      const k = Math.min(state.held / RAISE_TIME, 1);
      this.angle = THREE.MathUtils.lerp(REST_ANGLE, AIM_ANGLE, 1 - (1 - k) * (1 - k));
      this.setPull(STRING_PULL * this.draw);
      return undefined;
    }

    const t = this.recovery.advance(dt, RECOVER_TIME);
    this.angle = THREE.MathUtils.lerp(AIM_ANGLE, REST_ANGLE, t);
    if (t >= 1) {
      this.state = { kind: 'idle' };
      this.angle = REST_ANGLE;
    }
    if (state.shot === undefined) return undefined;

    // First frame after release: the string snaps back and the arrow leaves from it.
    const speed = state.shot;
    state.shot = undefined;
    this.setPull(0);
    this.arrow.visible = false;
    return { kind: 'fire', origin: this.nock.getWorldPosition(new THREE.Vector3()), speed };
  }

  /** Moves the nock `pull` metres back toward the archer and re-aims both string halves at it. */
  private setPull(pull: number): void {
    this.nock.position.set(0, -pull, 0);
    this.aimString(this.upperString, TIP_TOP);
    this.aimString(this.lowerString, TIP_BOTTOM);
  }

  private aimString(segment: THREE.Mesh, tip: THREE.Vector3): void {
    const nock = this.nock.position;
    segment.position.lerpVectors(tip, nock, 0.5);
    span.subVectors(nock, tip);
    segment.scale.y = span.length();
    segment.quaternion.setFromUnitVectors(Y_AXIS, span.normalize());
  }
}
