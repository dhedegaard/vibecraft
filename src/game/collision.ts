import type * as THREE from 'three';

/** Static obstacle on the XZ plane; collision ignores height. */
export type Collider =
  | { kind: 'circle'; x: number; z: number; radius: number }
  | { kind: 'box'; x: number; z: number; halfWidth: number; halfDepth: number; yaw: number };

export type CircleCollider = Extract<Collider, { kind: 'circle' }>;

/** Horizontal radius of a character (player or skeleton) for collision. */
export const CHARACTER_RADIUS = 0.4;

const EPSILON = 1e-9;
/** Upper bound on resolve passes; wedged between neighbours the position converges in a few. */
export const MAX_PASSES = 8;

/**
 * Pushes the circle at `pos` (radius `radius`) out of a box collider along the
 * shortest axis, or diagonally out of a corner. Returns whether it moved.
 */
function pushOutOfBox(pos: THREE.Vector3, radius: number, box: Extract<Collider, { kind: 'box' }>): boolean {
  // Into the box's local frame: rotate by -yaw around Y.
  const dx = pos.x - box.x;
  const dz = pos.z - box.z;
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;

  // Nearest point on the box to the circle centre.
  const cx = Math.max(-box.halfWidth, Math.min(box.halfWidth, lx));
  const cz = Math.max(-box.halfDepth, Math.min(box.halfDepth, lz));
  let nx = lx - cx;
  let nz = lz - cz;
  const distSq = nx * nx + nz * nz;
  if (distSq >= radius * radius) return false;

  let push: number;
  if (distSq > EPSILON) {
    // Outside the box but overlapping: push away from the nearest point (face or corner).
    const dist = Math.sqrt(distSq);
    nx /= dist;
    nz /= dist;
    push = radius - dist;
  } else {
    // Centre inside the box: leave through the nearest face.
    const toRight = box.halfWidth - lx;
    const toLeft = box.halfWidth + lx;
    const toFront = box.halfDepth - lz;
    const toBack = box.halfDepth + lz;
    const min = Math.min(toRight, toLeft, toFront, toBack);
    nx = 0;
    nz = 0;
    if (min === toRight) nx = 1;
    else if (min === toLeft) nx = -1;
    else if (min === toFront) nz = 1;
    else nz = -1;
    push = min + radius;
  }

  // Back to world frame: rotate by +yaw.
  pos.x += (nx * cos + nz * sin) * push;
  pos.z += (-nx * sin + nz * cos) * push;
  return true;
}

export function pushOutOfCircle(
  pos: THREE.Vector3,
  radius: number,
  circle: CircleCollider,
): boolean {
  return pushApart(pos, circle.x, circle.z, radius + circle.radius);
}

/** Moves `pos` so it is at least `minDist` from (`x`, `z`) horizontally. */
function pushApart(pos: THREE.Vector3, x: number, z: number, minDist: number): boolean {
  let dx = pos.x - x;
  let dz = pos.z - z;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist) return false;
  if (distSq < EPSILON) {
    // Coincident centres: any direction will do.
    dx = 1;
    dz = 0;
  } else {
    const dist = Math.sqrt(distSq);
    dx /= dist;
    dz /= dist;
  }
  const m = minDist * (1 + 1e-12); // overshoot so the result reads back as outside (a float fixed point)
  pos.x = x + dx * m;
  pos.z = z + dz * m;
  return true;
}

/**
 * Pushes the circle at `other` (radius `otherRadius`) out of the circle at
 * `anchor`, which stays put. Returns whether `other` moved.
 */
export function separate(
  anchor: THREE.Vector3,
  anchorRadius: number,
  other: THREE.Vector3,
  otherRadius: number,
): boolean {
  return pushApart(other, anchor.x, anchor.z, anchorRadius + otherRadius);
}

/** The world's static obstacles; characters are pushed out of them each frame. */
export class Colliders {
  private readonly items: Collider[] = [];

  add(collider: Collider): void {
    this.items.push(collider);
  }

  /**
   * Pushes the circle at `pos` out of every overlapping collider. Returns whether it moved.
   * Pushing out of one collider can re-enter a neighbour, so passes repeat until stable.
   */
  resolve(pos: THREE.Vector3, radius: number): boolean {
    let moved = false;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let movedThisPass = false;
      for (const c of this.items) {
        if (c.kind === 'circle' ? pushOutOfCircle(pos, radius, c) : pushOutOfBox(pos, radius, c)) {
          movedThisPass = true;
        }
      }
      if (!movedThisPass) break;
      moved = true;
    }
    return moved;
  }
}
