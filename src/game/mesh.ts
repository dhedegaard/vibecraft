import * as THREE from 'three';

/** Marks a mesh as both casting and receiving shadows. */
export function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Materials shared across modules so one colour cannot drift from another.
export const BONE_COLOR = 0xe6e2d3;
export const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
export const cutWoodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a });
export const boneMat = new THREE.MeshStandardMaterial({ color: BONE_COLOR, roughness: 0.8 });
