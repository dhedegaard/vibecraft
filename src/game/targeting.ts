import * as THREE from 'three';

/** How far in front of a character a melee swing reaches (metres). */
export const MELEE_REACH = 2.8;
/** Cosine of the half-angle of the cone in front of the character a swing covers. */
export const MELEE_FACING = 0.4;

const offset = new THREE.Vector3();
const away = new THREE.Vector3();

export interface ConeHit<T> {
  item: T;
  /** Horizontal unit vector from `origin` to the item. Valid until the next call. */
  away: THREE.Vector3;
}

/** Closest of `items` inside the melee cone in front of `origin`, within `reach` metres. */
export function nearestInCone<T>(
  items: Iterable<T>,
  positionOf: (item: T) => THREE.Vector3,
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  reach = MELEE_REACH,
): ConeHit<T> | undefined {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const item of items) {
    offset.subVectors(positionOf(item), origin).setY(0);
    const dist = offset.length();
    if (dist > reach || dist >= bestDist) continue;
    if (offset.normalize().dot(forward) < MELEE_FACING) continue;
    best = item;
    bestDist = dist;
    away.copy(offset);
  }
  return best === undefined ? undefined : { item: best, away };
}

const segment = new THREE.Vector3();
const rel = new THREE.Vector3();

/**
 * Where the segment `from` → `to` passes through a vertical cylinder standing on `base`
 * (XZ radius `radius`, `height` tall): the parameter in [0, 1] of the closest approach
 * to the axis, or undefined for a miss. Arrows against bodies.
 */
export function segmentHitsCylinder(
  from: THREE.Vector3,
  to: THREE.Vector3,
  base: THREE.Vector3,
  radius: number,
  height: number,
): number | undefined {
  segment.subVectors(to, from);
  const lengthSq = segment.lengthSq();
  if (lengthSq === 0) return undefined;
  rel.subVectors(base, from);
  const along = THREE.MathUtils.clamp(rel.dot(segment) / lengthSq, 0, 1);
  rel.addScaledVector(segment, -along);
  const y = from.y + segment.y * along - base.y;
  if (rel.x * rel.x + rel.z * rel.z > radius * radius || y < 0 || y > height) return undefined;
  return along;
}
