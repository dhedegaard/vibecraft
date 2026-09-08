import * as THREE from 'three';

const LEG_LENGTH = 0.55;
const HIP_SPACING = 0.18;
/** Stride cycles per metre walked. */
const STRIDE_RATE = 1.6;
const SWING_ANGLE = 0.65;
/** How quickly legs return to neutral after stopping (per second). */
const SETTLE_SPEED = 12;
const JUMP_TUCK = 0.35;

const legGeo = new THREE.CylinderGeometry(0.11, 0.09, LEG_LENGTH, 10);
const footGeo = new THREE.BoxGeometry(0.24, 0.12, 0.34);

export interface LegStyle {
  leg: THREE.Material;
  foot: THREE.Material;
}

const DEFAULT_STYLE: LegStyle = {
  leg: new THREE.MeshStandardMaterial({ color: 0x2f3e9e }),
  foot: new THREE.MeshStandardMaterial({ color: 0x222222 }),
};

function buildLeg(style: LegStyle): THREE.Group {
  const hip = new THREE.Group();
  const leg = new THREE.Mesh(legGeo, style.leg);
  leg.position.y = -LEG_LENGTH / 2;
  leg.castShadow = true;
  const foot = new THREE.Mesh(footGeo, style.foot);
  foot.position.set(0, -LEG_LENGTH, 0.05);
  foot.castShadow = true;
  hip.add(leg, foot);
  return hip;
}

/** Exponential ease toward `target`, snapping when close so idle frames settle exactly. */
function settle(value: number, target: number, dt: number): number {
  const next = THREE.MathUtils.damp(value, target, SETTLE_SPEED, dt);
  return Math.abs(next - target) < 0.002 ? target : next;
}

/** Two legs hung from hip pivots that swing in opposition while walking. */
export class Legs {
  readonly root = new THREE.Group();
  private readonly left: THREE.Group;
  private readonly right: THREE.Group;
  private phase = 0;
  private swing = 0;
  private tuck = 0;

  /** Current stride angle, for anything that should move in step with the legs. */
  get swingAngle(): number {
    return this.swing;
  }

  /** Height from the ground to the hip pivot. */
  static readonly HIP_HEIGHT = LEG_LENGTH + 0.06;

  constructor(style: LegStyle = DEFAULT_STYLE) {
    this.left = buildLeg(style);
    this.right = buildLeg(style);
    this.left.position.x = -HIP_SPACING;
    this.right.position.x = HIP_SPACING;
    this.root.add(this.left, this.right);
  }

  /** Advances the walk cycle; returns true if the legs moved this frame. */
  update(dt: number, speed: number, grounded: boolean): boolean {
    const before = this.left.rotation.x;

    if (grounded && speed > 0.01) {
      this.phase += speed * STRIDE_RATE * dt * Math.PI * 2;
      this.swing = Math.sin(this.phase) * SWING_ANGLE;
    } else {
      this.swing = settle(this.swing, 0, dt);
    }
    // Both legs tuck back while airborne and ease out again on landing.
    this.tuck = settle(this.tuck, grounded ? 0 : JUMP_TUCK, dt);

    this.left.rotation.x = -this.tuck + this.swing;
    this.right.rotation.x = -this.tuck - this.swing;

    return this.left.rotation.x !== before;
  }
}
