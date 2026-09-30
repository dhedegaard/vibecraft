import { describe, expect, it } from 'vitest';
import { shoveStep } from './knockback';

const DT = 1 / 60;

/** Every per-frame step of a shove from t = 0 until it stops moving. */
function steps(distance: number, duration: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < duration + DT; t += DT) out.push(shoveStep(distance, duration, t, DT));
  return out;
}

describe('shoveStep', () => {
  it('covers exactly the shove distance in total', () => {
    const total = steps(2, 0.3).reduce((sum, d) => sum + d, 0);
    expect(total).toBeCloseTo(2, 6);
  });

  it('is fastest at the start and eases out', () => {
    const moving = steps(2, 0.3).filter((d) => d > 0);
    expect(moving.length).toBeGreaterThan(2);
    for (let i = 1; i < moving.length; i++) expect(moving[i]).toBeLessThan(moving[i - 1] ?? Infinity);
  });

  it('does not move once the duration has passed', () => {
    expect(shoveStep(2, 0.3, 0.3, DT)).toBe(0);
    expect(shoveStep(2, 0.3, 1, DT)).toBe(0);
  });

  it('adds up the same at a coarser frame step', () => {
    let total = 0;
    for (let t = 0; t < 0.3; t += 0.05) total += shoveStep(2, 0.3, t, 0.05);
    expect(total).toBeCloseTo(2, 6);
  });
});
