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

/** Width of the sandy bank around the water (metres). */
const BANK_WIDTH = 0.5;
// Above the ground plane and the (unlit) grid at y = 0, and apart enough not to z-fight at the camera's near/far.
const BANK_Y = 0.03;
const WATER_Y = 0.05;

// Unit disc lying in the XZ plane facing up; shared by every bank and water surface.
const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
// Low roughness gives the sun/moon a broad sheen; metalness stays 0 (there is no environment map to reflect).
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f7fb8, roughness: 0.3, metalness: 0 });
const bankMat = new THREE.MeshStandardMaterial({ color: 0xb59e6a, roughness: 1 });

function disc(material: THREE.Material, y: number, x: number, z: number, radiusX: number, radiusZ: number, yaw: number): THREE.Mesh {
  const mesh = new THREE.Mesh(discGeo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(radiusX, 1, radiusZ);
  mesh.rotation.y = yaw;
  // Receives the trees' and the player's shadows like the ground; a flat caster would only add shadow acne.
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/** Elliptical ponds dug into the ground: a sandy bowl holding water that slows anyone wading through it. */
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
    this.ponds.push({ x, z, radiusX, radiusZ, yaw });
    this.root.add(disc(bankMat, BANK_Y, x, z, radiusX + BANK_WIDTH, radiusZ + BANK_WIDTH, yaw));
    this.root.add(disc(waterMat, WATER_Y, x, z, radiusX, radiusZ, yaw));
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
