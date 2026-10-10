import * as THREE from 'three';
import { Boulders } from './boulders';
import { Cave } from './cave';
import { Colliders } from './collision';
import { DayCycle } from './daycycle';
import { buildGrid, buildGround, GRID_DIVISIONS, GROUND_SIZE } from './ground';
import { Ponds } from './ponds';
import { addProps } from './props';
import { Forest } from './trees';

export interface World {
  scene: THREE.Scene;
  forest: Forest;
  boulders: Boulders;
  /** Water: slows wading characters and refuses torches. */
  ponds: Ponds;
  /** The cat's lair; its colliders are registered, its footprint keeps trees and boulders out. */
  cave: Cave;
  /** Obstacles characters are pushed out of; pushable boulders give way first. */
  colliders: Colliders;
  /** Sun, moon, sky and fog over the day/night cycle. */
  dayCycle: DayCycle;
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  // Background and fog colours are owned by DayCycle from here on.
  const fog = new THREE.Fog(0x87ceeb, 60, 200);
  scene.fog = fog;

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x3fa34d, 0.6);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(40, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.far = 200;
  // The box follows the player (see DayCycle), so it can be tight for sharp shadows.
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);

  const colliders = new Colliders();
  const forest = new Forest(scene, colliders);
  const ponds = new Ponds(scene);
  const boulders = new Boulders(scene, colliders, ponds);
  const cave = new Cave(scene, colliders);
  addProps(scene, forest, boulders, ponds, cave, colliders);

  // After the ponds are placed: the plain is cut around them and the grid stops at their rims.
  scene.add(buildGround(GROUND_SIZE, ponds.ellipses));
  const grid = buildGrid(GROUND_SIZE, GRID_DIVISIONS, ponds.ellipses);
  scene.add(grid);
  const dayCycle = new DayCycle(scene, sun, hemisphere, fog, grid);

  return { scene, forest, boulders, ponds, cave, colliders, dayCycle };
}
