import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  clockTime,
  DAY_FRACTION,
  formatClock,
  DayCycle,
  FAST_FORWARD,
  START_PHASE,
  createLighting,
  lightingAt,
  sunDirection,
  sunElevation,
} from './daycycle';

const NOON = new THREE.Vector3(40, 60, 20).normalize();

describe('sunElevation', () => {
  it('is zero at sunrise and sunset', () => {
    expect(sunElevation(0)).toBeCloseTo(0, 6);
    expect(sunElevation(DAY_FRACTION)).toBeCloseTo(0, 6);
  });

  it('is positive by day, negative by night, peaking at 0.3 and bottoming at 0.8', () => {
    for (let t = 0.01; t < DAY_FRACTION; t += 0.01) expect(sunElevation(t)).toBeGreaterThan(0);
    for (let t = DAY_FRACTION + 0.01; t < 1; t += 0.01) expect(sunElevation(t)).toBeLessThan(0);
    expect(sunElevation(0.3)).toBeCloseTo(1, 6);
    expect(sunElevation(0.8)).toBeCloseTo(-1, 6);
  });

  it('spends 60% of the cycle above the horizon', () => {
    const samples = 1000;
    let up = 0;
    for (let i = 0; i < samples; i++) if (sunElevation(i / samples) > 0) up++;
    expect(Math.abs(up / samples - DAY_FRACTION)).toBeLessThanOrEqual(1 / samples + 1e-9);
  });

  it('wraps phases outside [0, 1)', () => {
    expect(sunElevation(1.3)).toBeCloseTo(sunElevation(0.3), 6);
    expect(sunElevation(-0.2)).toBeCloseTo(sunElevation(0.8), 6);
  });
});

describe('sunDirection', () => {
  const out = new THREE.Vector3();

  it('points at the fixed noon direction at t = 0.3', () => {
    sunDirection(0.3, out);
    expect(out.distanceTo(NOON)).toBeLessThan(1e-6);
  });

  it('is horizontal and on opposite sides at sunrise and sunset', () => {
    const rise = sunDirection(0, out).clone();
    const set = sunDirection(DAY_FRACTION, out).clone();
    expect(rise.y).toBeCloseTo(0, 6);
    expect(set.y).toBeCloseTo(0, 6);
    expect(rise.clone().add(set).length()).toBeLessThan(1e-6);
    expect(rise.length()).toBeCloseTo(1, 6);
  });

  it('is the noon antipode at midnight', () => {
    sunDirection(0.8, out);
    expect(out.clone().negate().distanceTo(NOON)).toBeLessThan(1e-6);
  });

  it('has elevation equal to sunElevation scaled by the noon height', () => {
    for (let t = 0; t < 1; t += 0.05) {
      sunDirection(t, out);
      expect(out.y).toBeCloseTo(sunElevation(t) * NOON.y, 6);
    }
  });
});

const hex = (c: THREE.Color): number => c.getHex();

describe('lightingAt', () => {

  it('matches the original world constants at noon', () => {
    const l = lightingAt(1, createLighting());
    expect(hex(l.sky)).toBe(0x87ceeb);
    expect(hex(l.sunColor)).toBe(0xffffff);
    expect(l.sunIntensity).toBeCloseTo(1.2, 6);
    expect(hex(l.hemiSky)).toBe(0xffffff);
    expect(hex(l.hemiGround)).toBe(0x3fa34d);
    expect(l.hemiIntensity).toBeCloseTo(0.6, 6);
    expect(l.moonIntensity).toBe(0);
    expect(l.fogNear).toBe(60);
    expect(l.fogFar).toBe(200);
    expect(l.stars).toBe(0);
    expect(l.unlit).toBe(1);
  });

  it('dims monotonically as the sun sets and brightens the stars', () => {
    const out = createLighting();
    let prev = lightingAt(1, createLighting());
    for (let e = 0.95; e >= -1; e -= 0.05) {
      const l = lightingAt(e, out);
      expect(l.sunIntensity).toBeLessThanOrEqual(prev.sunIntensity + 1e-9);
      expect(l.hemiIntensity).toBeLessThanOrEqual(prev.hemiIntensity + 1e-9);
      expect(l.fogNear).toBeLessThanOrEqual(prev.fogNear + 1e-9);
      expect(l.fogFar).toBeLessThanOrEqual(prev.fogFar + 1e-9);
      expect(l.unlit).toBeLessThanOrEqual(prev.unlit + 1e-9);
      expect(l.stars).toBeGreaterThanOrEqual(prev.stars - 1e-9);
      prev = lightingAt(e, createLighting());
    }
  });

  it('hands over from sun to moon around the horizon', () => {
    const out = createLighting();
    expect(lightingAt(-0.05, out).sunIntensity).toBe(0);
    expect(lightingAt(-0.5, out).sunIntensity).toBe(0);
    expect(lightingAt(0.05, out).moonIntensity).toBe(0);
    expect(lightingAt(0.5, out).moonIntensity).toBe(0);
    const crossing = lightingAt(0, out);
    expect(crossing.sunIntensity).toBeCloseTo(0.1, 6);
    expect(crossing.moonIntensity).toBeCloseTo(0.05, 6);
  });

  it('is fully dark with full stars at deep night and clamps beyond the table', () => {
    const night = lightingAt(-1, createLighting());
    expect(night.stars).toBe(1);
    expect(night.moonIntensity).toBeCloseTo(0.3, 6);
    expect(night.fogNear).toBe(30);
    const beyond = lightingAt(-3, createLighting());
    expect(beyond.stars).toBe(1);
    expect(lightingAt(2, createLighting()).sunIntensity).toBeCloseTo(1.2, 6);
  });
});

