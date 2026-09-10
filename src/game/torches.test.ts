import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Colliders } from './collision';
import { FAST_FORWARD } from './daycycle';
import {
  MAX_TORCHES,
  TORCH_DIM_SECONDS,
  TORCH_INTENSITY,
  TORCH_LIFETIME,
  TORCH_REPEL_RADIUS,
  TORCH_SPACING,
  Torches,
} from './torches';

const DT = 1 / 60;

function pointLights(scene: THREE.Scene): THREE.PointLight[] {
  const lights: THREE.PointLight[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.PointLight) lights.push(o);
  });
  return lights;
}

function totalIntensity(scene: THREE.Scene): number {
  return pointLights(scene).reduce((sum, l) => sum + l.intensity, 0);
}

function make(): { scene: THREE.Scene; torches: Torches; colliders: Colliders } {
  const scene = new THREE.Scene();
  return { scene, torches: new Torches(scene), colliders: new Colliders() };
}

const at = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0.3, z);

describe('Torches placement', () => {
  it('creates the whole light pool up front, all dark', () => {
    const { scene } = make();
    expect(pointLights(scene)).toHaveLength(MAX_TORCHES);
    expect(totalIntensity(scene)).toBe(0);
  });

  it('place adds a torch on the ground, lights one pool light and sets animating', () => {
    const { scene, torches, colliders } = make();
    expect(torches.animating).toBe(false);
    expect(torches.place(at(2, 3), colliders)).toBe(true);
    expect(torches.count).toBe(1);
    expect(torches.animating).toBe(true);
    expect(pointLights(scene)).toHaveLength(MAX_TORCHES);
    expect(totalIntensity(scene)).toBeCloseTo(TORCH_INTENSITY);
    const lit = pointLights(scene).find((l) => l.intensity > 0);
    if (!lit) throw new Error('no lit light');
    const world = lit.getWorldPosition(new THREE.Vector3());
    expect(world.x).toBeCloseTo(2);
    expect(world.z).toBeCloseTo(3);
    expect(world.y).toBeGreaterThan(0.5);
  });

  it('refuses a torch within TORCH_SPACING of another and keeps the count', () => {
    const { torches, colliders } = make();
    torches.place(at(0, 0), colliders);
    expect(torches.place(at(TORCH_SPACING * 0.9, 0), colliders)).toBe(false);
    expect(torches.count).toBe(1);
    expect(torches.place(at(TORCH_SPACING * 1.1, 0), colliders)).toBe(true);
    expect(torches.count).toBe(2);
  });

  it('refuses a torch inside a collider', () => {
    const { torches, colliders } = make();
    colliders.add({ kind: 'circle', x: 5, z: 5, radius: 0.6 });
    expect(torches.place(at(5, 5), colliders)).toBe(false);
    expect(torches.count).toBe(0);
    expect(torches.place(at(5, 7), colliders)).toBe(true);
  });

  it('an extra torch beyond the cap removes the oldest and reuses its light', () => {
    const { scene, torches, colliders } = make();
    for (let i = 0; i < MAX_TORCHES; i++) torches.place(at(i * 3, 0), colliders);
    expect(torches.count).toBe(MAX_TORCHES);
    expect(torches.place(at(0, 10), colliders)).toBe(true);
    expect(torches.count).toBe(MAX_TORCHES);
    expect(pointLights(scene)).toHaveLength(MAX_TORCHES);
    expect(totalIntensity(scene)).toBeCloseTo(TORCH_INTENSITY * MAX_TORCHES);
    // The oldest stood at x = 0, z = 0; nothing remains there.
    expect(torches.repellers.some((c) => c.position.x === 0 && c.position.z === 0)).toBe(false);
  });

  it('repellers has one circle per live torch with the repel radius', () => {
    const { torches, colliders } = make();
    torches.place(at(1, 1), colliders);
    torches.place(at(4, 4), colliders);
    expect(torches.repellers).toHaveLength(2);
    for (const c of torches.repellers) expect(c.radius).toBe(TORCH_REPEL_RADIUS);
    expect(torches.repellers[0]?.position.y).toBe(0);
  });
});

