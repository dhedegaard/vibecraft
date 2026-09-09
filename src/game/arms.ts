import * as THREE from 'three';

const ARM_LENGTH = 0.6;
const SHOULDER_SPACING = 0.46;
/** Arms swing less than legs. */
const WALK_SWING_SCALE = 0.7;

const armGeo = new THREE.CylinderGeometry(0.1, 0.09, ARM_LENGTH, 10);
const handGeo = new THREE.SphereGeometry(0.11, 10, 8);

export interface ArmStyle {
  arm: THREE.Material;
  hand: THREE.Material;
}

const DEFAULT_STYLE: ArmStyle = {
  arm: new THREE.MeshStandardMaterial({ color: 0xff6b35 }),
  hand: new THREE.MeshStandardMaterial({ color: 0xffc9a3 }),
};

function buildArm(style: ArmStyle): { shoulder: THREE.Group; hand: THREE.Object3D } {
  const shoulder = new THREE.Group();
  const arm = new THREE.Mesh(armGeo, style.arm);
  arm.position.y = -ARM_LENGTH / 2;
  arm.castShadow = true;
  const hand = new THREE.Mesh(handGeo, style.hand);
  hand.position.y = -ARM_LENGTH;
  hand.castShadow = true;
  shoulder.add(arm, hand);
  return { shoulder, hand };
}

/** Two arms hung from shoulder pivots. The right hand can hold an item. */
export class Arms {
  readonly root = new THREE.Group();
  private readonly left: ReturnType<typeof buildArm>;
  private readonly right: ReturnType<typeof buildArm>;

  constructor(heldItem?: THREE.Object3D, style: ArmStyle = DEFAULT_STYLE) {
    this.left = buildArm(style);
    this.right = buildArm(style);
    this.left.shoulder.position.x = -SHOULDER_SPACING;
    this.right.shoulder.position.x = SHOULDER_SPACING;
    if (heldItem) this.right.hand.add(heldItem);
    this.root.add(this.left.shoulder, this.right.shoulder);
  }

  /**
   * @param legSwing current leg swing angle; arms move opposite their same-side leg
   * @param rightAngle base shoulder angle for the right arm (e.g. the axe pose)
   * @param rightLocked when true the right arm ignores the walk and holds `rightAngle` exactly
   * @param leftAngle when set the left arm holds this angle exactly instead of walking
   */
  update(legSwing: number, rightAngle: number, rightLocked: boolean, leftAngle?: number): void {
    const walk = legSwing * WALK_SWING_SCALE;
    this.left.shoulder.rotation.x = leftAngle ?? -walk;
    this.right.shoulder.rotation.x = rightLocked ? rightAngle : rightAngle + walk;
  }
}
