import * as THREE from 'three';
import type { Colliders } from './collision';
import { shadowed, stoneMat } from './mesh';

/** Centre of the rock mound; the mouth faces +Z, toward the spawn. */
export const CAVE = { x: 0, z: -42 };
/** Footprint radius used as a keepout for trees and boulders. */
export const CAVE_RADIUS = 7.5;
/** Where the cat sleeps, facing the spawn (yaw 0 = +Z). */
export const BED = { x: 0, z: -41, yaw: 0 };

const LOBE_X = 4.3;
const LOBE_Z = -41.5;
const LOBE_RADIUS = 3.2;
const BACK_Z = -46;
const BACK_RADIUS = 3.5;
const LINTEL_Y = 4.1;
/** Colliders sit a little inside the rock, as boulders' do. */
const COLLIDER_SCALE = 0.9;

const unitSphere = new THREE.SphereGeometry(1, 20, 14);
const insetGeo = new THREE.BoxGeometry(2.4, 2.4, 1.6);
const darkMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

/** One rock lump: a unit sphere scaled to `radius` with a vertical squash and an optional XZ stretch. */
function lump(x: number, y: number, z: number, radius: number, squash: number, stretchX = 1, stretchZ = 1): THREE.Mesh {
  const mesh = shadowed(new THREE.Mesh(unitSphere, stoneMat));
  mesh.position.set(x, y, z);
  mesh.scale.set(radius * stretchX, radius * squash, radius * stretchZ);
  return mesh;
}

const COLLIDER_LUMPS: readonly (readonly [number, number, number])[] = [
  [-LOBE_X, LOBE_Z, LOBE_RADIUS],
  [LOBE_X, LOBE_Z, LOBE_RADIUS],
  [0, BACK_Z, BACK_RADIUS],
];

/** The cat's lair: a rock mound with a pocket open toward the spawn. */
export class Cave {
  readonly bed = BED;

  constructor(scene: THREE.Scene, colliders: Colliders) {
    const group = new THREE.Group();
    group.add(
      lump(-LOBE_X, 0, LOBE_Z, LOBE_RADIUS, 0.9),
      lump(LOBE_X, 0, LOBE_Z, LOBE_RADIUS, 0.9),
      lump(0, 0, BACK_Z, BACK_RADIUS, 1.1),
      // A roof over the mouth; its underside clears the cat's ears.
      lump(0, LINTEL_Y, LOBE_Z, LOBE_RADIUS, 0.5, 1.4, 1),
    );
    // Unlit black behind the bed so the pocket reads as depth.
    const inset = new THREE.Mesh(insetGeo, darkMat);
    inset.position.set(0, 1.2, -42.0);
    group.add(inset);
    scene.add(group);

    for (const [x, z, radius] of COLLIDER_LUMPS) {
      colliders.add({ kind: 'circle', x, z, radius: radius * COLLIDER_SCALE });
    }
  }

  /** Keepout test for layout: inside the mound's footprint grown by `margin`. */
  contains(x: number, z: number, margin = 0): boolean {
    return Math.hypot(x - CAVE.x, z - CAVE.z) < CAVE_RADIUS + margin;
  }
}
