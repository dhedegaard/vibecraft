import * as THREE from 'three';

/** How far in front of a character a melee swing reaches (metres). */
export const MELEE_REACH = 2.8;
/** Cosine of the half-angle of the cone in front of the character a swing covers. */
export const MELEE_FACING = 0.4;

const to = new THREE.Vector3();
const away = new THREE.Vector3();

export interface ConeHit<T> {
  item: T;
  /** Horizontal unit vector from `origin` to the item. Valid until the next call. */
  away: THREE.Vector3;
}

/** Closest of `items` inside the melee cone in front of `origin`, if any. */
export function nearestInCone<T>(
  items: Iterable<T>,
  positionOf: (item: T) => THREE.Vector3,
  origin: THREE.Vector3,
  forward: THREE.Vector3,
): ConeHit<T> | undefined {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const item of items) {
    to.subVectors(positionOf(item), origin).setY(0);
    const dist = to.length();
    if (dist > MELEE_REACH || dist >= bestDist) continue;
    if (to.normalize().dot(forward) < MELEE_FACING) continue;
    best = item;
    bestDist = dist;
    away.copy(to);
  }
  return best === undefined ? undefined : { item: best, away };
}
