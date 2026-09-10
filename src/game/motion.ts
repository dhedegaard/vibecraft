import type * as THREE from 'three';

/** Eases `object`'s yaw toward facing `dir` (horizontal); `rate` is per second. */
export function turnToward(object: THREE.Object3D, dir: THREE.Vector3, rate: number, dt: number): void {
  const targetYaw = Math.atan2(dir.x, dir.z);
  let diff = targetYaw - object.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  object.rotation.y += diff * Math.min(1, rate * dt);
}

/** Moves `object` `distance` metres along the direction it faces. */
export function stepForward(object: THREE.Object3D, distance: number): void {
  object.position.x += Math.sin(object.rotation.y) * distance;
  object.position.z += Math.cos(object.rotation.y) * distance;
}

/** Writes the horizontal unit vector for `yaw` into `out`. */
export function forwardOf(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}

/**
 * Speed a walk cycle should show for a step that intended `intended` m/s but
 * was cut short by a push-out: the horizontal distance actually covered per
 * second, capped at `intended`. A character held in place gets 0 so its legs settle.
 */
export function groundSpeed(intended: number, from: THREE.Vector3, to: THREE.Vector3, dt: number): number {
  if (dt <= 0) return intended;
  const covered = Math.hypot(to.x - from.x, to.z - from.z);
  return Math.min(intended, covered / dt);
}