/**
 * Runs `seconds` of wall-clock time as real 60 fps frames, feeding `dt` (scaled by the
 * caller for fast-forward) into each `update` call; returns how many frames reported animating.
 */
function run(torches: Torches, seconds: number, dt = DT): number {
  let animatingFrames = 0;
  const frames = Math.ceil(seconds / DT);
  for (let i = 0; i < frames; i++) {
    torches.update(dt);
    if (torches.animating) animatingFrames++;
  }
  return animatingFrames;
}

describe('Torches lifetime', () => {
  it('burns at full intensity, without animating, until the dim phase', () => {
    const { scene, torches, colliders } = make();
    torches.place(at(0, 0), colliders);
    torches.update(DT); // clears the placement flag
    const quiet = TORCH_LIFETIME - TORCH_DIM_SECONDS - 1;
    expect(run(torches, quiet)).toBe(0);
    expect(totalIntensity(scene)).toBeCloseTo(TORCH_INTENSITY);
    expect(torches.count).toBe(1);
  });

  it('dims monotonically over the last TORCH_DIM_SECONDS and then goes out', () => {
    const { scene, torches, colliders } = make();
    torches.place(at(0, 0), colliders);
    run(torches, TORCH_LIFETIME - TORCH_DIM_SECONDS);
    const samples: number[] = [];
    let elapsed = 0;
    while (torches.count > 0 && elapsed < TORCH_DIM_SECONDS + 1) {
      torches.update(DT);
      elapsed += DT;
      if (torches.animating) samples.push(totalIntensity(scene));
    }
    expect(torches.count).toBe(0);
    expect(samples.length).toBeGreaterThan(10);
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const cur = samples[i];
      if (prev === undefined || cur === undefined) throw new Error('missing sample');
      expect(cur).toBeLessThanOrEqual(prev);
    }
    expect(totalIntensity(scene)).toBe(0);
    expect(torches.repellers).toHaveLength(0);
    expect(pointLights(scene)).toHaveLength(MAX_TORCHES);
  });

  it('applies visual changes in coarse steps, not every frame', () => {
    const { torches, colliders } = make();
    torches.place(at(0, 0), colliders);
    run(torches, TORCH_LIFETIME - TORCH_DIM_SECONDS);
    // One second of dimming at 60 fps: two 0.5 s steps (allow one extra).
    const steps = run(torches, 1);
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(steps).toBeLessThanOrEqual(3);
  });

  it('does not inflate the coarse-step rate after a fast-forward burst (accumulator residue)', () => {
    const { torches, colliders } = make();
    torches.place(at(0, 0), colliders);
    // Fast-forward a little past the edge of the dim window, building a large
    // accumulator debt (each fast-forward frame owes more than one VISUAL_STEP).
    const pastEdge = (TORCH_LIFETIME - TORCH_DIM_SECONDS) / FAST_FORWARD + 0.1;
    run(torches, pastEdge, DT * FAST_FORWARD);
    expect(torches.count).toBe(1); // dimming, not yet expired

    // One second of dimming at normal speed should still cap at the coarse-step
    // rate (~2-3 per second), regardless of the debt built up during fast-forward.
    const steps = run(torches, 1);
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(3);
  });

  it('a scaled dt ages a torch faster (fast-forward)', () => {
    const { torches, colliders } = make();
    torches.place(at(0, 0), colliders);
    run(torches, TORCH_LIFETIME / FAST_FORWARD + 1, DT * FAST_FORWARD);
    expect(torches.count).toBe(0);
  });

  it('a lit torch that expires frees its light for the next placement', () => {
    const { scene, torches, colliders } = make();
    torches.place(at(0, 0), colliders);
    run(torches, TORCH_LIFETIME + 1);
    expect(torches.count).toBe(0);
    for (let i = 0; i < MAX_TORCHES; i++) expect(torches.place(at(i * 3, 5), colliders)).toBe(true);
    expect(totalIntensity(scene)).toBeCloseTo(TORCH_INTENSITY * MAX_TORCHES);
  });
});