const DT = 1 / 60;

function makeCycle(): {
  cycle: DayCycle;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  fog: THREE.Fog;
  grid: THREE.GridHelper;
} {
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0x87ceeb, 60, 200);
  scene.fog = fog;
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x3fa34d, 0.6);
  const grid = new THREE.GridHelper(400, 200, 0x2e7d3a, 0x2e7d3a);
  scene.add(sun, hemisphere, grid);
  const cycle = new DayCycle(scene, sun, hemisphere, fog, grid);
  return { cycle, scene, sun, hemisphere, fog, grid };
}

const camera = new THREE.Vector3(0, 5, 10);
const origin = new THREE.Vector3();

describe('DayCycle', () => {
  it('starts in the afternoon with the sun casting shadows and a daytime sky', () => {
    const { cycle, sun, fog, scene } = makeCycle();
    expect(cycle.phase).toBeCloseTo(START_PHASE, 9);
    expect(formatClock(cycle.phase)).toBe('14:00');
    expect(sun.castShadow).toBe(true);
    expect(cycle.moon.castShadow).toBe(false);
    expect(sun.position.y).toBeGreaterThan(0);
    expect(fog.near).toBeGreaterThan(50);
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect(scene.getObjectByName('sun-disc')?.visible).toBe(true);
    expect(scene.getObjectByName('moon-disc')?.visible).toBe(false);
  });

  it('applies a visual step about twice a second at normal speed', () => {
    const { cycle } = makeCycle();
    let steps = 0;
    for (let i = 0; i < 600; i++) {
      cycle.update(DT, false, camera, origin);
      if (cycle.animating) steps++;
    }
    expect(steps).toBeGreaterThanOrEqual(18);
    expect(steps).toBeLessThanOrEqual(22);
  });

  it('steps every frame while fast-forwarding and wraps the phase', () => {
    const { cycle } = makeCycle();
    for (let i = 0; i < 600; i++) {
      cycle.update(DT, true, camera, origin);
      expect(cycle.animating).toBe(true);
      expect(cycle.phase).toBeGreaterThanOrEqual(0);
      expect(cycle.phase).toBeLessThan(1);
    }
    // 10 s at 40x is 1⅓ cycles from 0.15.
    expect(cycle.phase).toBeCloseTo((START_PHASE + (600 * DT * FAST_FORWARD) / 300) % 1, 3);
  });

  it('keeps exactly one shadow caster and swaps only when both lights are dim', () => {
    const { cycle, sun } = makeCycle();
    let swaps = 0;
    let wasSun = sun.castShadow;
    for (let i = 0; i < 600; i++) {
      cycle.update(DT, true, camera, origin);
      expect(sun.castShadow).not.toBe(cycle.moon.castShadow);
      if (sun.castShadow !== wasSun) {
        swaps++;
        wasSun = sun.castShadow;
        expect(sun.intensity).toBeLessThanOrEqual(0.2);
        expect(cycle.moon.intensity).toBeLessThanOrEqual(0.2);
      }
    }
    expect(swaps).toBeGreaterThanOrEqual(2);
  });

  it('shows the moon disc and dims the grid at night', () => {
    const { cycle, scene, grid, sun } = makeCycle();
    // Fast-forward to midnight (phase 0.8) at 40x.
    const frames = Math.ceil(((0.8 - START_PHASE) * 300) / (DT * FAST_FORWARD));
    for (let i = 0; i < frames; i++) cycle.update(DT, true, camera, origin);
    expect(cycle.phase).toBeGreaterThan(0.75);
    expect(cycle.phase).toBeLessThan(0.85);
    expect(scene.getObjectByName('sun-disc')?.visible).toBe(false);
    expect(scene.getObjectByName('moon-disc')?.visible).toBe(true);
    expect(sun.intensity).toBe(0);
    expect(cycle.moon.intensity).toBeGreaterThan(0.2);
    expect(grid.material.color.r).toBeLessThan(0.3);
  });

  it('gives the moon the sun\'s shadow box with a smaller map', () => {
    const { cycle, sun } = makeCycle();
    expect(cycle.moon.shadow.mapSize.width).toBe(1024);
    expect(cycle.moon.shadow.mapSize.height).toBe(1024);
    expect(cycle.moon.shadow.camera.left).toBe(sun.shadow.camera.left);
    expect(cycle.moon.shadow.camera.right).toBe(sun.shadow.camera.right);
    expect(cycle.moon.shadow.camera.top).toBe(sun.shadow.camera.top);
    expect(cycle.moon.shadow.camera.bottom).toBe(sun.shadow.camera.bottom);
    expect(cycle.moon.shadow.camera.far).toBe(sun.shadow.camera.far);
  });

  it('keeps the sky centred on the camera', () => {
    const { cycle, scene } = makeCycle();
    const far = new THREE.Vector3(100, 3, -40);
    cycle.update(DT, false, far, origin);
    const stars = scene.getObjectByName('stars');
    const world = new THREE.Vector3();
    stars?.parent?.getWorldPosition(world);
    expect(world.distanceTo(far)).toBeLessThan(1e-6);
  });
});

