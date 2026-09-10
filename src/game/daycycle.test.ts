import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DAY_FRACTION, sunDirection, sunElevation } from './daycycle';

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
