import type * as THREE from 'three';
import { MAX_PASSES, pushOutOfCircle, type CircleCollider } from './collision';

/** A no-go zone on the XZ plane (a torch's light). */
export interface Circle {
  position: THREE.Vector3;
  radius: number;
}

// Reused for each test so the hot path allocates nothing.
const scratch: CircleCollider = { kind: 'circle', x: 0, z: 0, radius: 0 };

/**
 * Moves the point `pos` to the rim of every circle it is inside, iterating
 * because leaving one circle can enter a neighbour. Returns whether it moved.
 */
export function pushOutOfCircles(pos: THREE.Vector3, circles: readonly Circle[]): boolean {
  let moved = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let movedThisPass = false;
    for (const c of circles) {
      scratch.x = c.position.x;
      scratch.z = c.position.z;
      scratch.radius = c.radius;
      if (pushOutOfCircle(pos, 0, scratch)) movedThisPass = true;
    }
    if (!movedThisPass) break;
    moved = true;
  }
  return moved;
}
