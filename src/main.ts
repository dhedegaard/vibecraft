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

/** Upper bound on simulation/render rate; rAF ticks above this are skipped. */
const MAX_FPS = 60;
const FRAME_INTERVAL = 1 / MAX_FPS;

// Set when something outside the simulation (resize, first frame) needs a redraw.
let needsRender = true;

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  followCamera.resize(window.innerWidth / window.innerHeight);
  needsRender = true;
});

const clock = new THREE.Clock();
let accumulated = 0;

function frame(): void {
  requestAnimationFrame(frame);

  const tick = clock.getDelta();
  accumulated += tick;
  // Skip this display refresh if the next one still lands within the target interval.
  if (accumulated + tick / 2 < FRAME_INTERVAL) return;

  // Clamp so a backgrounded tab doesn't launch the player into orbit on return.
  const dt = Math.min(accumulated, 0.05);
  accumulated = 0;

  const { hit, active } = player.update(dt, input, followCamera.yawAngle);
  if (hit) forest.chop(player.position, player.forward);
  for (const felled of forest.update(dt)) drops.spawnFromTree(felled);
  for (const item of drops.update(dt, player.position)) inventory.add(item);
  const cameraMoved = followCamera.update(input, player.position);

  // Only render when something visible changed; an idle scene costs nothing.
  const render = needsRender || active || cameraMoved || forest.animating || drops.animating;
  if (render) {
    renderer.render(scene, followCamera.camera);
    needsRender = false;
  }
  fps.update(dt, render);
}
frame();
