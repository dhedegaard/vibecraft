import * as THREE from 'three';
import './style.css';
import { FollowCamera } from './game/camera';
import { Input } from './game/input';
import { Player } from './game/player';
import { createWorld } from './game/world';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const { scene, forest } = createWorld();
const input = new Input(canvas);
const player = new Player();
scene.add(player.object);

const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  followCamera.resize(window.innerWidth / window.innerHeight);
});

const clock = new THREE.Clock();
function frame(): void {
  // Clamp so a backgrounded tab doesn't launch the player into orbit on return.
  const dt = Math.min(clock.getDelta(), 0.05);
  const hit = player.update(dt, input, followCamera.yawAngle);
  if (hit) forest.chop(player.position, player.forward);
  forest.update(dt);
  followCamera.update(input, player.position);
  renderer.render(scene, followCamera.camera);
  requestAnimationFrame(frame);
}
frame();
