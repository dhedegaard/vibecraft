import * as THREE from 'three';
import './style.css';
import { Audio } from './game/audio';
import { FollowCamera } from './game/camera';
import { craft } from './game/crafting';
import { FAST_FORWARD } from './game/daycycle';
import { Drops } from './game/drops';
import { Health } from './game/health';
import {
  bindCraftingHud,
  bindClock,
  bindDrawMeter,
  bindHealthHud,
  bindInventoryHud,
  bindMuteHud,
  bindWeaponHud,
  DamageFlash,
  FpsCounter,
} from './game/hud';
import { Inventory } from './game/inventory';
import { Input } from './game/input';
import { CpuGraph } from './game/perf';
import { Player } from './game/player';
import { Projectiles } from './game/projectiles';
import { Skeletons } from './game/skeletons';
import { Torches } from './game/torches';
import { createWorld } from './game/world';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const inventoryEl = document.querySelector<HTMLElement>('#inventory');
const fpsEl = document.querySelector<HTMLElement>('#fps');
const clockEl = document.querySelector<HTMLElement>('#clock');
const cpuCanvas = document.querySelector<HTMLCanvasElement>('#cpu');
const cpuLabel = document.querySelector<HTMLElement>('#cpu-label');
const heartsEl = document.querySelector<HTMLElement>('#hearts');
const weaponEl = document.querySelector<HTMLElement>('#weapon');
const drawEl = document.querySelector<HTMLElement>('#draw');
const craftingEl = document.querySelector<HTMLElement>('#crafting');
const recipesEl = document.querySelector<HTMLElement>('#recipes');
const damageEl = document.querySelector<HTMLElement>('#damage');
const gameOverEl = document.querySelector<HTMLElement>('#gameover');
const restartEl = document.querySelector<HTMLButtonElement>('#restart');
const muteEl = document.querySelector<HTMLElement>('#mute');
if (
  !canvas ||
  !inventoryEl ||
  !fpsEl ||
  !clockEl ||
  !cpuCanvas ||
  !cpuLabel ||
  !heartsEl ||
  !weaponEl ||
  !drawEl ||
  !craftingEl ||
  !recipesEl ||
  !damageEl ||
  !gameOverEl ||
  !restartEl ||
  !muteEl
) {
  throw new Error('Missing HUD element');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const { scene, forest, colliders, dayCycle } = createWorld();
const input = new Input(canvas);
const player = new Player();
scene.add(player.object);

const drops = new Drops(scene);
const projectiles = new Projectiles(scene);
const skeletons = new Skeletons(scene);
const torches = new Torches(scene);
const inventory = new Inventory();
bindInventoryHud(inventoryEl, inventory);
const health = new Health();
bindHealthHud(heartsEl, health);
const showWeapon = bindWeaponHud(weaponEl, player.weapon, (kind) => player.isUnlocked(kind));
const showDraw = bindDrawMeter(drawEl);
const showClock = bindClock(clockEl);
const audio = new Audio();
const showMute = bindMuteHud(muteEl, audio.muted);
const crafting = bindCraftingHud(
  craftingEl,
  recipesEl,
  inventory,
  (kind) => player.isUnlocked(kind),
  (recipe) => {
    const result = craft(recipe, inventory);
    if (!result.ok) return;
    audio.play({ kind: 'craft' });
    if (result.output.kind === 'item') inventory.add(result.output.item, result.output.amount);
    else if (player.unlock(result.output.weapon)) showWeapon(player.weapon);
  },
);
const damageFlash = new DamageFlash(damageEl);
restartEl.addEventListener('click', () => window.location.reload());
// Narrowed copy: the null check above doesn't carry into `frame`.
const gameOverOverlay: HTMLElement = gameOverEl;
const fps = new FpsCounter(fpsEl);
const cpu = new CpuGraph(cpuCanvas, cpuLabel);

const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);
/** Systems that animate on their own; a frame renders while any of them is busy. */
const scenery: { readonly animating: boolean }[] = [forest, drops, projectiles, skeletons, dayCycle, torches];

/** Upper bound on simulation/render rate; rAF ticks above this are skipped. */
const MAX_FPS = 60;
const FRAME_INTERVAL = 1 / MAX_FPS;

