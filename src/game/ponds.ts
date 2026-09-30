import * as THREE from 'three';
import type { Terrain } from './terrain';

/** Fraction of walking speed while wading. */
export const WADE_SPEED_FACTOR = 0.5;

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

interface Pond {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  cos: number;
  sin: number;
}

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

/** Elliptical ponds: static water that slows anyone wading through it. */
export class Ponds implements Terrain {
  private readonly root = new THREE.Group();
  private readonly ponds: Pond[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  /** Adds a pond centred on (`x`, `z`); `yaw` turns it like a mesh's `rotation.y`. */
  place(x: number, z: number, radiusX: number, radiusZ: number, yaw: number): void {
    this.ponds.push({ x, z, radiusX, radiusZ, cos: Math.cos(yaw), sin: Math.sin(yaw) });
    this.root.add(disc(bankMat, BANK_Y, x, z, radiusX + BANK_WIDTH, radiusZ + BANK_WIDTH, yaw));
    this.root.add(disc(waterMat, WATER_Y, x, z, radiusX, radiusZ, yaw));
  }

  /** True if (`x`, `z`) is in a pond whose radii are grown by `margin`. */
  contains(x: number, z: number, margin = 0): boolean {
    for (const p of this.ponds) {
      // Into the pond's frame, the same convention as the rotated boxes in collision.ts.
      const dx = x - p.x;
      const dz = z - p.z;
      const lx = dx * p.cos - dz * p.sin;
      const lz = dx * p.sin + dz * p.cos;
      const rx = p.radiusX + margin;
      const rz = p.radiusZ + margin;
      if ((lx / rx) ** 2 + (lz / rz) ** 2 <= 1) return true;
    }
    return false;
  }

  speedFactor(x: number, z: number): number {
    return this.contains(x, z) ? WADE_SPEED_FACTOR : 1;
  }
}
