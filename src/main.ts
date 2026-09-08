import * as THREE from 'three';
import './style.css';
import { FollowCamera } from './game/camera';
import { Drops } from './game/drops';
import { bindInventoryHud, FpsCounter } from './game/hud';
import { Inventory } from './game/inventory';
import { Input } from './game/input';
import { Player } from './game/player';
import { createWorld } from './game/world';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const inventoryEl = document.querySelector<HTMLElement>('#inventory');
const fpsEl = document.querySelector<HTMLElement>('#fps');
if (!canvas || !inventoryEl || !fpsEl) throw new Error('Missing #game, #inventory or #fps element');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const { scene, forest } = createWorld();
const input = new Input(canvas);
const player = new Player();
scene.add(player.object);

const drops = new Drops(scene);
const inventory = new Inventory();
bindInventoryHud(inventoryEl, inventory);
const fps = new FpsCounter(fpsEl);

const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  followCamera.resize(window.innerWidth / window.innerHeight);
});

const clock = new THREE.Clock();
function frame(): void {
  const rawDt = clock.getDelta();
  fps.update(rawDt);
  // Clamp so a backgrounded tab doesn't launch the player into orbit on return.
  const dt = Math.min(rawDt, 0.05);
  const hit = player.update(dt, input, followCamera.yawAngle);
  if (hit) forest.chop(player.position, player.forward);
  for (const felled of forest.update(dt)) drops.spawnFromTree(felled);
  for (const item of drops.update(dt, player.position)) inventory.add(item);
  followCamera.update(input, player.position);
  renderer.render(scene, followCamera.camera);
  requestAnimationFrame(frame);
}
frame();
