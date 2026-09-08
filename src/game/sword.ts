import * as THREE from 'three';

/** Shoulder angle (rotation.x) for the holding arm: slightly forward of hanging straight down. */
export const SWORD_REST_ANGLE = -0.4;
/** Grip rotation so the blade points forward and up at about 45° when the arm is at rest. */
const GRIP_ANGLE = Math.PI / 4 - SWORD_REST_ANGLE;

const steel = new THREE.MeshStandardMaterial({ color: 0xc8ced4, metalness: 0.8, roughness: 0.3 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
const guardMat = new THREE.MeshStandardMaterial({ color: 0x8a7a3a, metalness: 0.6, roughness: 0.4 });

const bladeGeo = new THREE.BoxGeometry(0.06, 0.9, 0.16);
const tipGeo = new THREE.ConeGeometry(0.08, 0.16, 4);
const guardGeo = new THREE.BoxGeometry(0.1, 0.06, 0.4);
const gripGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8);
const pommelGeo = new THREE.SphereGeometry(0.05, 8, 6);

/** Sword with the grip at the origin and the blade along +Y. Attach to a hand. */
export function createSword(): THREE.Group {
  const sword = new THREE.Group();

  const grip = new THREE.Mesh(gripGeo, gripMat);
  const pommel = new THREE.Mesh(pommelGeo, guardMat);
  pommel.position.y = -0.13;
  const guard = new THREE.Mesh(guardGeo, guardMat);
  guard.position.y = 0.14;
  const blade = new THREE.Mesh(bladeGeo, steel);
  blade.position.y = 0.14 + 0.45;
  blade.castShadow = true;
  const tip = new THREE.Mesh(tipGeo, steel);
  tip.position.y = 0.14 + 0.9 + 0.08;
  tip.rotation.y = Math.PI / 4;
  tip.scale.set(0.6, 1, 1.4);

  sword.add(grip, pommel, guard, blade, tip);
  sword.rotation.x = GRIP_ANGLE;
  return sword;
}
