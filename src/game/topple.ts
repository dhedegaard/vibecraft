import * as THREE from 'three';

/** Just short of flat so the object visibly rests on the ground rather than in it. */
const FALLEN_ANGLE = Math.PI / 2 - 0.05;
const fall = new THREE.Quaternion();

/** Hinge state for an object falling over from its base. */
export interface Topple {
  axis: THREE.Vector3;
  upright: THREE.Quaternion;
}

/** Captures `object`'s upright pose and the hinge axis for falling along `away`. */
export function beginTopple(object: THREE.Object3D, away: THREE.Vector3): Topple {
  const axis = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, away).normalize();
  return { axis, upright: object.quaternion.clone() };
}

/** Poses `object` at progress `k` (0 upright, 1 fallen); ease-in like gravity taking over. */
export function applyTopple(object: THREE.Object3D, topple: Topple, k: number): void {
  fall.setFromAxisAngle(topple.axis, FALLEN_ANGLE * k * k);
  object.quaternion.copy(fall).multiply(topple.upright);
}
