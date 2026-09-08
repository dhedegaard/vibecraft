import * as THREE from 'three';
import { addProps } from './props';
import { Forest } from './trees';

export interface World {
  scene: THREE.Scene;
  forest: Forest;
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 60, 200);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x3fa34d }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new THREE.GridHelper(400, 200, 0x2e7d3a, 0x2e7d3a));

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3fa34d, 0.6));

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

  const forest = new Forest(scene);
  addProps(scene, forest);

  return { scene, forest };
}
