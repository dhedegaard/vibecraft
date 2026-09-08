import { describe, expect, it } from 'vitest';
import { Sword } from './sword';

const DT = 1 / 60;

describe('Sword', () => {
  it('strikes once per swing and returns the arm and wrist to rest', () => {
    const sword = new Sword();
    const rest = sword.angle;
    const grip = sword.model.rotation.x;

    sword.swing();
    let strikes = 0;
    let frames = 0;
    while (sword.swinging && frames < 1000) {
      if (sword.update(DT)?.kind === 'strike') strikes++;
      frames++;
    }

    expect(strikes).toBe(1);
    // 0.6 s at 60 fps, allowing one extra step for float accumulation.
    expect(frames).toBeGreaterThanOrEqual(36);
    expect(frames).toBeLessThanOrEqual(37);
    expect(sword.angle).toBeCloseTo(rest);
    expect(sword.model.rotation.x).toBeCloseTo(grip);
  });

  it('twists the wrist during the strike', () => {
    const sword = new Sword();
    const grip = sword.model.rotation.x;
    sword.swing();
    let twisted = false;
    while (sword.swinging) {
      sword.update(DT);
      if (Math.abs(sword.model.rotation.x - grip) > 0.1) twisted = true;
    }
    expect(twisted).toBe(true);
  });

  it('locks the arm exactly while swinging', () => {
    const sword = new Sword();
    expect(sword.armLocked).toBe(false);
    sword.swing();
    expect(sword.armLocked).toBe(true);
  });

  it('cancel aborts the swing, resets the pose and suppresses the strike', () => {
    const sword = new Sword();
    const rest = sword.angle;
    const grip = sword.model.rotation.x;

    sword.swing();
    for (let i = 0; i < 5; i++) sword.update(DT);
    sword.cancel();

    expect(sword.swinging).toBe(false);
    expect(sword.angle).toBe(rest);
    expect(sword.model.rotation.x).toBe(grip);
    expect(sword.update(DT)).toBeUndefined();
  });
});
