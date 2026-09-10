import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DAY_FRACTION, createLighting, lightingAt, sunDirection, sunElevation } from './daycycle';

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
