import * as THREE from 'three';
import { shadowed } from './mesh';
import type { Forest } from './trees';

/** Deterministic pseudo-random so the world layout is stable between reloads. */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function createHouse(): THREE.Group {
  const house = new THREE.Group();
  const width = 6;
  const depth = 5;
  const wallHeight = 3;

  const walls = shadowed(
    new THREE.Mesh(
      new THREE.BoxGeometry(width, wallHeight, depth),
      new THREE.MeshStandardMaterial({ color: 0xe8d5b7 }),
    ),
  );
  walls.position.y = wallHeight / 2;

  // A 4-sided cone rotated 45° makes a square pyramid roof.
  const roof = shadowed(
    new THREE.Mesh(
      new THREE.ConeGeometry(Math.hypot(width, depth) / 2 + 0.4, 2.2, 4),
      new THREE.MeshStandardMaterial({ color: 0xa33a2b, flatShading: true }),
    ),
  );
  roof.position.y = wallHeight + 1.1;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = depth / width;

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x5a3a1a }),
  );
  door.position.set(0, 1, depth / 2 + 0.05);

  const windowMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ef, emissive: 0x224455 });
  const windowGeo = new THREE.BoxGeometry(1, 1, 0.1);
  for (const x of [-1.8, 1.8]) {
    const w = new THREE.Mesh(windowGeo, windowMat);
    w.position.set(x, 1.8, depth / 2 + 0.05);
    house.add(w);
  }

  const chimney = shadowed(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.5, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x7a7a7a }),
    ),
  );
  chimney.position.set(width / 2 - 1, wallHeight + 1.2, -depth / 4);

  house.add(walls, roof, door, chimney);
  return house;
}

export function addProps(scene: THREE.Scene, forest: Forest): void {
  const house = createHouse();
  house.position.set(12, 0, -10);
  house.rotation.y = -Math.PI / 6;
  scene.add(house);

  const rand = seededRandom(42);
  let placed = 0;
  while (placed < 60) {
    const x = (rand() - 0.5) * 120;
    const z = (rand() - 0.5) * 120;
    // Keep the spawn point and the house clear.
    if (Math.hypot(x, z) < 6) continue;
    if (Math.hypot(x - house.position.x, z - house.position.z) < 8) continue;

    forest.plant(x, z, rand);
    placed++;
  }
}
