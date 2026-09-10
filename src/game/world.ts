import * as THREE from 'three';
import { Colliders } from './collision';
import { DayCycle } from './daycycle';
import { addProps } from './props';
import { Forest } from './trees';

export interface World {
  scene: THREE.Scene;
  forest: Forest;
  /** Static obstacles characters are pushed out of. */
  colliders: Colliders;
  /** Sun, moon, sky and fog over the day/night cycle. */
  dayCycle: DayCycle;
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  // Background and fog colours are owned by DayCycle from here on.
  const fog = new THREE.Fog(0x87ceeb, 60, 200);
  scene.fog = fog;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x3fa34d }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(400, 200, 0x2e7d3a, 0x2e7d3a);
  scene.add(grid);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x3fa34d, 0.6);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(40, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  scene.add(sun);

  const dayCycle = new DayCycle(scene, sun, hemisphere, fog, grid);

  const colliders = new Colliders();
  const forest = new Forest(scene, colliders);
  addProps(scene, forest, colliders);

  return { scene, forest, colliders, dayCycle };
}
