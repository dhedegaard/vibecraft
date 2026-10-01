import * as THREE from 'three';

/** Axis-aligned-in-its-own-frame ellipse on the XZ plane, turned by `yaw` like a mesh's `rotation.y`. */
export interface Ellipse {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  yaw: number;
}

/**
 * (lx/rx)² + (lz/rz)² with (lx, lz) the offset in the ellipse's frame: 0 at the centre, 1 on the
 * rim, > 1 outside. `margin` grows both radii. Same frame convention as the rotated boxes in
 * `collision.ts`, the exact inverse of three's `rotation.y`.
 */
export function normalizedRadiusSq(e: Ellipse, x: number, z: number, margin = 0): number {
  const cos = Math.cos(e.yaw);
  const sin = Math.sin(e.yaw);
  const dx = x - e.x;
  const dz = z - e.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return (lx / (e.radiusX + margin)) ** 2 + (lz / (e.radiusZ + margin)) ** 2;
}

/** True if (x, z) is inside the ellipse with both radii grown by `margin`. */
export function contains(e: Ellipse, x: number, z: number, margin = 0): boolean {
  return normalizedRadiusSq(e, x, z, margin) <= 1;
}

/**
 * `count` rim points in world XZ (`Vector2.y` holds world z) at uniform angle steps, point 0 on
 * the local +X axis. The bowl mesh's outermost ring uses the same angles, so the two coincide.
 */
export function outline(e: Ellipse, count: number): THREE.Vector2[] {
  const cos = Math.cos(e.yaw);
  const sin = Math.sin(e.yaw);
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / count;
    const lx = Math.cos(theta) * e.radiusX;
    const lz = Math.sin(theta) * e.radiusZ;
    points.push(new THREE.Vector2(e.x + lx * cos + lz * sin, e.z - lx * sin + lz * cos));
  }
  return points;
}

/**
 * Parametric range [t0, t1] ⊂ [0, 1] of the segment a→b that lies inside the ellipse, or
 * undefined if it misses (a tangent graze counts as a miss). Solves the quadratic of the
 * segment substituted into the ellipse equation in the ellipse's frame.
 */
export function segmentCut(e: Ellipse, ax: number, az: number, bx: number, bz: number): [number, number] | undefined {
  const cos = Math.cos(e.yaw);
  const sin = Math.sin(e.yaw);
  const dax = ax - e.x;
  const daz = az - e.z;
  const dbx = bx - e.x;
  const dbz = bz - e.z;
  // Start point and direction in the ellipse's frame, scaled to the unit circle.
  const px = (dax * cos - daz * sin) / e.radiusX;
  const pz = (dax * sin + daz * cos) / e.radiusZ;
  const dx = (dbx * cos - dbz * sin) / e.radiusX - px;
  const dz = (dbx * sin + dbz * cos) / e.radiusZ - pz;
  const a = dx * dx + dz * dz;
  if (a === 0) return undefined;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return undefined;
  const root = Math.sqrt(discriminant);
  const t0 = Math.max(0, (-b - root) / (2 * a));
  const t1 = Math.min(1, (-b + root) / (2 * a));
  return t0 < t1 ? [t0, t1] : undefined;
}
