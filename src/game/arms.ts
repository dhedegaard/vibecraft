import * as THREE from 'three';

const ARM_LENGTH = 0.6;
const SHOULDER_SPACING = 0.46;
/** Arms swing less than legs. */
const WALK_SWING_SCALE = 0.7;

const armMat = new THREE.MeshStandardMaterial({ color: 0xff6b35 });
const handMat = new THREE.MeshStandardMaterial({ color: 0xffc9a3 });
const armGeo = new THREE.CylinderGeometry(0.1, 0.09, ARM_LENGTH, 10);
const handGeo = new THREE.SphereGeometry(0.11, 10, 8);

function buildArm(): { shoulder: THREE.Group; hand: THREE.Object3D } {
  const shoulder = new THREE.Group();
  const arm = new THREE.Mesh(armGeo, armMat);
  arm.position.y = -ARM_LENGTH / 2;
  arm.castShadow = true;
  const hand = new THREE.Mesh(handGeo, handMat);
  hand.position.y = -ARM_LENGTH;
  hand.castShadow = true;
  shoulder.add(arm, hand);
  return { shoulder, hand };
}

/** Two arms hung from shoulder pivots. The right hand can hold an item. */
export class Arms {
  readonly root = new THREE.Group();
  private readonly left = buildArm();
  private readonly right = buildArm();

  constructor(heldItem?: THREE.Object3D) {
    this.left.shoulder.position.x = -SHOULDER_SPACING;
    this.right.shoulder.position.x = SHOULDER_SPACING;
    if (heldItem) this.right.hand.add(heldItem);
    this.root.add(this.left.shoulder, this.right.shoulder);
  }

  /**
   * @param legSwing current leg swing angle; arms move opposite their same-side leg
   * @param rightAngle base shoulder angle for the right arm (e.g. the axe pose)
   * @param rightLocked when true the right arm ignores the walk and holds `rightAngle` exactly
   */
  update(legSwing: number, rightAngle: number, rightLocked: boolean): void {
    const walk = legSwing * WALK_SWING_SCALE;
    this.left.shoulder.rotation.x = -walk;
    this.right.shoulder.rotation.x = rightLocked ? rightAngle : rightAngle + walk;
  }
}
