import * as THREE from 'three';
import { contains, type Ellipse, normalizedRadiusSq } from './ellipse';
import type { Terrain } from './terrain';

/** Fraction of walking speed once the water is WADE_DEPTH deep or more. */
export const WADE_SPEED_FACTOR = 0.5;
/** Floor depth at a pond's centre (metres below the plain). */
export const DEPTH = 1.0;
/** Height of the water surface; the outer part of the bowl above it is dry sand. */
export const WATER_LEVEL = -0.2;
/** Water depth at which the slowdown reaches WADE_SPEED_FACTOR. */
export const WADE_DEPTH = 0.5;
/** Vertices around a pond's rim: shared by the bowl mesh and the hole cut in the ground. */
export const RIM_SEGMENTS = 48;

/** Concentric vertex rings between the bowl's centre and its rim. */
const RINGS = 10;

// Unit disc lying in the XZ plane facing up: the water surface of every pond.
const discGeo = new THREE.CircleGeometry(1, RIM_SEGMENTS).rotateX(-Math.PI / 2);
// See-through so the sandy floor and wading legs show; the grid is cut out of the pond so nothing else shows through.
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x2f7fb8,
  roughness: 0.3,
  metalness: 0,
  transparent: true,
  opacity: 0.7,
});
const sandMat = new THREE.MeshStandardMaterial({ color: 0xb59e6a, roughness: 1 });

/**
 * Unit bowl: a paraboloid −DEPTH deep at the centre rising to y = 0 on the unit circle. X and Z
 * scale per pond, depth does not. Vertex 0 is the centre; ring k (1..RINGS) follows at
 * r = k / RINGS with RIM_SEGMENTS vertices at uniform angles from the local +X axis, so the
 * last RIM_SEGMENTS vertices are the rim in `outline` order.
 */
function buildBowl(): THREE.BufferGeometry {
  const positions: number[] = [0, -DEPTH, 0];
  for (let k = 1; k <= RINGS; k++) {
    const r = k / RINGS;
    const y = -DEPTH * (1 - r * r);
    for (let i = 0; i < RIM_SEGMENTS; i++) {
      const theta = (2 * Math.PI * i) / RIM_SEGMENTS;
      positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
    }
  }
  const at = (ring: number, i: number): number => 1 + (ring - 1) * RIM_SEGMENTS + (i % RIM_SEGMENTS);
  const index: number[] = [];
  // Wound so the faces point up (+Y): centre fan first, then quads between rings.
  for (let i = 0; i < RIM_SEGMENTS; i++) index.push(0, at(1, i + 1), at(1, i));
  for (let k = 1; k < RINGS; k++) {
    for (let i = 0; i < RIM_SEGMENTS; i++) {
      const a = at(k, i);
      const b = at(k, i + 1);
      const c = at(k + 1, i + 1);
      const d = at(k + 1, i);
      index.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

const bowlGeo = buildBowl();

function pondMesh(geometry: THREE.BufferGeometry, material: THREE.Material, y: number, e: Ellipse): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(e.x, y, e.z);
  mesh.scale.set(e.radiusX, 1, e.radiusZ);
  mesh.rotation.y = e.yaw;
  // Receives the trees' and the player's shadows like the ground; a flat caster would only add shadow acne.
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/** Elliptical ponds dug into the ground: a sandy bowl under a see-through water plane that slows anyone wading through it. */
export class Ponds implements Terrain {
  private readonly root = new THREE.Group();
  private readonly ponds: Ellipse[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  /** The ponds' outlines, for cutting the ground and clipping the grid. */
  get ellipses(): readonly Ellipse[] {
    return this.ponds;
  }

  /** Adds a pond centred on (`x`, `z`); `yaw` turns it like a mesh's `rotation.y`. */
  place(x: number, z: number, radiusX: number, radiusZ: number, yaw: number): void {
    const e: Ellipse = { x, z, radiusX, radiusZ, yaw };
    this.ponds.push(e);
    // The water disc extends under the sand beyond the waterline, where the depth test hides it: the shoreline is the exact plane–bowl cut.
    this.root.add(pondMesh(bowlGeo, sandMat, 0, e));
    this.root.add(pondMesh(discGeo, waterMat, WATER_LEVEL, e));
  }

  /** True if (`x`, `z`) is in a pond whose radii are grown by `margin`. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.ponds.some((p) => contains(p, x, z, margin));
  }

  /** Floor height inside a pond (a paraboloid, −DEPTH at the centre, 0 at the rim), or undefined outside every pond. */
  private floorAt(x: number, z: number): number | undefined {
    for (const p of this.ponds) {
      const rSq = normalizedRadiusSq(p, x, z);
      if (rSq <= 1) return -DEPTH * (1 - rSq);
    }
    return undefined;
  }

  heightAt(x: number, z: number): number {
    return this.floorAt(x, z) ?? 0;
  }

  surfaceAt(x: number, z: number): number {
    const floor = this.floorAt(x, z);
    return floor === undefined ? 0 : Math.max(floor, WATER_LEVEL);
  }

  speedFactor(x: number, z: number): number {
    const floor = this.floorAt(x, z);
    if (floor === undefined) return 1;
    const depth = WATER_LEVEL - floor;
    if (depth <= 0) return 1;
    return 1 - (1 - WADE_SPEED_FACTOR) * Math.min(depth / WADE_DEPTH, 1);
  }
}
