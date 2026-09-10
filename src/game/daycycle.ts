import * as THREE from 'three';

/** Real seconds per full day/night cycle. */
export const CYCLE_SECONDS = 300;
/** Fraction of the cycle the sun is above the horizon; t = 0 is sunrise. */
export const DAY_FRACTION = 0.6;
/** Phase the game starts at (mid-morning). */
export const START_PHASE = 0.15;
/** Time multiplier while the fast-forward key is held. */
export const FAST_FORWARD = 40;

/** Wraps a phase into [0, 1). */
function wrap(t: number): number {
  return ((t % 1) + 1) % 1;
}

/** Unitless sun height: +1 at noon, 0 at sunrise/sunset, −1 at midnight. */
export function sunElevation(t: number): number {
  const phase = wrap(t);
  if (phase < DAY_FRACTION) return Math.sin((Math.PI * phase) / DAY_FRACTION);
  return -Math.sin((Math.PI * (phase - DAY_FRACTION)) / (1 - DAY_FRACTION));
}

/** Angle along the sun's path: −π/2 at sunrise, 0 at noon, π/2 at sunset, π at midnight. */
function pathAngle(t: number): number {
  const phase = wrap(t);
  if (phase < DAY_FRACTION) return (Math.PI * phase) / DAY_FRACTION - Math.PI / 2;
  return Math.PI / 2 + (Math.PI * (phase - DAY_FRACTION)) / (1 - DAY_FRACTION);
}

/** Direction of the old fixed sun; the path's noon point. */
const NOON = new THREE.Vector3(40, 60, 20).normalize();
/** Horizontal unit vector perpendicular to NOON: where the sun sets. */
const EAST = new THREE.Vector3(NOON.z, 0, -NOON.x).normalize();

/** Unit vector from the origin toward the sun at phase `t`, written into `out`. */
export function sunDirection(t: number, out: THREE.Vector3): THREE.Vector3 {
  const theta = pathAngle(t);
  return out.copy(NOON).multiplyScalar(Math.cos(theta)).addScaledVector(EAST, Math.sin(theta));
}
