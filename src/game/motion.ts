import * as THREE from 'three';

/** Yaw error below which `turnToward` snaps onto its target so an idle body comes to rest exactly. */
const TURN_SNAP = 0.005;

/**
 * Eases `object`'s yaw toward facing `dir` (horizontal); `rate` is per second.
 * Returns true while still turning, false once snapped onto the target.
 */
export function turnToward(object: THREE.Object3D, dir: THREE.Vector3, rate: number, dt: number): boolean {
  const targetYaw = Math.atan2(dir.x, dir.z);
  const raw = targetYaw - object.rotation.y;
  const diff = Math.atan2(Math.sin(raw), Math.cos(raw));
  if (Math.abs(diff) < TURN_SNAP) {
    // Land exactly on the target; across the 2π seam the yaw differs from it by a turn, so add the remainder instead.
    object.rotation.y = Math.abs(raw) < TURN_SNAP ? targetYaw : object.rotation.y + diff;
    return false;
  }
  object.rotation.y += diff * Math.min(1, rate * dt);
  return true;
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

/** Exponential ease toward `target` at `rate` per second, snapping when close so idle frames settle exactly. */
export function settle(value: number, target: number, rate: number, dt: number): number {
  const next = THREE.MathUtils.damp(value, target, rate, dt);
  return Math.abs(next - target) < 0.002 ? target : next;
}
