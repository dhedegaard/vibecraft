import { describe, expect, it } from 'vitest';
import { ActionTimer } from './weapons';

const DT = 1 / 60;

describe('ActionTimer', () => {
  it('is idle until started and stops itself on completion', () => {
    const timer = new ActionTimer();
    expect(timer.active).toBe(false);

    timer.start();
    expect(timer.active).toBe(true);

    let t = 0;
    let steps = 0;
    while (timer.active) {
      t = timer.advance(DT, 0.5);
      steps++;
    }
    expect(t).toBe(1);
    // 0.5 s at 60 fps, allowing one extra step for float accumulation.
    expect(steps).toBeGreaterThanOrEqual(30);
    expect(steps).toBeLessThanOrEqual(31);
  });

  it('reports progress as a fraction of the duration', () => {
    const timer = new ActionTimer();
    timer.start();
    expect(timer.advance(0.25, 1)).toBeCloseTo(0.25);
    expect(timer.advance(0.25, 1)).toBeCloseTo(0.5);
  });

  it('crosses a point on exactly one step', () => {
    const timer = new ActionTimer();
    timer.start();
    const crossings: number[] = [];
    for (let i = 0; i < 40; i++) {
      timer.advance(DT, 0.5);
      if (timer.crossed(0.65)) crossings.push(i);
    }
    expect(crossings).toHaveLength(1);
    // 0.65 of 0.5 s is 0.325 s, which the 20th step (index 19) reaches.
    expect(crossings[0]).toBe(19);
  });

  it('crosses 0 on the first step after start', () => {
    const timer = new ActionTimer();
    timer.start();
    timer.advance(DT, 0.3);
    expect(timer.crossed(0)).toBe(true);
    timer.advance(DT, 0.3);
    expect(timer.crossed(0)).toBe(false);
  });

  it('crosses a point even when a large step jumps past it to completion', () => {
    const timer = new ActionTimer();
    timer.start();
    timer.advance(1, 0.5);
    expect(timer.crossed(0.65)).toBe(true);
    expect(timer.active).toBe(false);
  });

  it('restarts cleanly', () => {
    const timer = new ActionTimer();
    timer.start();
    timer.advance(1, 0.5);
    timer.start();
    timer.advance(DT, 0.5);
    expect(timer.crossed(0)).toBe(true);
    expect(timer.crossed(0.65)).toBe(false);
  });

  it('stop() ends the action without crossing anything', () => {
    const timer = new ActionTimer();
    timer.start();
    timer.stop();
    expect(timer.active).toBe(false);
  });
});
