import { describe, expect, it } from 'vitest';
import { Axe } from './axe';

const DT = 1 / 60;

/** Runs a whole swing, recording the shoulder angle each frame and the frames a strike fired on. */
function runSwing(axe: Axe): { angles: number[]; strikes: number[] } {
  const angles: number[] = [];
  const strikes: number[] = [];
  axe.swing();
  for (let i = 0; axe.swinging && i < 1000; i++) {
    const action = axe.update(DT);
    angles.push(axe.angle);
    if (action?.kind === 'strike') strikes.push(i);
  }
  return { angles, strikes };
}

describe('Axe', () => {
  it('starts at rest, unlocked, and does nothing when idle', () => {
    const axe = new Axe();
    expect(axe.swinging).toBe(false);
    expect(axe.armLocked).toBe(false);
    expect(axe.update(DT)).toBeUndefined();
  });

  it('strikes exactly once per swing and returns to rest', () => {
    const axe = new Axe();
    const rest = axe.angle;
    const { angles, strikes } = runSwing(axe);

    expect(strikes).toHaveLength(1);
    expect(axe.swinging).toBe(false);
    expect(axe.angle).toBeCloseTo(rest);
    // 0.75 s at 60 fps, allowing one extra step for float accumulation.
    expect(angles.length).toBeGreaterThanOrEqual(45);
    expect(angles.length).toBeLessThanOrEqual(46);
  });

  it('locks the arm only while swinging', () => {
    const axe = new Axe();
    axe.swing();
    expect(axe.armLocked).toBe(true);
    runSwing(axe);
    expect(axe.armLocked).toBe(false);
  });

  it('ignores a swing request mid-swing', () => {
    const axe = new Axe();
    axe.swing();
    axe.update(DT);
    const angle = axe.angle;
    axe.swing();
    // A restarted swing would have snapped back toward the rest angle.
    axe.update(DT);
    expect(axe.angle).toBeLessThan(angle);
  });

  it('swings overhead and in front: never behind the rest pose, forward at the hit', () => {
    const axe = new Axe();
    const rest = axe.angle;
    const { angles, strikes } = runSwing(axe);
    const hitFrame = strikes[0];
    if (hitFrame === undefined) throw new Error('no strike');

    // Positive angles swing the arm backwards; the chop must stay in front.
    for (const a of angles) expect(a).toBeLessThanOrEqual(rest + 1e-9);
    expect(angles[hitFrame]).toBeLessThan(0);

    // Raise (angle decreasing) then chop and recover (angle increasing), with the top before the hit.
    const top = angles.indexOf(Math.min(...angles));
    expect(top).toBeLessThan(hitFrame);
    for (let i = 1; i <= top; i++) expect(angles[i]).toBeLessThanOrEqual(angles[i - 1] ?? Infinity);
    for (let i = top + 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1] ?? -Infinity);
  });

  it('eases into the raise rather than snapping to the wind-up pose', () => {
    const axe = new Axe();
    const rest = axe.angle;
    axe.swing();
    axe.update(DT);
    // One frame in, the arm has moved only a little from rest.
    expect(Math.abs(axe.angle - rest)).toBeLessThan(0.5);
  });
});