describe('DayCycle shadow frustum', () => {
  it('follows the focus, snapped to within one shadow texel', () => {
    const { cycle, sun, scene } = makeCycle();
    const focus = new THREE.Vector3(31.37, 0, -22.91);
    cycle.update(DT, false, camera, focus);
    const texel = 80 / 2048;
    expect(sun.target.position.distanceTo(focus)).toBeLessThan(texel);
    expect(cycle.moon.target.position.distanceTo(focus)).toBeLessThan(80 / 1024);
    expect(sun.target.parent).toBe(scene);
    expect(cycle.moon.target.parent).toBe(scene);
  });

  it('keeps both lights 75 m from the focus on opposite sides', () => {
    const { cycle, sun } = makeCycle();
    const focus = new THREE.Vector3(-12, 0, 8);
    cycle.update(DT, false, camera, focus);
    const toSun = sun.position.clone().sub(sun.target.position);
    const toMoon = cycle.moon.position.clone().sub(cycle.moon.target.position);
    expect(toSun.length()).toBeCloseTo(75, 6);
    expect(toMoon.length()).toBeCloseTo(75, 6);
    expect(toSun.clone().add(toMoon).length()).toBeLessThan(1e-6);
    expect(toSun.y).toBeGreaterThan(0);
  });

  it('does not shimmer: a sub-texel move only slides the target along the light ray', () => {
    const { cycle, sun } = makeCycle();
    const focus = new THREE.Vector3(10.02, 0, 5.01);
    cycle.update(DT, false, camera, focus);
    const before = sun.target.position.clone();
    focus.x += 0.005;
    cycle.update(DT, false, camera, focus);
    const delta = sun.target.position.clone().sub(before);
    const ray = sun.position.clone().sub(sun.target.position);
    // Movement along the ray changes nothing on the shadow map; any sideways part would.
    expect(delta.clone().cross(ray).length()).toBeLessThan(1e-6);
  });
});

describe('clockTime', () => {
  it('maps sunrise, noon, sunset and midnight to wall-clock hours', () => {
    expect(clockTime(0)).toEqual({ hours: 6, minutes: 0 });
    expect(clockTime(0.3)).toEqual({ hours: 12, minutes: 0 });
    expect(clockTime(DAY_FRACTION)).toEqual({ hours: 18, minutes: 0 });
    expect(clockTime(0.8)).toEqual({ hours: 0, minutes: 0 });
    expect(clockTime(0.15)).toEqual({ hours: 9, minutes: 0 });
  });

  it('runs at different rates by day and night but stays monotonic within each', () => {
    let prev = -1;
    for (let t = 0; t < 1; t += 0.001) {
      const { hours, minutes } = clockTime(t);
      const mins = ((hours - 6 + 24) % 24) * 60 + minutes;
      expect(mins).toBeGreaterThanOrEqual(prev);
      prev = mins;
    }
  });

  it('formats with two digits', () => {
    expect(formatClock(0)).toBe('06:00');
    expect(formatClock(0.8)).toBe('00:00');
    expect(formatClock(0.975)).toBe('05:15');
  });
});