// Set when something outside the simulation (resize, first frame) needs a redraw.
let needsRender = true;
// Where a torch is planted: a metre in front of the player.
const placeAt = new THREE.Vector3();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  followCamera.resize(window.innerWidth / window.innerHeight);
  needsRender = true;
});

const clock = new THREE.Clock();
let accumulated = 0;

function frame(): void {
  if (health.dead) return;
  requestAnimationFrame(frame);
  cpu.begin();

  const tick = clock.getDelta();
  accumulated += tick;
  // Skip this display refresh if the next one still lands within the target interval.
  if (accumulated + tick / 2 < FRAME_INTERVAL) {
    cpu.end();
    return;
  }

  // Clamp so a backgrounded tab doesn't launch the player into orbit on return.
  const dt = Math.min(accumulated, 0.05);
  accumulated = 0;

  const { action, switched, active, sounds } = player.update(dt, input, followCamera.yawAngle, inventory, colliders);
  for (const cue of sounds) audio.play(cue);
  if (switched) showWeapon(player.weapon);
  showDraw(player.draw);
  if (input.consumeCraftToggle()) crafting.toggle();
  if (input.consumeMute()) showMute(audio.toggleMute());
  // One swing connects with one thing: a skeleton in reach takes priority over a tree.
  if (action?.kind === 'strike' && !skeletons.hit(player.position, player.forward)) {
    const chopped = forest.chop(player.position, player.forward);
    if (chopped !== 'miss') audio.play({ kind: 'chop' });
    if (chopped === 'felled') audio.play({ kind: 'treeCreak' });
  }
  if (action?.kind === 'fire' && inventory.remove('arrow')) {
    projectiles.fire(action.origin, player.forward, action.speed);
    audio.play({ kind: 'bowFire' });
  }
  const { paths, landed } = projectiles.update(dt);
  for (const path of paths) {
    if (skeletons.shoot(path.from, path.to)) {
      audio.play({ kind: 'arrowHit', at: path.to });
      projectiles.remove(path.id);
    }
  }
  for (const at of landed) audio.play({ kind: 'arrowMiss', at });
  for (const felled of forest.update(dt)) {
    drops.spawnFromTree(felled);
    audio.play({ kind: 'treeFall', at: felled.position, variation: felled.scale });
  }
  for (const item of drops.update(dt, player.position)) {
    inventory.add(item);
    audio.play({ kind: 'pickup' });
  }
  const fastForward = input.isHeld('fastForward');
  // Update before placing so a placement's `animating` flag survives to the render check.
  torches.update(fastForward ? dt * FAST_FORWARD : dt);
  if (input.consumePlace() && inventory.count('torch') > 0) {
    placeAt.copy(player.position).addScaledVector(player.forward, 1);
    if (torches.place(placeAt, colliders)) {
      inventory.remove('torch');
      audio.play({ kind: 'torchPlace' });
    }
  }
  const skeletonUpdate = skeletons.update(dt, player.position, colliders, torches.repellers);
  for (const cue of skeletonUpdate.sounds) audio.play(cue);
  for (const at of skeletonUpdate.killed) drops.spawnFromSkeleton(at);
  if (skeletonUpdate.damage > 0 && health.damage(skeletonUpdate.damage)) {
    damageFlash.flash();
    audio.play({ kind: health.dead ? 'death' : 'playerHurt' });
  }
  health.update(dt);
  const cameraMoved = followCamera.update(input, player.position);
  audio.update(dt, followCamera.camera, dayCycle.phase, torches.repellers);
  dayCycle.update(dt, fastForward, followCamera.camera.position, player.position);
  showClock(dayCycle.phase);

  // Only render when something visible changed; an idle scene costs nothing.
  const render = needsRender || active || cameraMoved || scenery.some((s) => s.animating);
  if (render) {
    renderer.render(scene, followCamera.camera);
    needsRender = false;
  }
  fps.update(dt, render);
  cpu.end();

  // Freeze the world on death; the overlay offers a restart.
  if (health.dead) gameOverOverlay.hidden = false;
}
frame();
