import * as THREE from 'three';
import { type Ellipse, outline, segmentCut } from './ellipse';
import { RIM_SEGMENTS } from './ponds';

export const GROUND_SIZE = 400;
export const GRID_DIVISIONS = 200;
const GROUND_COLOR = 0x3fa34d;
const GRID_COLOR = 0x2e7d3a;

const groundMat = new THREE.MeshStandardMaterial({ color: GROUND_COLOR });

/**
 * A `size` square centred on the origin with one hole per pond. The mesh is rotated −π/2 about X,
 * which sends shape +Y to world −Z, so hole points are (x, −z). Holes are built from the same rim
 * points as the bowl mesh (not `absellipse`, whose sampling depends on `curveSegments`), so the
 * hole's edge and the bowl's rim share their vertices exactly.
 */
export function groundShape(size: number, holes: readonly Ellipse[]): THREE.Shape {
  const half = size / 2;
  const shape = new THREE.Shape([
    new THREE.Vector2(-half, -half),
    new THREE.Vector2(half, -half),
    new THREE.Vector2(half, half),
    new THREE.Vector2(-half, half),
  ]);
  for (const e of holes) {
    shape.holes.push(new THREE.Path(outline(e, RIM_SEGMENTS).map((p) => new THREE.Vector2(p.x, -p.y))));
  }
  return shape;
}

/** The flat green plain with the ponds cut out; the bowls fill the holes. */
export function buildGround(size: number, holes: readonly Ellipse[]): THREE.Mesh {
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(groundShape(size, holes)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

/** Appends the parts of the segment a→b outside every cut as [x0, 0, z0, x1, 0, z1, …]. */
function pushClipped(out: number[], ax: number, az: number, bx: number, bz: number, cuts: readonly Ellipse[]): void {
  let pieces: [number, number][] = [[0, 1]];
  for (const e of cuts) {
    const cut = segmentCut(e, ax, az, bx, bz);
    if (!cut) continue;
    const [c0, c1] = cut;
    const next: [number, number][] = [];
    for (const [p0, p1] of pieces) {
      if (c1 <= p0 || c0 >= p1) {
        next.push([p0, p1]);
        continue;
      }
      if (c0 > p0) next.push([p0, c0]);
      if (c1 < p1) next.push([c1, p1]);
    }
    pieces = next;
  }
  for (const [p0, p1] of pieces) {
    out.push(ax + (bx - ax) * p0, 0, az + (bz - az) * p0, ax + (bx - ax) * p1, 0, az + (bz - az) * p1);
  }
}

/** `GridHelper`'s line layout (divisions + 1 lines along X and along Z), each line clipped at every pond's rim. */
export function gridSegments(size: number, divisions: number, cuts: readonly Ellipse[]): number[] {
  const half = size / 2;
  const step = size / divisions;
  const out: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    const k = -half + i * step;
    pushClipped(out, -half, k, half, k, cuts);
    pushClipped(out, k, -half, k, half, cuts);
  }
  return out;
}

/** A vertex-coloured line set like `GridHelper`, so `DayCycle` keeps dimming it through `material.color`. */
export function buildGrid(
  size: number,
  divisions: number,
  cuts: readonly Ellipse[],
): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const positions = gridSegments(size, divisions, cuts);
  const color = new THREE.Color(GRID_COLOR);
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false });
  return new THREE.LineSegments(geometry, material);
}
