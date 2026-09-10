import * as THREE from 'three';
import type { Colliders } from './collision';
import { CYCLE_SECONDS } from './daycycle';
import { shadowed, woodMat } from './mesh';
import type { Circle } from './repel';

/** Live torches at once; also the size of the point-light pool. */
export const MAX_TORCHES = 8;
/** Real seconds a torch burns: two in-game days at normal speed. */
export const TORCH_LIFETIME = 2 * CYCLE_SECONDS;
/** Final stretch over which light and flame fade to nothing. */
export const TORCH_DIM_SECONDS = 30;
/** Skeletons stay outside this radius (metres) around a torch. */
export const TORCH_REPEL_RADIUS = 5;
/** Minimum distance between two torches. */
export const TORCH_SPACING = 1;
/** Point-light intensity at full burn (tuning value). */
export const TORCH_INTENSITY = 6;
/** Dim/remove checks run this often (s), not every frame, so an idle torch doesn't wake the renderer. */
const VISUAL_STEP = 0.5;

/** Lit radius; wider than the repel radius so skeletons at the rim stand in the light. */
const LIGHT_DISTANCE = 9;
const LIGHT_COLOR = 0xffa040;
const FLAME_COLOR = 0xffb040;
const STICK_HEIGHT = 1.2;
const STICK_RADIUS = 0.05;
const FLAME_HEIGHT = 0.3;
/** Probe radius for "is this spot inside a trunk or the house". */
const PLACE_PROBE_RADIUS = 0.15;

const stickGeo = new THREE.CylinderGeometry(STICK_RADIUS, STICK_RADIUS, STICK_HEIGHT, 8);
const flameGeo = new THREE.ConeGeometry(0.1, FLAME_HEIGHT, 8);
// Unlit so the flame stays bright at night; shared since the fade only scales the mesh, never the material.
const flameMat = new THREE.MeshBasicMaterial({ color: FLAME_COLOR });

const probe = new THREE.Vector3();

interface Torch {
  object: THREE.Group;
  light: THREE.PointLight;
  flame: THREE.Mesh;
  remaining: number;
  circle: Circle;
}

/** Placed torches: a pooled point light each, a lifetime, and a no-go circle for skeletons. */
export class Torches {
  private readonly root = new THREE.Group();
  private readonly torches: Torch[] = [];
  private readonly freeLights: THREE.PointLight[] = [];
  private readonly circles: Circle[] = [];
  private changed = false;
  private stepAccumulator = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    // Every light exists from the start: three.js recompiles all shaders when the light count changes.
    for (let i = 0; i < MAX_TORCHES; i++) {
      const light = new THREE.PointLight(LIGHT_COLOR, 0, LIGHT_DISTANCE, 2);
      light.castShadow = false;
      this.root.add(light);
      this.freeLights.push(light);
    }
  }

  /** True on the frame after a placement and on visual steps that dimmed or removed a torch. */
  get animating(): boolean {
    return this.changed;
  }

  /** One circle per live torch; skeletons are pushed out of them. */
  get repellers(): readonly Circle[] {
    return this.circles;
  }

  get count(): number {
    return this.torches.length;
  }

  /**
   * Plants a torch at `at` on the ground. Refused (false) inside a collider or
   * within `TORCH_SPACING` of another torch; over the cap the oldest goes out.
   */
  place(at: THREE.Vector3, colliders: Colliders): boolean {
    for (const t of this.torches) {
      if (Math.hypot(t.object.position.x - at.x, t.object.position.z - at.z) < TORCH_SPACING) return false;
    }
    probe.set(at.x, 0, at.z);
    if (colliders.resolve(probe, PLACE_PROBE_RADIUS)) return false;
    if (this.torches.length >= MAX_TORCHES) this.remove(0);

    const light = this.freeLights.pop();
    if (!light) throw new Error('torch light pool exhausted');
    light.intensity = TORCH_INTENSITY;
    light.position.set(0, STICK_HEIGHT + FLAME_HEIGHT / 2, 0);

    const stick = shadowed(new THREE.Mesh(stickGeo, woodMat));
    stick.position.y = STICK_HEIGHT / 2;
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = STICK_HEIGHT + FLAME_HEIGHT / 2;

    const object = new THREE.Group();
    object.position.set(at.x, 0, at.z);
    object.add(stick, flame, light);
    this.root.add(object);

    const circle: Circle = { position: object.position, radius: TORCH_REPEL_RADIUS };
    this.torches.push({ object, light, flame, remaining: TORCH_LIFETIME, circle });
    this.syncCircles();
    this.changed = true;
    return true;
  }

  /** Ages every torch by `dt` (pre-scaled by the caller for fast-forward); dims and removes in coarse steps. */
  update(dt: number): void {
    this.changed = false;
    if (this.torches.length === 0) {
      this.stepAccumulator = 0;
      return;
    }
    for (const t of this.torches) t.remaining -= dt;
    this.stepAccumulator += dt;
    if (this.stepAccumulator < VISUAL_STEP) return;
    this.stepAccumulator %= VISUAL_STEP;

    for (let i = this.torches.length - 1; i >= 0; i--) {
      const t = this.torches[i];
      if (!t) continue;
      if (t.remaining <= 0) {
        this.remove(i);
      } else if (t.remaining < TORCH_DIM_SECONDS) {
        const k = t.remaining / TORCH_DIM_SECONDS;
        t.light.intensity = TORCH_INTENSITY * k;
        t.flame.scale.setScalar(k);
        this.changed = true;
      }
    }
  }

  /** Removes torch `i`, returning its light to the pool. */
  private remove(i: number): void {
    const t = this.torches[i];
    if (!t) return;
    t.light.intensity = 0;
    this.root.add(t.light);
    this.root.remove(t.object);
    this.freeLights.push(t.light);
    this.torches.splice(i, 1);
    this.syncCircles();
    this.changed = true;
  }

  /** Rebuilds `circles` from `torches`; kept as one array instance so `repellers` stays stable. */
  private syncCircles(): void {
    this.circles.length = 0;
    for (const t of this.torches) this.circles.push(t.circle);
  }
}
